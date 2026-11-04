-- When a clip is deleted the current reel keeps playing; this flag asks the
-- worker to rebuild it in the background (instead of nulling highlight_reel_path).
alter table videos add column reel_stale boolean not null default false;
