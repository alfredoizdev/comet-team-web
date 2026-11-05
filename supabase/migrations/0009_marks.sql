-- Marks set while watching a full match ("Mark", M key). Shared by every coach and
-- device until "Create clips from marks" turns them into clips (or they are cleared).
create table video_marks (
  id uuid default gen_random_uuid() primary key,
  video_id uuid references videos(id) on delete cascade not null,
  time_seconds float not null,
  created_at timestamptz default now()
);
create index video_marks_video_id_idx on video_marks(video_id);
alter table video_marks enable row level security;
grant all privileges on video_marks to service_role;
