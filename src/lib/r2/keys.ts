import { ALLOWED_VIDEO_EXTS, type VideoExt } from "../db/types";

/** Full match uploaded by a member: `{userId}/{videoId}/video.{ext}`. */
export function videoKey(userId: string, videoId: string, ext: string): string {
  return `${userId}/${videoId}/video.${ext.toLowerCase()}`;
}

/** Auto-detected clip number `index`: `{videoId}/clip_{index}.mp4`. */
export function autoClipKey(videoId: string, index: number): string {
  return `${videoId}/clip_${index}.mp4`;
}

/** Clip cut by hand in the editor: `{videoId}/custom_{clipId}.mp4`. */
export function customClipKey(videoId: string, clipId: string): string {
  return `${videoId}/custom_${clipId}.mp4`;
}

/**
 * Highlight reel for a video. Each rebuild gets a new key
 * (`{videoId}/highlight_reel_{version}.mp4`) so browsers never keep playing a
 * stale cached reel behind an identical URL; the previous object is deleted.
 */
export function reelKey(videoId: string, version: number | string = Date.now()): string {
  return `${videoId}/highlight_reel_${version}.mp4`;
}

/** Lower-cased extension of `name` if it is an allowed video type, else null. */
export function extFromName(name: string): VideoExt | null {
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  return (ALLOWED_VIDEO_EXTS as readonly string[]).includes(ext) ? (ext as VideoExt) : null;
}

const CONTENT_TYPES: Record<VideoExt, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  webm: "video/webm",
};

export function contentTypeForExt(ext: VideoExt): string {
  return CONTENT_TYPES[ext];
}

/** Streaming renditions of the full match, best first (the master playlist lists them in this order). */
export const HLS_RENDITIONS = ["1080p", "720p"] as const;
export type HlsRendition = (typeof HLS_RENDITIONS)[number];

/** Folder holding the HLS copy of a full match: `{videoId}/hls`. Stored in `videos.hls_path`. */
export function hlsPrefix(videoId: string): string {
  return `${videoId}/hls`;
}

/** Every object of the HLS copy: master playlist, then per rendition its playlist and single segment file. */
export function hlsKeys(videoId: string): string[] {
  const prefix = hlsPrefix(videoId);
  return [`${prefix}/master.m3u8`, ...HLS_RENDITIONS.flatMap((r) => [`${prefix}/${r}/index.m3u8`, `${prefix}/${r}/index.ts`])];
}
