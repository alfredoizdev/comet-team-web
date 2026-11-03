-- Opponents typed into the match form are remembered here so they can be
-- picked from a searchable list next time.
create table opponents (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  created_at timestamptz default now()
);
create unique index opponents_name_key on opponents (lower(name));
alter table opponents enable row level security;
grant all privileges on opponents to service_role;
