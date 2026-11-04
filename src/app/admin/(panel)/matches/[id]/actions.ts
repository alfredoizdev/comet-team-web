"use server";

import { randomUUID } from "node:crypto";
import { assertCanManage, requireMember } from "@/lib/auth/members";
import type { ClipWithPlayer, Project, Video } from "@/lib/db/types";
import { deleteObjects, headObject, presignGet } from "@/lib/r2/client";
import { customClipKey } from "@/lib/r2/keys";
import { hlsMasterUrl } from "@/lib/videos/hls";
import { validateClipRange } from "@/lib/videos/clip-range";
import { parseYouTubeUrl } from "@/lib/videos/youtube";
import * as repo from "@/lib/videos/repo";
import { describeVideo, type VideoView } from "@/lib/videos/status";

export type MatchState = {
  project: Project;
  video: Video | null;
  clips: ClipWithPlayer[];
  /** Player names already saved for this team (for the picker). */
  players: string[];
  view: VideoView;
  /** `source` is the HLS master playlist once the streaming copy exists, else the signed master file. */
  urls: { source: string | null; reel: string | null; clips: Record<string, string> };
  /** Bytes of the uploaded master still in R2 (for the "Delete original" button), null when gone or YouTube. */
  sourceSize: number | null;
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
  const players = await repo.listPlayerNames(project.team);
  if (!video) return { project, video, clips: [], players, view, urls: { source: null, reel: null, clips: {} }, sourceSize: null, youtubeId: null };
  const youtubeId = video.source_url ? (parseYouTubeUrl(video.source_url)?.id ?? null) : null;

  const clips = await repo.listClips(video.id);
  const ready = clips.filter((c) => c.score > 0);
  const hasMaster = !video.source_deleted_at && !youtubeId;
  const [source, reel, clipUrls, head] = await Promise.all([
    video.hls_path ? hlsMasterUrl(video.id) : hasMaster ? presignGet(video.file_path) : null,
    video.highlight_reel_path ? presignGet(video.highlight_reel_path) : null,
    Promise.all(ready.map(async (c) => [c.id, await presignGet(c.file_path)] as const)),
    hasMaster ? headObject(video.file_path) : null,
  ]);
  return { project, video, clips, players, view, urls: { source, reel, clips: Object.fromEntries(clipUrls) }, sourceSize: head?.size ?? null, youtubeId };
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
    // The current reel keeps playing; the worker rebuilds it in the background.
    await repo.updateVideo(found.video.id, { reel_stale: true });
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

/** Names (or clears) the player on a clip; new names are remembered for the team. */
export async function assignPlayer(clipId: string, name: string | null): Promise<void> {
  const m = await requireMember();
  const found = await repo.getClipWithVideo(clipId);
  if (!found) throw new Error("Clip not found");
  assertCanManage(m, found.project.team);
  const trimmed = name?.trim() ?? "";
  const playerId = trimmed ? await repo.rememberPlayer(found.project.team, trimmed) : null;
  await repo.setClipPlayer(clipId, playerId);
}
