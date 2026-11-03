import { describe, it, expect } from "vitest";

// Clip boundary logic extracted from process.ts
function calculateClipBounds(
  peakSecond: number,
  duration: number,
  beforeSec = 5,
  afterSec = 10
) {
  const start = Math.max(0, peakSecond - beforeSec);
  const end = Math.min(duration, peakSecond + afterSec);
  return { start, end, duration: end - start };
}

describe("clip boundary calculation", () => {
  it("creates 15s clip for peak in middle of video", () => {
    const { start, end, duration } = calculateClipBounds(60, 120);
    expect(start).toBe(55);
    expect(end).toBe(70);
    expect(duration).toBe(15);
  });

  it("clamps start to 0 for peak near beginning", () => {
    const { start, end } = calculateClipBounds(3, 120);
    expect(start).toBe(0);
    expect(end).toBe(13);
  });

  it("clamps end to duration for peak near end", () => {
    const { start, end } = calculateClipBounds(118, 120);
    expect(start).toBe(113);
    expect(end).toBe(120);
  });

  it("clamps both for very short video", () => {
    const { start, end } = calculateClipBounds(3, 8);
    expect(start).toBe(0);
    expect(end).toBe(8);
  });

  it("handles peak at 0", () => {
    const { start, end } = calculateClipBounds(0, 120);
    expect(start).toBe(0);
    expect(end).toBe(10);
  });

  it("handles peak at exact duration", () => {
    const { start, end } = calculateClipBounds(120, 120);
    expect(start).toBe(115);
    expect(end).toBe(120);
  });
});
