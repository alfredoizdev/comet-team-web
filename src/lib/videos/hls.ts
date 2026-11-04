// HLS playlists are stored in R2 next to their segment files, but the segment files
// are private: the app serves the playlists itself and signs every segment URI on
// the way out. Only the playlists go through the app; the video bytes stream from R2.
import { HLS_RENDITIONS, type HlsRendition } from "@/lib/r2/keys";

/** Master playlist URL served by the app (`/api/hls/{videoId}/master.m3u8`). Rendition playlists are relative to it. */
export function hlsMasterUrl(videoId: string): string {
  return `/api/hls/${videoId}/master.m3u8`;
}

/** `["master.m3u8"]` or `["<rendition>", "index.m3u8"]`; anything else (segments, traversal) is refused. */
export function isAllowedPlaylistPath(path: string[]): path is ["master.m3u8"] | [HlsRendition, "index.m3u8"] {
  if (path.length === 1) return path[0] === "master.m3u8";
  if (path.length === 2) return (HLS_RENDITIONS as readonly string[]).includes(path[0]) && path[1] === "index.m3u8";
  return false;
}

/**
 * Replaces every URI line of a media playlist with `resolve(uri)`. Tag (`#…`) and
 * blank lines pass through. Each distinct URI is resolved once.
 */
export async function rewritePlaylist(text: string, resolve: (uri: string) => Promise<string>): Promise<string> {
  const lines = text.split("\n").map((l) => l.replace(/\r$/, ""));
  const cache = new Map<string, string>();
  const out: string[] = [];
  for (const line of lines) {
    if (line === "" || line.startsWith("#")) {
      out.push(line);
      continue;
    }
    let resolved = cache.get(line);
    if (resolved === undefined) {
      resolved = await resolve(line);
      cache.set(line, resolved);
    }
    out.push(resolved);
  }
  return out.join("\n");
}
