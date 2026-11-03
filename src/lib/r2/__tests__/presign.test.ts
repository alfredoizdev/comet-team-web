import { beforeAll, describe, expect, it } from "vitest";
import { presignGet } from "@/lib/r2/client";

beforeAll(() => {
  process.env.R2_ENDPOINT = "https://example.r2.cloudflarestorage.com";
  process.env.R2_BUCKET = "comets-videos";
  process.env.R2_ACCESS_KEY_ID = "test";
  process.env.R2_SECRET_ACCESS_KEY = "test";
});

describe("presignGet", () => {
  it("returns the same URL when called twice within the same hour, so <video src> does not reload on refresh", async () => {
    const a = await presignGet("v1/highlight_reel.mp4");
    const b = await presignGet("v1/highlight_reel.mp4");
    expect(a).toBe(b);
    expect(new URL(a).searchParams.get("X-Amz-Date")).toMatch(/T\d{2}0000Z$/);
  });
});
