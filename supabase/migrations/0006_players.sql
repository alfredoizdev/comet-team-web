-- Players named on clips. Remembered per team so they can be picked from a list.
create table players (
  id uuid default gen_random_uuid() primary key,
  team text not null check (team in ('girls', 'boys')),
  name text not null,
  created_at timestamptz default now()
);
create unique index players_team_name_key on players (team, lower(name));
alter table players enable row level security;
grant all privileges on players to service_role;

alter table clips add column player_id uuid references players(id) on delete set null;
create index clips_player_id_idx on clips(player_id);
