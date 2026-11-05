import { describe, expect, it } from "vitest";
import { planClipsFromMarks } from "@/lib/videos/marks";

describe("planClipsFromMarks", () => {
  it("cuts 5 s before and 10 s after each mark", () => {
    expect(planClipsFromMarks([100, 300], 2000, [])).toEqual({ ranges: [[95, 110], [295, 310]], skipped: [] });
  });
  it("clamps to the start and end of the video", () => {
    expect(planClipsFromMarks([2, 1995], 2000, []).ranges).toEqual([[0, 12], [1990, 2000]]);
  });
  it("merges marks that are within 5 s of each other into one clip", () => {
    expect(planClipsFromMarks([100, 103, 107], 2000, []).ranges).toEqual([[95, 117]]);
  });
  it("never merges past the 60 s clip limit", () => {
    const marks = [100, 104, 108, 112, 116, 120, 124, 128, 132, 136, 140, 144, 148, 152, 156];
    const { ranges } = planClipsFromMarks(marks, 2000, []);
    for (const [s, e] of ranges) expect(e - s).toBeLessThanOrEqual(60);
    expect(ranges.length).toBeGreaterThan(1);
  });
  it("skips a mark whose clip already exists and reports it", () => {
    const out = planClipsFromMarks([100, 300], 2000, [{ start: 95, end: 110 }]);
    expect(out.ranges).toEqual([[295, 310]]);
    expect(out.skipped).toEqual([100]);
  });
  it("sorts marks and drops exact repeats", () => {
    expect(planClipsFromMarks([300, 100, 100], 2000, []).ranges).toEqual([[95, 110], [295, 310]]);
  });
});
