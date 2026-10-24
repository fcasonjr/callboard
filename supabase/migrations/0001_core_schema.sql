-- Callboard core schema. Plain Postgres; Supabase-specific bits live in 0003.
-- Child tables carry project_id directly so row-level security stays simple.

create extension if not exists pgcrypto;

create table project (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  title text not null,
  created_at timestamptz not null default now()
);

-- Who can open a project. 'owner' edits; 'viewer' is read-only crew access.
create table project_member (
  project_id uuid not null references project(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('owner', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table script_version (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references project(id) on delete cascade,
  version_no int not null,
  label text,
  source_format text not null check (source_format in ('fountain', 'fdx', 'manual')),
  raw_source text,
  imported_at timestamptz not null default now(),
  is_current boolean not null default false,
  unique (project_id, version_no)
);
create unique index script_version_one_current on script_version (project_id) where is_current;

create table location (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references project(id) on delete cascade,
  name text not null,
  address text,
  lat double precision,
  lng double precision,
  contact text,
  access_start time,
  access_end time,
  permit_status text not null default 'none' check (permit_status in ('none', 'needed', 'applied', 'approved')),
  notes text
);

create table scene (
  id uuid primary key default gen_random_uuid(),   -- stable internal id across revisions
  project_id uuid not null references project(id) on delete cascade,
  script_version_id uuid not null references script_version(id) on delete cascade,
  scene_no text not null,                           -- "12", "12A"
  position int not null,
  int_ext text check (int_ext in ('INT', 'EXT', 'INT/EXT')),
  location_name text,
  time_of_day text,                                 -- DAY, NIGHT, DAWN, ...
  page_eighths int,                                 -- length in eighths of a page
  synopsis text,
  body text,
  location_id uuid references location(id) on delete set null,
  status text not null default 'unscheduled' check (status in ('unscheduled', 'scheduled', 'shot', 'cut')),
  changed_since_breakdown boolean not null default false,
  created_at timestamptz not null default now()
);
create index on scene (project_id, position);

create table element (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references project(id) on delete cascade,
  category text not null,                           -- prop, wardrobe, vehicle, sfx, makeup, ...
  name text not null,
  unique (project_id, category, name)
);

create table scene_element (
  scene_id uuid not null references scene(id) on delete cascade,
  element_id uuid not null references element(id) on delete cascade,
  project_id uuid not null references project(id) on delete cascade,
  qty int not null default 1,
  notes text,
  primary key (scene_id, element_id)
);

create table person (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references project(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  kind text not null default 'crew' check (kind in ('cast', 'crew', 'vendor'))
);

create table role (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references project(id) on delete cascade,
  person_id uuid references person(id) on delete set null,
  character_name text,
  department text
);

create table scene_cast (
  scene_id uuid not null references scene(id) on delete cascade,
  role_id uuid not null references role(id) on delete cascade,
  project_id uuid not null references project(id) on delete cascade,
  primary key (scene_id, role_id)
);

create table availability (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references project(id) on delete cascade,
  person_id uuid not null references person(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  available boolean not null default true,
  note text,
  check (end_date >= start_date)
);

create table shoot_day (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references project(id) on delete cascade,
  day_no int not null,
  shoot_date date,
  general_call time,
  location_id uuid references location(id) on delete set null,
  notes text,
  unique (project_id, day_no)
);

create table schedule_entry (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references project(id) on delete cascade,
  shoot_day_id uuid not null references shoot_day(id) on delete cascade,
  scene_id uuid not null references scene(id) on delete cascade,
  position int not null,
  est_minutes int,
  unique (scene_id)                                  -- a scene is scheduled once
);
create index on schedule_entry (shoot_day_id, position);

-- Rehearsals, scouts, fittings: things on the calendar that are not shoot days.
create table event (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references project(id) on delete cascade,
  kind text not null default 'other' check (kind in ('rehearsal', 'scout', 'fitting', 'meeting', 'other')),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location_id uuid references location(id) on delete set null,
  notes text
);

create table shot (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references project(id) on delete cascade,
  scene_id uuid not null references scene(id) on delete cascade,
  shot_no text not null,
  size text,
  angle text,
  movement text,
  lens text,
  description text,
  priority text not null default 'must' check (priority in ('must', 'if_time')),
  est_minutes int,
  status text not null default 'planned' check (status in ('planned', 'shot', 'dropped'))
);

create table call_sheet (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references project(id) on delete cascade,
  shoot_day_id uuid not null references shoot_day(id) on delete cascade,
  version_no int not null default 1,
  published_at timestamptz,
  weather jsonb,
  sunrise time,
  sunset time,
  nearest_hospital text,
  notes text,
  public_token text not null unique default encode(gen_random_bytes(18), 'hex'),
  unique (shoot_day_id, version_no)
);

create table call_time (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references project(id) on delete cascade,
  call_sheet_id uuid not null references call_sheet(id) on delete cascade,
  person_id uuid not null references person(id) on delete cascade,
  call time,
  status text not null default 'draft' check (status in ('draft', 'sent', 'seen', 'confirmed')),
  sent_at timestamptz,
  seen_at timestamptz,
  confirmed_at timestamptz,
  unique (call_sheet_id, person_id)
);

create table budget_line (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references project(id) on delete cascade,
  category text not null,
  description text not null,
  estimate numeric(12, 2) not null default 0,
  actual numeric(12, 2),
  shoot_day_id uuid references shoot_day(id) on delete set null
);

create table checklist_item (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references project(id) on delete cascade,
  kind text not null check (kind in ('permit', 'insurance', 'release', 'other')),
  title text not null,
  person_id uuid references person(id) on delete set null,
  location_id uuid references location(id) on delete set null,
  done boolean not null default false
);

-- Who changed what; also feeds the call sheet "what changed" banner.
create table activity_log (
  id bigint generated always as identity primary key,
  project_id uuid not null references project(id) on delete cascade,
  actor_id uuid,
  entity text not null,
  entity_id uuid,
  action text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index on activity_log (project_id, created_at desc);
