-- Supabase specifics: auth.uid() and row-level security.

create or replace function is_project_member(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from project_member where project_id = pid and user_id = auth.uid());
$$;

create or replace function is_project_owner(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from project_member
                 where project_id = pid and user_id = auth.uid() and role = 'owner');
$$;

-- Projects: members read, creator inserts as owner, owners update/delete.
alter table project enable row level security;
create policy project_read on project for select using (is_project_member(id));
create policy project_insert on project for insert with check (owner_id = auth.uid());
create policy project_write on project for update using (is_project_owner(id));
create policy project_delete on project for delete using (is_project_owner(id));

alter table project_member enable row level security;
create policy member_read on project_member for select using (is_project_member(project_id));
create policy member_write on project_member for all
  using (is_project_owner(project_id)) with check (is_project_owner(project_id));

-- Every other table: members read, owners write.
do $$
declare t text;
begin
  foreach t in array array[
    'script_version','location','scene','element','scene_element','person','role',
    'scene_cast','availability','shoot_day','schedule_entry','event','shot',
    'call_sheet','call_time','budget_line','checklist_item','activity_log'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select using (is_project_member(project_id))', t || '_read', t);
    execute format('create policy %I on %I for all using (is_project_owner(project_id)) with check (is_project_owner(project_id))', t || '_write', t);
  end loop;
end $$;

-- Crew open a call sheet by its secret link without an account.
-- These two functions are the only way anonymous visitors touch data.
create or replace function get_public_call_sheet(p_token text, p_person uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare cs call_sheet; result jsonb;
begin
  select * into cs from call_sheet where public_token = p_token and published_at is not null;
  if not found then return null; end if;

  if p_person is not null then
    update call_time set status = 'seen', seen_at = now()
    where call_sheet_id = cs.id and person_id = p_person and status in ('draft', 'sent');
  end if;

  select jsonb_build_object(
    'call_sheet', to_jsonb(cs) - 'public_token' - 'project_id',
    'is_latest', cs.version_no = (select max(version_no) from call_sheet
                                  where shoot_day_id = cs.shoot_day_id and published_at is not null),
    'day', (select to_jsonb(d) - 'project_id' from shoot_day d where d.id = cs.shoot_day_id),
    'scenes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'scene_no', s.scene_no, 'int_ext', s.int_ext, 'location_name', s.location_name,
        'time_of_day', s.time_of_day, 'page_eighths', s.page_eighths, 'synopsis', s.synopsis,
        'est_minutes', se.est_minutes) order by se.position)
      from schedule_entry se join scene s on s.id = se.scene_id
      where se.shoot_day_id = cs.shoot_day_id), '[]'::jsonb),
    'calls', coalesce((
      select jsonb_agg(jsonb_build_object(
        'person_id', p.id, 'name', p.name, 'call', ct.call, 'status', ct.status)
        order by ct.call, p.name)
      from call_time ct join person p on p.id = ct.person_id
      where ct.call_sheet_id = cs.id), '[]'::jsonb)
  ) into result;
  return result;
end $$;

create or replace function confirm_call(p_token text, p_person uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update call_time ct set status = 'confirmed', confirmed_at = now()
  from call_sheet cs
  where cs.id = ct.call_sheet_id and cs.public_token = p_token
    and cs.published_at is not null and ct.person_id = p_person;
  return found;
end $$;

grant execute on function get_public_call_sheet(text, uuid) to anon, authenticated;
grant execute on function confirm_call(text, uuid) to anon, authenticated;
