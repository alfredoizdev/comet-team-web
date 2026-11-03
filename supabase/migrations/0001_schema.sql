-- ============================================================
-- Comets Web — consolidated schema
-- Derived from PeakClip (projects / videos / clips / claim_next_video)
-- so the ported worker runs unchanged. No Storage: files live in R2.
-- ============================================================

-- Projects: one project = one match.
create table projects (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) not null,
  title text not null,
  team text not null check (team in ('girls', 'boys')),
  match_date date,
  opponent text,
  created_at timestamptz default now()
);

-- Videos: one per project (the full match). file_path is an R2 object key.
create table videos (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  file_path text not null,
  status text default 'uploaded' check (status in ('uploaded', 'processing', 'done', 'error')),
  error_message text,
  duration float,
  highlight_reel_path text,
  is_published boolean not null default false,
  published_at timestamptz,
  source_deleted_at timestamptz,
  created_at timestamptz default now()
);

-- Clips: auto (score >= 1.5) or custom (score 0 pending, 1 done, -1 failed).
create table clips (
  id uuid default gen_random_uuid() primary key,
  video_id uuid references videos(id) on delete cascade not null,
  start_time float not null,
  end_time float not null,
  score float not null,
  file_path text not null,
  created_at timestamptz default now()
);

-- Club members allowed into /admin. Matched by lower-cased auth email.
create table club_members (
  id uuid default gen_random_uuid() primary key,
  email text unique not null,
  role text not null check (role in ('admin', 'coach')),
  team text check (team in ('girls', 'boys')),
  created_at timestamptz default now(),
  constraint coach_needs_team check (role = 'admin' or team is not null)
);

create index videos_project_id_idx on videos(project_id);
create index videos_status_idx on videos(status);
create index clips_video_id_idx on clips(video_id);
create index projects_team_match_date_idx on projects(team, match_date desc);

-- ============================================================
-- Row Level Security: enabled with NO policies.
-- Only the service role (server actions + worker) touches these tables;
-- the anon/authenticated keys are used solely for sign-in.
-- ============================================================
alter table projects enable row level security;
alter table videos enable row level security;
alter table clips enable row level security;
alter table club_members enable row level security;

-- Worker queue: claim the oldest uploaded video (safe with several workers).
create or replace function claim_next_video()
returns setof videos
language sql
as $$
  update videos
  set status = 'processing'
  where id = (
    select id from videos
    where status = 'uploaded'
    order by created_at asc
    limit 1
    for update skip locked
  )
  returning *;
$$;
