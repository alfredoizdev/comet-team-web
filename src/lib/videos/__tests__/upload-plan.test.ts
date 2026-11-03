import { describe, expect, it } from "vitest";
import { planUpload } from "@/lib/videos/upload-plan";

const MB = 1024 ** 2;
const GB = 1024 ** 3;

describe("planUpload", () => {
  it("uses a single PUT for small files", () => {
    expect(planUpload(10 * MB)).toEqual({ mode: "single" });
  });
  it("uses a single PUT at exactly 100 MB", () => {
    expect(planUpload(100 * MB)).toEqual({ mode: "single" });
  });
  it("switches to multipart above 100 MB with 50 MB parts", () => {
    expect(planUpload(100 * MB + 1)).toEqual({ mode: "multipart", partCount: 3, partSize: 50 * MB });
  });
  it("splits a 3.4 GB match into 70 parts", () => {
    expect(planUpload(3.4 * GB)).toEqual({ mode: "multipart", partCount: 70, partSize: 50 * MB });
  });
  it("rejects files over 5 GB", () => {
    expect(() => planUpload(5 * GB + 1)).toThrow("File is larger than 5 GB");
  });
});
