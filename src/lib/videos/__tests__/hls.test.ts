import { describe, expect, it } from "vitest";
import { hlsMasterUrl, isAllowedPlaylistPath, rewritePlaylist } from "@/lib/videos/hls";

const playlist = [
  "#EXTM3U",
  "#EXT-X-VERSION:4",
  "#EXT-X-TARGETDURATION:6",
  "#EXTINF:6.000000,",
  "#EXT-X-BYTERANGE:1000@0",
  "index.ts",
  "#EXTINF:5.500000,",
  "#EXT-X-BYTERANGE:900@1000",
  "index.ts",
  "",
  "#EXT-X-ENDLIST",
].join("\n");

describe("rewritePlaylist", () => {
  it("replaces every segment URI line and leaves tags and blank lines untouched", async () => {
    const out = await rewritePlaylist(playlist, async (uri) => `https://r2.example/${uri}?sig=1`);
    expect(out.split("\n")).toEqual([
      "#EXTM3U",
      "#EXT-X-VERSION:4",
      "#EXT-X-TARGETDURATION:6",
      "#EXTINF:6.000000,",
      "#EXT-X-BYTERANGE:1000@0",
      "https://r2.example/index.ts?sig=1",
      "#EXTINF:5.500000,",
      "#EXT-X-BYTERANGE:900@1000",
      "https://r2.example/index.ts?sig=1",
      "",
      "#EXT-X-ENDLIST",
    ]);
  });

  it("resolves each distinct URI once (signing is not free)", async () => {
    const seen: string[] = [];
    await rewritePlaylist(playlist, async (uri) => {
      seen.push(uri);
      return uri;
    });
    expect(seen).toEqual(["index.ts"]);
  });

  it("trims Windows line endings before matching", async () => {
    const out = await rewritePlaylist("#EXTM3U\r\nindex.ts\r\n", async (uri) => `signed:${uri}`);
    expect(out).toBe("#EXTM3U\nsigned:index.ts\n");
  });
});

describe("playlist paths", () => {
  it("builds the master playlist URL served by the app", () => {
    expect(hlsMasterUrl("vid")).toBe("/api/hls/vid/master.m3u8");
  });
  it("allows only the master playlist and each rendition's playlist", () => {
    expect(isAllowedPlaylistPath(["master.m3u8"])).toBe(true);
    expect(isAllowedPlaylistPath(["1080p", "index.m3u8"])).toBe(true);
    expect(isAllowedPlaylistPath(["720p", "index.m3u8"])).toBe(true);
    expect(isAllowedPlaylistPath(["720p", "index.ts"])).toBe(false);
    expect(isAllowedPlaylistPath(["4k", "index.m3u8"])).toBe(false);
    expect(isAllowedPlaylistPath(["..", "master.m3u8"])).toBe(false);
    expect(isAllowedPlaylistPath([])).toBe(false);
  });
});
