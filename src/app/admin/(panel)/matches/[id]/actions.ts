"use server";

import { randomUUID } from "node:crypto";
import { assertCanManage, requireMember } from "@/lib/auth/members";
import type { Clip, Project, Video } from "@/lib/db/types";
import { deleteObjects, presignGet } from "@/lib/r2/client";
import { customClipKey } from "@/lib/r2/keys";
import { validateClipRange } from "@/lib/videos/clip-range";
import { parseYouTubeUrl } from "@/lib/videos/youtube";
import * as repo from "@/lib/videos/repo";
import { describeVideo, type VideoView } from "@/lib/videos/status";

export type MatchState = {
  project: Project;
  video: Video | null;
  clips: Clip[];
  view: VideoView;
  urls: { source: string | null; reel: string | null; clips: Record<string, string> };
  /** YouTube video id when the match was imported from a link (full match is streamed from YouTube). */
  youtubeId: string | null;
};

export async function getMatchState(projectId: string): Promise<MatchState | null> {
  const m = await requireMember();
  const project = await repo.getProject(projectId);
  if (!project) return null;
  assertCanManage(m, project.team);

  const video = await repo.getVideoForProject(projectId);
  const view = describeVideo(video);
  if (!video) return { project, video, clips: [], view, urls: { source: null, reel: null, clips: {} }, youtubeId: null };
  const youtubeId = video.source_url ? (parseYouTubeUrl(video.source_url)?.id ?? null) : null;

  const clips = await repo.listClips(video.id);
  const ready = clips.filter((c) => c.score > 0);
  const [source, reel, clipUrls] = await Promise.all([
    video.source_deleted_at || youtubeId ? null : presignGet(video.file_path),
    video.highlight_reel_path ? presignGet(video.highlight_reel_path) : null,
    Promise.all(ready.map(async (c) => [c.id, await presignGet(c.file_path)] as const)),
  ]);
  return { project, video, clips, view, urls: { source, reel, clips: Object.fromEntries(clipUrls) }, youtubeId };
}

export async function createCustomClip(videoId: string, start: number, end: number): Promise<{ clipId: string }> {
  const m = await requireMember();
  const found = await repo.getVideoWithProject(videoId);
  if (!found) throw new Error("Video not found");
  assertCanManage(m, found.project.team);
  if (!describeVideo(found.video).canCut) throw new Error("Can't cut clips for this video");
  const range = validateClipRange(start, end, found.video.duration ?? 0);
  if (!range.ok) throw new Error(range.reason);

  const clipId = randomUUID();
  await repo.insertClip({
    id: clipId,
    video_id: videoId,
    start_time: start,
    end_time: end,
    score: 0,
    file_path: customClipKey(videoId, clipId),
  });
  return { clipId };
}

/** Port of PeakClip gallery `deleteClip`: remove the file and row, mark the reel stale. */
export async function deleteClip(clipId: string): Promise<void> {
  const m = await requireMember();
  const found = await repo.getClipWithVideo(clipId);
  if (!found) throw new Error("Clip not found");
  assertCanManage(m, found.project.team);
  await deleteObjects([found.clip.file_path]);
  await repo.deleteClipRow(clipId);

  const remaining = (await repo.listClips(found.video.id)).filter((c) => c.id !== clipId && c.score > 0);
  if (remaining.length > 0) {
    // The worker rebuilds the reel from the clips that are left.
    await repo.updateVideo(found.video.id, { highlight_reel_path: null });
    return;
  }
  // Nothing left to build a reel from: take it down and tell the coach.
  if (found.video.highlight_reel_path) await deleteObjects([found.video.highlight_reel_path]);
  await repo.updateVideo(found.video.id, {
    highlight_reel_path: null,
    is_published: false,
    published_at: null,
    status: "error",
    error_message: "no_clips",
  });
}
