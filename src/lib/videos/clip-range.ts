export const MIN_CLIP_SECONDS = 1;
export const MAX_CLIP_SECONDS = 60;

export type ClipRangeResult = { ok: true } | { ok: false; reason: string };

/** A custom clip must be 1–60 s long and lie inside the video. */
export function validateClipRange(start: number, end: number, duration: number): ClipRangeResult {
  if (start < 0 || end > duration) return { ok: false, reason: "Clip is outside the video" };
  const length = end - start;
  if (length < MIN_CLIP_SECONDS) return { ok: false, reason: "Clip must be at least 1 second" };
  if (length > MAX_CLIP_SECONDS) return { ok: false, reason: "Clip can't be longer than 60 seconds" };
  return { ok: true };
}
