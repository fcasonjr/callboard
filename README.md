# Callboard

Preproduction for small productions: script import, breakdown, stripboard scheduling, call sheets, send and track, shot list, simple budget top sheet.

Stack: Next.js (TypeScript) + Supabase Postgres.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in your Supabase project URL and anon key.
3. Create the database tables: in the Supabase dashboard open **SQL Editor**, then run each file in `supabase/migrations/` in order (`0001`, `0002`, `0003`).
4. `npm run dev` and open http://localhost:3000

## Database

- `0001_core_schema.sql`: tables (project, script_version, scene, element, schedule, shot, call_sheet, call_time, budget_line, ...)
- `0002_helpers.sql`: owner membership trigger, scene-changed flag
- `0003_rls_and_public_access.sql`: row-level security (owners edit, viewers read) and two functions that let crew open and confirm a call sheet through its secret link without an account

Never commit the database password or the service role key.

## Build order

1. Fountain/.fdx importer
2. Scene list and stripboard
3. Offline-capable call sheet page
