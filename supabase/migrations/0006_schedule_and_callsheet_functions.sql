-- Save the whole stripboard layout atomically.
-- p_layout = [{"day_id": uuid, "scenes": [{"scene_id": uuid, "est_minutes": int}, ...]}, ...]
create or replace function save_schedule(p_project uuid, p_layout jsonb) returns void
language plpgsql as $$
begin
  if not is_project_owner(p_project) then
    raise exception 'not allowed';
  end if;

  delete from schedule_entry where project_id = p_project;

  insert into schedule_entry (project_id, shoot_day_id, scene_id, position, est_minutes)
  select p_project, sd.id, sc.id, (t.ord - 1)::int, nullif(t.s ->> 'est_minutes', '')::int
  from jsonb_array_elements(p_layout) as d
  cross join lateral jsonb_array_elements(d -> 'scenes') with ordinality as t(s, ord)
  join shoot_day sd on sd.id = (d ->> 'day_id')::uuid and sd.project_id = p_project
  join scene sc on sc.id = (t.s ->> 'scene_id')::uuid and sc.project_id = p_project;

  update scene set status = 'scheduled'
  where project_id = p_project and status = 'unscheduled'
    and id in (select scene_id from schedule_entry where project_id = p_project);

  update scene set status = 'unscheduled'
  where project_id = p_project and status = 'scheduled'
    and id not in (select scene_id from schedule_entry where project_id = p_project);
end $$;

-- Start the next version of a call sheet, copying its crew calls. Returns the new sheet id.
create or replace function reissue_call_sheet(p_sheet uuid) returns uuid
language plpgsql as $$
declare cs call_sheet; new_id uuid;
begin
  select * into cs from call_sheet where id = p_sheet;
  if not found or not is_project_owner(cs.project_id) then
    raise exception 'not allowed';
  end if;

  insert into call_sheet (project_id, shoot_day_id, version_no, weather, sunrise, sunset, nearest_hospital, notes)
  values (cs.project_id, cs.shoot_day_id,
          (select max(version_no) + 1 from call_sheet where shoot_day_id = cs.shoot_day_id),
          cs.weather, cs.sunrise, cs.sunset, cs.nearest_hospital, cs.notes)
  returning id into new_id;

  insert into call_time (project_id, call_sheet_id, person_id, call)
  select project_id, new_id, person_id, call from call_time where call_sheet_id = p_sheet;
  return new_id;
end $$;

-- A crew link always shows the LATEST published version for that shoot day,
-- so an old link never goes stale. Confirmation is per version.
create or replace function get_public_call_sheet(p_token text, p_person uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare tok call_sheet; cs call_sheet; result jsonb;
begin
  select * into tok from call_sheet where public_token = p_token and published_at is not null;
  if not found then return null; end if;
  select * into cs from call_sheet
   where shoot_day_id = tok.shoot_day_id and published_at is not null
   order by version_no desc limit 1;

  if p_person is not null then
    update call_time set status = 'seen', seen_at = now()
    where call_sheet_id = cs.id and person_id = p_person and status in ('draft', 'sent');
  end if;

  select jsonb_build_object(
    'call_sheet', to_jsonb(cs) - 'public_token' - 'project_id',
    'project_title', (select title from project where id = cs.project_id),
    'day', (select to_jsonb(d) - 'project_id' from shoot_day d where d.id = cs.shoot_day_id),
    'location', (select jsonb_build_object('name', l.name, 'address', l.address, 'contact', l.contact)
                 from shoot_day d join location l on l.id = d.location_id where d.id = cs.shoot_day_id),
    'scenes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'scene_no', s.scene_no, 'int_ext', s.int_ext, 'location_name', s.location_name,
        'time_of_day', s.time_of_day, 'page_eighths', s.page_eighths, 'synopsis', s.synopsis,
        'est_minutes', se.est_minutes) order by se.position)
      from schedule_entry se join scene s on s.id = se.scene_id
      where se.shoot_day_id = cs.shoot_day_id), '[]'::jsonb),
    'calls', coalesce((
      select jsonb_agg(jsonb_build_object(
        'person_id', p.id, 'name', p.name, 'kind', p.kind, 'call', ct.call, 'status', ct.status)
        order by ct.call, p.name)
      from call_time ct join person p on p.id = ct.person_id
      where ct.call_sheet_id = cs.id), '[]'::jsonb)
  ) into result;
  return result;
end $$;

create or replace function confirm_call(p_token text, p_person uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare tok call_sheet; latest uuid;
begin
  select * into tok from call_sheet where public_token = p_token and published_at is not null;
  if not found then return false; end if;
  select id into latest from call_sheet
   where shoot_day_id = tok.shoot_day_id and published_at is not null
   order by version_no desc limit 1;
  update call_time set status = 'confirmed', confirmed_at = now()
  where call_sheet_id = latest and person_id = p_person;
  return found;
end $$;

grant execute on function get_public_call_sheet(text, uuid) to anon, authenticated;
grant execute on function confirm_call(text, uuid) to anon, authenticated;
grant execute on function save_schedule(uuid, jsonb), reissue_call_sheet(uuid) to authenticated;
