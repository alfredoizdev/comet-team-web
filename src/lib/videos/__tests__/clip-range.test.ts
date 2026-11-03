import { describe, expect, it } from "vitest";
import { validateClipRange } from "@/lib/videos/clip-range";

describe("validateClipRange", () => {
  it("rejects clips shorter than 1 second", () => {
    expect(validateClipRange(10, 10.5, 100)).toEqual({ ok: false, reason: "Clip must be at least 1 second" });
  });
  it("rejects clips longer than 60 seconds", () => {
    expect(validateClipRange(0, 61, 100)).toEqual({ ok: false, reason: "Clip can't be longer than 60 seconds" });
  });
  it("rejects clips ending after the video", () => {
    expect(validateClipRange(90, 110, 100)).toEqual({ ok: false, reason: "Clip is outside the video" });
  });
  it("rejects clips starting before 0", () => {
    expect(validateClipRange(-1, 5, 100)).toEqual({ ok: false, reason: "Clip is outside the video" });
  });
  it("accepts a 15 second clip inside the video", () => {
    expect(validateClipRange(10, 25, 100)).toEqual({ ok: true });
  });
});
