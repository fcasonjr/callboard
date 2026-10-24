-- The owner-membership trigger must bypass row-level security: at insert time the
-- creator is not yet a member, so the member policy would otherwise reject the row.
create or replace function add_owner_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into project_member (project_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end $$;
