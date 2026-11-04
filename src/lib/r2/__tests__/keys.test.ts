import { describe, expect, it } from "vitest";
import { autoClipKey, contentTypeForExt, customClipKey, extFromName, hlsKeys, hlsPrefix, reelKey, videoKey } from "@/lib/r2/keys";

describe("R2 object keys (PeakClip layout)", () => {
  it("builds the full-match key under the uploader's folder, lower-casing the extension", () => {
    expect(videoKey("u1", "v1", "MP4")).toBe("u1/v1/video.mp4");
  });
  it("builds auto clip keys by index", () => {
    expect(autoClipKey("v1", 3)).toBe("v1/clip_3.mp4");
  });
  it("builds custom clip keys by clip id", () => {
    expect(customClipKey("v1", "c1")).toBe("v1/custom_c1.mp4");
  });
  it("builds a versioned reel key so a rebuilt reel never shares a URL with the old one", () => {
    expect(reelKey("v1", 42)).toBe("v1/highlight_reel_42.mp4");
    expect(reelKey("v1")).not.toBe(reelKey("v1", 1));
  });
});

describe("extFromName", () => {
  it("returns the lower-cased extension when allowed", () => {
    expect(extFromName("Match Final.MOV")).toBe("mov");
  });
  it("rejects extensions outside the allow-list", () => {
    expect(extFromName("file.mkv")).toBeNull();
  });
  it("rejects names without an extension", () => {
    expect(extFromName("noext")).toBeNull();
  });
});

describe("contentTypeForExt", () => {
  it("maps each allowed extension to its MIME type", () => {
    expect(contentTypeForExt("mp4")).toBe("video/mp4");
    expect(contentTypeForExt("mov")).toBe("video/quicktime");
    expect(contentTypeForExt("avi")).toBe("video/x-msvideo");
    expect(contentTypeForExt("webm")).toBe("video/webm");
  });
});

describe("hls keys", () => {
  it("hlsPrefix is {videoId}/hls", () => {
    expect(hlsPrefix("vid")).toBe("vid/hls");
  });

  it("hlsKeys lists the master playlist plus one playlist and one segment file per rendition", () => {
    expect(hlsKeys("vid")).toEqual([
      "vid/hls/master.m3u8",
      "vid/hls/1080p/index.m3u8",
      "vid/hls/1080p/index.ts",
      "vid/hls/720p/index.m3u8",
      "vid/hls/720p/index.ts",
    ]);
  });
});
