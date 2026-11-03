import { describe, expect, it } from "vitest";
import { ALLOWED_VIDEO_EXTS, MAX_VIDEO_BYTES, MULTIPART_THRESHOLD, PART_SIZE, SIGNED_URL_TTL_SECONDS, TEAMS } from "@/lib/db/types";

describe("domain constants", () => {
  it("lists the two teams", () => {
    expect(TEAMS).toEqual(["girls", "boys"]);
  });
  it("pins upload sizes from the spec", () => {
    expect(PART_SIZE).toBe(52428800);
    expect(MULTIPART_THRESHOLD).toBe(104857600);
    expect(MAX_VIDEO_BYTES).toBe(5368709120);
  });
  it("pins allowed extensions and signed url ttl", () => {
    expect(ALLOWED_VIDEO_EXTS).toEqual(["mp4", "mov", "avi", "webm"]);
    expect(SIGNED_URL_TTL_SECONDS).toBe(14400);
  });
});
