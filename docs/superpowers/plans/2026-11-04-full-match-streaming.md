# Full match streaming — implementation plan

> Native execution (Alfredo: "ok haslo"). Spec: docs/superpowers/specs/2026-11-04-full-match-streaming-design.md

**Global constraints:** migration applied and verified before deploying code · worker idle while editing
`worker/` or `src/lib/r2` · no credentials in chat · `pnpm test`, `tsc -p worker`, `pnpm lint` green per task ·
UI copy in English · commit per task.

### Task 1: keys + migration + types
- `src/lib/r2/keys.ts`: `HLS_RENDITIONS = ["1080p","720p"] as const`, `hlsPrefix(videoId)`, `hlsKeys(videoId)` (5 keys).
  Test in `src/lib/r2/__tests__/keys.test.ts`.
- `supabase/migrations/0008_hls.sql`: `alter table videos add column hls_path text;`
- `Video.hls_path: string | null` in `src/lib/db/types.ts`.
- Alfredo runs `! supabase db push`; verify via REST that `hls_path` is selectable.

### Task 2: playlist rewriter + HLS route
- `src/lib/videos/hls.ts`: `rewritePlaylist(text, resolve: (uri) => string): string` — rewrites non-comment,
  non-empty lines; leaves `#EXT…` lines untouched. Test `src/lib/videos/__tests__/hls.test.ts`.
- `src/lib/r2/client.ts`: `getObjectText(key): Promise<string>`.
- `src/app/api/hls/[videoId]/[...path]/route.ts`: auth (published or manager), path whitelist
  (`master.m3u8` | `{rendition}/index.m3u8`), rewrite, headers.

### Task 3: worker — web-quality clips + HLS generation
- `cutClip` new args. `worker/src/hls.ts`: `hlsArgs(input, outDir, { encoder, duration })` (pure, tested),
  `parseProgress(line, durationSec): number | null` (tested), `generateHls(videoId, source)`.
- `worker/src/index.ts`: `generatePendingHls()` in the poll loop.
- `.env.example` + `.env.local`: `HLS_VIDEO_ENCODER`. README note. Restart worker, smoke test on a short clip.

### Task 4: admin — editor plays HLS, Delete original, progress bar
- `getMatchState`: `urls.source` → `/api/hls/{id}/master.m3u8` when `hls_path`; `sourceSize`.
- `useHls` hook in `src/components/hls-video.tsx`; editor uses it.
- `deleteOriginal(videoId)` action (test in `(panel)/matches/[id]/__tests__/actions.test.ts`), button in status panel.
- `status-panel.tsx`: bar while done+stage, hls_failed note. `deleteMatch` deletes HLS keys (test).

### Task 5: public — Full match tab
- `selectPublishable` → `fullMatch` (test in `public.test.ts`). `getPublishedMatch` fills HLS url.
- `MatchCard`: Tabs Highlights / Full match; `HlsVideo` or YouTube iframe.

### Task 6: verify + deploy
- Full suite, lint, `next build`; `vercel --prod --yes`; smoke in browser; ask Alfredo for the CORS change.
