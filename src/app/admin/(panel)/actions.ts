"use server";

import { revalidatePath } from "next/cache";
import { assertCanManage, requireMember } from "@/lib/auth/members";
import type { Team } from "@/lib/db/types";
import { reelKey } from "@/lib/r2/keys";
import { deleteObjects, presignGet } from "@/lib/r2/client";
import * as repo from "@/lib/videos/repo";
import { describeVideo } from "@/lib/videos/status";

export async function createMatch(input: {
  title: string;
  team: Team;
  matchDate: string | null;
  opponent: string | null;
}): Promise<{ id: string }> {
  const m = await requireMember();
  assertCanManage(m, input.team);
  const title = input.title.trim();
  if (!title) throw new Error("Title is required");
  const opponent = input.opponent?.trim() || null;
  const project = await repo.insertProject({
    user_id: m.userId,
    title,
    team: input.team,
    match_date: input.matchDate || null,
    opponent,
  });
  if (opponent) await repo.rememberOpponent(opponent);
  revalidatePath("/admin");
  return { id: project.id };
}

export async function listOpponents(): Promise<string[]> {
  await requireMember();
  return repo.listOpponentNames();
}

export type MatchListRow = repo.MatchRow & { thumbUrl: string | null };

export async function listMatches(): Promise<MatchListRow[]> {
  const m = await requireMember();
  const rows = await repo.listMatchRows(m.role === "admin" ? null : m.team);
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      thumbUrl: row.video?.highlight_reel_path ? await presignGet(row.video.highlight_reel_path) : null,
    })),
  );
}

export async function setPublished(videoId: string, published: boolean): Promise<void> {
  const m = await requireMember();
  const found = await repo.getVideoWithProject(videoId);
  if (!found) throw new Error("Video not found");
  assertCanManage(m, found.project.team);
  if (published && !describeVideo(found.video).canPublish) throw new Error("Video is not ready to publish");
  await repo.updateVideo(videoId, {
    is_published: published,
    published_at: published ? new Date().toISOString() : null,
  });
  revalidatePath(`/${found.project.team}`);
  revalidatePath("/admin");
}

/** Port of PeakClip `reprocessVideo`: drop clips + reel and queue the video again. */
export async function reprocessMatch(videoId: string): Promise<void> {
  const m = await requireMember();
  const found = await repo.getVideoWithProject(videoId);
  if (!found) throw new Error("Video not found");
  assertCanManage(m, found.project.team);
  if (found.video.source_deleted_at) throw new Error("Source video was removed");
  const clips = await repo.listClips(videoId);
  await deleteObjects([...clips.map((c) => c.file_path), reelKey(videoId)]);
  await repo.deleteClipsForVideo(videoId);
  await repo.updateVideo(videoId, {
    status: "uploaded",
    error_message: null,
    highlight_reel_path: null,
    is_published: false,
    published_at: null,
  });
  revalidatePath(`/${found.project.team}`);
  revalidatePath("/admin");
}

export async function deleteMatch(projectId: string): Promise<void> {
  const m = await requireMember();
  const project = await repo.getProject(projectId);
  if (!project) throw new Error("Match not found");
  assertCanManage(m, project.team);
  const video = await repo.getVideoForProject(projectId);
  if (video) {
    const clips = await repo.listClips(video.id);
    const keys = [...clips.map((c) => c.file_path), reelKey(video.id)];
    if (!video.source_deleted_at) keys.push(video.file_path);
    await deleteObjects(keys);
  }
  await repo.deleteProjectRow(projectId);
  revalidatePath(`/${project.team}`);
  revalidatePath("/admin");
}
