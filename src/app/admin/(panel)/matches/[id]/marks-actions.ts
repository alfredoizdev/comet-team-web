"use server";

// Marks set while watching the full match. Stored per video so every coach and
// device sees the same list; cleared once clips are created from them.
import { assertCanManage, requireMember } from "@/lib/auth/members";
import * as marksRepo from "@/lib/videos/marks-repo";
import * as repo from "@/lib/videos/repo";
import { describeVideo } from "@/lib/videos/status";

/** Two marks closer than this are the same play; the second one is ignored. */
const SAME_MARK_SECONDS = 1;

async function requireCuttable(videoId: string) {
  const m = await requireMember();
  const found = await repo.getVideoWithProject(videoId);
  if (!found) throw new Error("Video not found");
  assertCanManage(m, found.project.team);
  if (!describeVideo(found.video).canCut) throw new Error("Can't mark this video: the full match is no longer available");
  return found.video;
}

/** Adds a mark (rounded to 0.1 s) and returns the video's marks, ascending. */
export async function addMark(videoId: string, timeSeconds: number): Promise<number[]> {
  const video = await requireCuttable(videoId);
  const t = Math.round(timeSeconds * 10) / 10;
  if (!Number.isFinite(t) || t < 0 || t > (video.duration ?? 0)) throw new Error("Mark is outside the video");
  const existing = await marksRepo.listMarks(videoId);
  if (existing.some((m) => Math.abs(m - t) < SAME_MARK_SECONDS)) return existing;
  await marksRepo.insertMark(videoId, t);
  return marksRepo.listMarks(videoId);
}

/** Removes one mark and returns the remaining marks. */
export async function removeMark(videoId: string, timeSeconds: number): Promise<number[]> {
  await requireCuttable(videoId);
  await marksRepo.deleteMark(videoId, timeSeconds);
  return marksRepo.listMarks(videoId);
}

export async function clearMarks(videoId: string): Promise<void> {
  await requireCuttable(videoId);
  await marksRepo.deleteMarksForVideo(videoId);
}
