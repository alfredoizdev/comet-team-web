-- The project was created with "Automatically expose new tables" off, so the
-- Data API roles get no privileges by default. Only the service role (server
-- actions + worker) needs access; anon/authenticated stay locked out.
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;

revoke execute on function public.claim_next_video() from anon, authenticated;
alter function public.claim_next_video() set search_path = public;
