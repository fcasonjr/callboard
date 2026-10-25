-- Uploaded script drafts wait here until you review and apply them.
create table script_import_draft (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references project(id) on delete cascade,
  filename text not null,
  source_format text not null check (source_format in ('fountain', 'fdx')),
  raw_source text not null,
  created_at timestamptz not null default now()
);

alter table script_import_draft enable row level security;
create policy script_import_draft_read on script_import_draft for select using (is_project_member(project_id));
create policy script_import_draft_write on script_import_draft for all
  using (is_project_owner(project_id)) with check (is_project_owner(project_id));
grant select, insert, update, delete on script_import_draft to authenticated;

-- When a scene's heading or text changes, remember when. A call sheet published
-- before that moment is out of date.
alter table scene add column revised_at timestamptz;

create or replace function flag_scene_change() returns trigger
language plpgsql as $$
begin
  if new.body is distinct from old.body
     or new.int_ext is distinct from old.int_ext
     or new.location_name is distinct from old.location_name
     or new.time_of_day is distinct from old.time_of_day then
    new.revised_at := now();
    if exists (select 1 from scene_element where scene_id = new.id) then
      new.changed_since_breakdown := true;
    end if;
  end if;
  return new;
end $$;
