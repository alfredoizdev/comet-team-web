# Full match streaming — design

**Date:** 2026-11-04 · **Decided with Alfredo in chat** (option "2": keep the original, generate streaming copies).

## Intent
Parents watch the whole match from the club site, on any device, and coaches can cut new clips from any
match at any time. Storage stays cheap (R2, ~10 GB per match, ~$0.015/GB-month) and nothing is lost.

## Goals
- The uploaded original ("master") stays in R2. Clips are always cut from it at camera quality.
- After the clips + reel, the worker prepares the full match for streaming: HLS, two renditions
  (1080p ≈ 6 Mbps, 720p ≈ 3 Mbps), adaptive, seekable, playable on iOS/Android/desktop.
- Public match page: tab **Highlights** (reel + moments, as today) and tab **Full match**.
  YouTube matches show the YouTube embed there; uploaded matches show the HLS player.
- Admin editor plays the full match from the HLS copy (light) instead of the 7 GB master.
- Clips and the reel are encoded at web quality (1080p max, CRF 20) instead of 45 MB / 15 s.
- Admin can delete the master of an old match to save storage ("Delete original"); the match keeps
  streaming and its clips, only cutting new clips is lost (existing message already covers it).

## Non-goals
- No automatic YouTube upload (YouTube API locks unverified-app uploads as private).
- No re-encoding of the three existing matches' clips. "Comet vs Universo" has no master: no full match.
- Worker still runs on the Mac. `HLS_VIDEO_ENCODER=h264_videotoolbox` there; default `libx264` elsewhere.

## Storage layout (R2, deterministic keys, no listing needed)
```
{videoId}/hls/master.m3u8
{videoId}/hls/1080p/index.m3u8   {videoId}/hls/1080p/index.ts   (single-file HLS, byte ranges)
{videoId}/hls/720p/index.m3u8    {videoId}/hls/720p/index.ts
```
`videos.hls_path` = `{videoId}/hls` once all five objects exist (migration 0008). Null until then.

## Worker
1. `processVideo` unchanged in flow; `cutClip` now encodes `libx264 -preset veryfast -crf 20`,
   scale to ≤1920 wide, `aac 128k`, `+faststart`. Source kept (DELETE_SOURCE_AFTER_PROCESSING=false).
2. New job `generateHls(videoId, source)` (`worker/src/hls.ts`): download master → one ffmpeg run with
   two outputs (`-f hls -hls_time 6 -hls_playlist_type vod -hls_flags single_file`, keyframes every 6 s)
   → upload five objects → `hls_path` set, `stage null, progress 100`. Progress is reported on the video
   row (`stage: "Preparing full match for streaming"`, 0–100: download 0–10, encode 10–95, upload 95–100)
   parsed from `ffmpeg -progress pipe:1` (`out_time_us` / duration).
3. Poll loop picks, after clips/reels, one video with `status=done`, `source_url is null`,
   `source_deleted_at is null`, `hls_path is null`, `error_message is null`. On failure: log and set
   `error_message = "hls_failed: …"` (status stays done; Reprocess clears it so it retries).
   This doubles as catch-up after a worker restart.

## Web
- `GET /api/hls/{videoId}/master.m3u8` and `/api/hls/{videoId}/{rendition}/index.m3u8`
  (route handler, outside `/admin`): allowed if the video is published, or the signed-in user is a member
  who can manage that team. Reads the playlist from R2 and rewrites every segment URI to a presigned GET
  URL (4 h, hour-floored). Master playlist is served as is (relative rendition URIs resolve to the route).
  `Cache-Control: private, no-store`. Pure rewriter `rewritePlaylist()` in `src/lib/videos/hls.ts`.
- `HlsVideo` client component (`src/components/hls-video.tsx`): native HLS where supported (Safari),
  `hls.js` (dynamic import) elsewhere. `useHls(videoRef, src)` hook used by the editor.
- `getMatchState.urls.source`: the HLS route when `hls_path` is set, else the presigned master (today's
  behaviour, until HLS is ready). `sourceSize` (bytes) for the "Delete original" button.
- `PublicMatch.fullMatch`: `{kind:"youtube", id}` | `{kind:"hls", url}` | null. `MatchCard` renders tabs
  only when `fullMatch` exists.
- Status panel: progress bar also while `status=done` and `stage` is set; note when
  `error_message` starts with `hls_failed`. New "Delete original (6.9 GB)" button with confirm dialog;
  shown when a master exists and `hls_path` is set.
- `deleteMatch` also deletes the five HLS keys. `reprocessMatch` keeps `hls_path`.

## Requires from Alfredo
R2 CORS rule must also allow `GET` and `HEAD` (today only `PUT`): hls.js fetches segments with XHR.
Safari/iOS work without it.
