// Service-role data access for match marks ("Mark while watching"). Separate from
// repo.ts so it can be mocked on its own in tests.
import { createServiceClient } from "@/lib/supabase/server";

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`${context}: ${error?.message ?? "unknown error"}`);
}

/** Mark times (seconds) of a video, ascending. */
export async function listMarks(videoId: string): Promise<number[]> {
  const { data, error } = await createServiceClient().from("video_marks").select("time_seconds").eq("video_id", videoId).order("time_seconds");
  if (error) fail("listMarks", error);
  return (data ?? []).map((row) => Number(row.time_seconds));
}

export async function insertMark(videoId: string, timeSeconds: number): Promise<void> {
  const { error } = await createServiceClient().from("video_marks").insert({ video_id: videoId, time_seconds: timeSeconds });
  if (error) fail("insertMark", error);
}

export async function deleteMark(videoId: string, timeSeconds: number): Promise<void> {
  const { error } = await createServiceClient().from("video_marks").delete().eq("video_id", videoId).eq("time_seconds", timeSeconds);
  if (error) fail("deleteMark", error);
}

export async function deleteMarksForVideo(videoId: string): Promise<void> {
  const { error } = await createServiceClient().from("video_marks").delete().eq("video_id", videoId);
  if (error) fail("deleteMarksForVideo", error);
}
