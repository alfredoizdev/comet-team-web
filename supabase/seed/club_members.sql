-- Seed the people allowed into /admin. Replace the emails (lower-case) and
-- run this in the Supabase SQL Editor (or: psql "$SUPABASE_DB_URL" -f this-file).
-- Admins see both teams (team = null). Coaches need a team.
insert into club_members (email, role, team) values
  ('admin@example.com', 'admin', null),
  ('coach-girls@example.com', 'coach', 'girls'),
  ('coach-boys@example.com', 'coach', 'boys')
on conflict (email) do update set role = excluded.role, team = excluded.team;
