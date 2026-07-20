-- Bracket Night — Team Builder (large-event sign-up + roster).
--
-- Two new "people" tables that sit ON TOP of the tournament engine. A team is
-- 1:1 with a players row (the bracket entrant); the engine never reads these
-- tables. registrants is one row per person (solo pool or team member).
--
-- RLS mirrors the pending_results blueprint (0007): the organizer has full
-- access; the public may insert pending registrants ONLY when the parent
-- tournament has signups enabled and isn't complete.

-- ---------------------------------------------------------------------------
-- teams: human/roster metadata for a bracket entrant.
-- ---------------------------------------------------------------------------
create table if not exists public.teams (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  player_id     uuid references public.players (id) on delete set null, -- the bracket entrant; null until finalized
  name          text not null,
  target_size   int,          -- per-team override; null inherits config.teamSize.target
  min_size      int,          -- per-team override; null inherits config.teamSize.min
  max_size      int,          -- per-team override; null inherits config.teamSize.max
  locked        boolean not null default false,  -- organizer freezes roster
  checked_in    boolean not null default false,  -- team has physically arrived
  checked_in_at timestamptz,
  position      int not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists teams_tournament_idx on public.teams (tournament_id);
create index if not exists teams_player_idx on public.teams (player_id);

-- ---------------------------------------------------------------------------
-- registrants: one row per person. Solo sign-ups have team_id = null until
-- assigned/auto-filled. Full-team sign-ups arrive as a set of registrants that
-- share a client-provided team name (source='native'); the organizer
-- reconciles them into a real teams row on approval.
-- ---------------------------------------------------------------------------
create table if not exists public.registrants (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  team_id       uuid references public.teams (id) on delete set null,
  name          text not null,
  email         text,
  phone         text,
  signup_type   text not null default 'solo' check (signup_type in ('solo','team')),
  is_captain    boolean not null default false,   -- the person who registered a full team
  -- The team name a full-team signup asked for, before a teams row exists.
  proposed_team text,
  status        text not null default 'pending' check (status in ('pending','approved','declined')),
  source        text not null default 'manual' check (source in ('native','google_csv','manual','walkin')),
  checked_in    boolean not null default false,  -- person has physically arrived
  checked_in_at timestamptz,
  notes         text,
  created_at    timestamptz not null default now()
);

create index if not exists registrants_tournament_idx on public.registrants (tournament_id);
create index if not exists registrants_team_idx on public.registrants (team_id);

alter table public.teams       enable row level security;
alter table public.registrants enable row level security;

-- ------------------------------- teams ------------------------------------
-- Public read so the per-team schedule / roster board views work without auth.
drop policy if exists teams_select_public on public.teams;
create policy teams_select_public on public.teams
  for select using (true);

drop policy if exists teams_write_organizer on public.teams;
create policy teams_write_organizer on public.teams
  for all
  using (public.is_organizer(tournament_id))
  with check (public.is_organizer(tournament_id));

-- ---------------------------- registrants ----------------------------------
drop policy if exists registrants_select_public on public.registrants;
create policy registrants_select_public on public.registrants
  for select using (true);

-- Organizer: full access.
drop policy if exists registrants_write_organizer on public.registrants;
create policy registrants_write_organizer on public.registrants
  for all
  using (public.is_organizer(tournament_id))
  with check (public.is_organizer(tournament_id));

-- Public sign-up: anyone may INSERT, but only a pending/native row, and only
-- when the tournament has signups enabled and isn't complete. This is the sole
-- public write path (no public update/delete). Mirrors 0007's blueprint.
drop policy if exists registrants_insert_signup on public.registrants;
create policy registrants_insert_signup on public.registrants
  for insert with check (
    status = 'pending'
    and source = 'native'
    and exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and coalesce((t.config ->> 'signupEnabled')::boolean, false) = true
        and t.status <> 'complete'
    )
  );

-- Live roster/approval updates without a refresh.
do $$
begin
  begin
    alter publication supabase_realtime add table public.teams;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.registrants;
  exception when duplicate_object then null;
  end;
end $$;
