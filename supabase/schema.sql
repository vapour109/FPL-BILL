-- The Bill — full schema. Run this in the Supabase SQL editor (or `supabase db push`)
-- against a fresh project to stand the app up from scratch. Safe to re-run.
--
-- A note on access control: the app has no login by design (see README). Every read
-- and write goes through the browser's anon key, so the policies below are
-- deliberately permissive — anyone holding a room code can read and write that
-- room's data. That is the intended trade-off for a closed friend group sharing one
-- link; do not put anything sensitive in here.

create extension if not exists "pgcrypto";

-- Rooms ---------------------------------------------------------------------
create table if not exists public.rooms (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  created_at     timestamptz not null default now(),
  -- Event prices in cents. Kept as jsonb so rates can be edited in the Bill tab
  -- without a migration. Missing/malformed keys are backfilled in src/lib/rates.ts.
  bill_rates     jsonb not null default '{
                   "yellow": 75,
                   "red": 750,
                   "missedPen": 375,
                   "ownGoal": 750,
                   "assist": 150,
                   "brace": 750,
                   "zeroMinStarter": 500
                 }'::jsonb,
  synced_gws     integer[] not null default '{}',
  last_synced_at timestamptz,
  -- Price of a pint in cents, for showing the pot in beers. Its own column
  -- rather than a bill_rates key, since that object is normalised against the
  -- list of chargeable events and would drop an unknown key.
  beer_price_cents integer not null default 600 check (beer_price_cents > 0)
);

-- Managers ------------------------------------------------------------------
create table if not exists public.managers (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  -- Stops two simultaneous joins under the same name creating duplicate rows,
  -- which would split one person's bill across two entries.
  constraint managers_room_name_unique unique (room_id, name)
);

create index if not exists managers_room_id_idx on public.managers (room_id);

-- Roster players ------------------------------------------------------------
-- Rebuilt from scratch on each gameweek paste; display only.
create table if not exists public.roster_players (
  id             uuid primary key default gen_random_uuid(),
  manager_id     uuid not null references public.managers(id) on delete cascade,
  fpl_element_id integer not null,
  player_name    text not null,
  team_short     text,
  position       smallint check (position between 1 and 4),
  added_at       timestamptz not null default now()
);

create index if not exists roster_players_manager_id_idx on public.roster_players (manager_id);

-- Bill charges --------------------------------------------------------------
create table if not exists public.bill_charges (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.rooms(id) on delete cascade,
  manager_id   uuid not null references public.managers(id) on delete cascade,
  gw           smallint check (gw between 1 and 38),
  event_type   text not null,
  player_name  text not null,
  amount_cents integer not null check (amount_cents >= 0),
  created_at   timestamptz not null default now()
);

-- The two access patterns: the whole room's receipt, and one manager's gameweek
-- (deleted and rewritten when a gameweek is re-pasted).
create index if not exists bill_charges_room_id_created_at_idx
  on public.bill_charges (room_id, created_at desc);
create index if not exists bill_charges_manager_gw_idx
  on public.bill_charges (manager_id, gw);

-- Row level security --------------------------------------------------------
-- RLS is on with open policies rather than off, so tightening later is a policy
-- change rather than a security posture change.
alter table public.rooms          enable row level security;
alter table public.managers       enable row level security;
alter table public.roster_players enable row level security;
alter table public.bill_charges   enable row level security;

do $$
declare t text;
begin
  foreach t in array array['rooms', 'managers', 'roster_players', 'bill_charges'] loop
    execute format('drop policy if exists %I on public.%I', t || '_anon_all', t);
    execute format(
      'create policy %I on public.%I for all to anon, authenticated using (true) with check (true)',
      t || '_anon_all', t
    );
  end loop;
end $$;
