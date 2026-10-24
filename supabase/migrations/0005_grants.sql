-- Newer Supabase projects do not auto-grant table access to the API roles.
-- Row-level security (0003) still decides which rows each person can see or change.
grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function is_project_member(uuid), is_project_owner(uuid) to authenticated;

-- Tables added by later migrations get the same grants.
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;
