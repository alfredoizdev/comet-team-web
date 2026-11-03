# Comets Web

Public site for Comet SC (Girls Team / Boys Team) with an admin panel where
coaches upload full matches, a local worker cuts highlight clips and a reel from the
loudest moments (audio peaks, FFmpeg), and parents watch what gets published.

Stack: Next.js 16 (App Router) · Tailwind 4 · shadcn/ui · Supabase (Postgres + Auth,
Free plan, no Storage) · Cloudflare R2 (videos) · `worker/` (Node + FFmpeg, runs on a Mac).

## Requirements

- Node 24, pnpm 10
- FFmpeg and ffprobe on the PATH (`brew install ffmpeg`)
- Supabase CLI (`brew install supabase/tap/supabase`)

## Setup

1. `pnpm install` (installs the web app and `worker/`).
2. Copy `.env.example` to `.env.local` and fill it in:
   - **Supabase**: create a project (Free plan). Dashboard → Settings → API: URL, anon key,
     service role key.
   - **Cloudflare R2**: create a private bucket `soccer-videos`; Manage R2 API Tokens →
     "Object Read & Write" on that bucket. Account id is in the dashboard URL
     (`dash.cloudflare.com/<account-id>`). Endpoint: `https://<account-id>.r2.cloudflarestorage.com`.
   - **R2 CORS (required, or every browser upload fails)**: bucket → Settings → CORS policy:
     ```json
     [
       {
         "AllowedOrigins": ["http://localhost:3000", "https://<your-vercel-domain>"],
         "AllowedMethods": ["PUT"],
         "AllowedHeaders": ["Content-Type"],
         "ExposeHeaders": ["ETag"],
         "MaxAgeSeconds": 3600
       }
     ]
     ```
     `ExposeHeaders: ["ETag"]` is what lets the multipart upload read each part's ETag.
3. Apply the schema: `supabase link --project-ref <ref>` then `supabase db push`.
4. Seed who can sign in: edit `supabase/seed/club_members.sql` with the real emails
   (lower-case) and run it in the Supabase SQL Editor. Admins see both teams; coaches
   only their own.
5. Create the users in Supabase → Authentication → Users (email + password), and turn
   off public sign-ups (Authentication → Sign In / Providers → disable "Allow new users
   to sign up").

## Run

```bash
pnpm dev:all     # web on http://localhost:3000 + worker, like PeakClip's dev.sh
pnpm dev         # web only
pnpm worker      # worker only (same .env.local)
pnpm test        # vitest
```

The worker polls Supabase every 5 s. It only processes while it is running, so a match
uploaded while the Mac is off stays "Queued" until the worker starts. When a match is
done it deletes the full video from R2 (set `DELETE_SOURCE_AFTER_PROCESSING=false` to
keep originals; then custom clips can still be cut later).

## Pages

- `/` split home · `/girls`, `/boys` published reels and clips (no login)
- `/admin/login` · `/admin` matches · `/admin/matches/new` upload · `/admin/matches/[id]`
  status, clip editor, publish

## Design

`design/comets-home.claude-design.html` is the Claude Design export the home follows.
Specs and plans live in `docs/superpowers/`.
