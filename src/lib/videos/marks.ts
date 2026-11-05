// "Mark while watching, cut later": each mark becomes a clip 5 s before / 10 s after it.
import { MAX_CLIP_SECONDS } from "@/lib/videos/clip-range";

export const MARK_BEFORE_SECONDS = 5;
export const MARK_AFTER_SECONDS = 10;
/** Marks closer than this are the same play and share one clip. */
const MERGE_GAP_SECONDS = 5;

export type MarkPlan = { ranges: [number, number][]; skipped: number[] };

/**
 * Turns marks (seconds) into clip ranges. Nearby marks merge into one clip (never
 * longer than MAX_CLIP_SECONDS); a mark whose range matches an existing clip is skipped.
 */
export function planClipsFromMarks(marks: number[], duration: number, existing: { start: number; end: number }[]): MarkPlan {
  const sorted = Array.from(new Set(marks.map((m) => Math.round(m * 10) / 10))).sort((a, b) => a - b);
  const groups: number[][] = [];
  for (const m of sorted) {
    const g = groups[groups.length - 1];
    if (g && m - g[g.length - 1] <= MERGE_GAP_SECONDS && m + MARK_AFTER_SECONDS - (g[0] - MARK_BEFORE_SECONDS) <= MAX_CLIP_SECONDS) g.push(m);
    else groups.push([m]);
  }
  const ranges: [number, number][] = [];
  const skipped: number[] = [];
  for (const g of groups) {
    const start = Math.max(0, g[0] - MARK_BEFORE_SECONDS);
    const end = Math.min(duration, g[g.length - 1] + MARK_AFTER_SECONDS);
    const dup = existing.some((c) => Math.abs(c.start - start) < 0.5 && Math.abs(c.end - end) < 0.5);
    if (dup) skipped.push(...g);
    else ranges.push([start, end]);
  }
  return { ranges, skipped };
}
