-- Keep the owner in project_member automatically.
create or replace function add_owner_member() returns trigger
language plpgsql as $$
begin
  insert into project_member (project_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end $$;

create trigger project_add_owner
after insert on project
for each row execute function add_owner_member();

-- Flag scenes whose text changed after a breakdown existed (set by the importer).
-- Mark a scene as needing review when its body or heading fields change.
create or replace function flag_scene_change() returns trigger
language plpgsql as $$
begin
  if (new.body is distinct from old.body
      or new.int_ext is distinct from old.int_ext
      or new.location_name is distinct from old.location_name
      or new.time_of_day is distinct from old.time_of_day)
     and exists (select 1 from scene_element where scene_id = new.id) then
    new.changed_since_breakdown := true;
  end if;
  return new;
end $$;

create trigger scene_flag_change
before update on scene
for each row execute function flag_scene_change();
