-- Bracket Night — schema
-- Run order: 0001_schema.sql then 0002_rls.sql. Seed via `npm run seed`.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- profiles: lightweight mirror of auth.users so we can show organizer names.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  display_name text,
  created_at   timestamptz not null default now()
);

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- tournaments
-- ---------------------------------------------------------------------------
create table if not exists public.tournaments (
  id             uuid primary key default gen_random_uuid(),
  organizer_id   uuid not null references auth.users (id) on delete cascade,
  name           text not null,
  game_name      text,
  event_date     date,
  slug           text not null unique,

  format         text not null
                 check (format in ('round_robin','single_elim','double_elim','triple_elim','group_knockout')),
  scoring_mode   text not null check (scoring_mode in ('win_loss','scored')),
  seeding_method text not null check (seeding_method in ('manual','random','seeding_rounds')),
  tiebreak       text not null default 'points_scored'
                 check (tiebreak in ('points_scored','points_allowed')),
  ai_tone        text not null default 'analyst'
                 check (ai_tone in ('hype','trash_talk','analyst')),

  draw_seed      bigint not null default 0,
  status         text not null default 'setup' check (status in ('setup','live','complete')),

  -- Remaining engine config (seedingRounds, numGroups, advancePerGroup,
  -- knockoutFormat, groupDraw, roundRobinDouble, groupDoubleRoundRobin,
  -- manualSeedOrder, manualGroups). Kept as jsonb to avoid a wide table.
  config         jsonb not null default '{}'::jsonb,

  -- Power-ranking movement arrows compare current vs previous snapshot.
  power_ranking      jsonb not null default '[]'::jsonb,
  prev_power_ranking jsonb not null default '[]'::jsonb,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists tournaments_organizer_idx on public.tournaments (organizer_id);
create index if not exists tournaments_slug_idx on public.tournaments (slug);

-- ---------------------------------------------------------------------------
-- players (participants are per-tournament only in the MVP)
-- ---------------------------------------------------------------------------
create table if not exists public.players (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  name          text not null,
  seed          int,             -- organizer's manual seed input (optional)
  position      int not null default 0,   -- entry order
  withdrawn     boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists players_tournament_idx on public.players (tournament_id);

-- ---------------------------------------------------------------------------
-- match_results: only organizer-entered RESULTS are persisted. The full
-- schedule/bracket is derived deterministically by the engine from the
-- tournament config + players + these results (keyed by the engine match key).
-- ---------------------------------------------------------------------------
create table if not exists public.match_results (
  id               uuid primary key default gen_random_uuid(),
  tournament_id    uuid not null references public.tournaments (id) on delete cascade,
  match_key        text not null,
  winner_player_id uuid references public.players (id) on delete set null,
  score_a          int,
  score_b          int,
  is_draw          boolean not null default false,
  forfeit          boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (tournament_id, match_key)
);

create index if not exists match_results_tournament_idx on public.match_results (tournament_id);

-- ---------------------------------------------------------------------------
-- ai_previews: cached pre-game matchup previews (AI text + heuristic pick).
-- ---------------------------------------------------------------------------
create table if not exists public.ai_previews (
  id                 uuid primary key default gen_random_uuid(),
  tournament_id      uuid not null references public.tournaments (id) on delete cascade,
  match_key          text not null,
  tone               text not null,
  predicted_winner   uuid references public.players (id) on delete set null,
  body               text not null,
  source             text not null default 'ai' check (source in ('ai','template')),
  inputs_hash        text not null,   -- invalidate the cache when context changes
  created_at         timestamptz not null default now(),
  unique (tournament_id, match_key)
);

create index if not exists ai_previews_tournament_idx on public.ai_previews (tournament_id);

-- Keep updated_at fresh.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tournaments_touch on public.tournaments;
create trigger tournaments_touch before update on public.tournaments
  for each row execute function public.touch_updated_at();

drop trigger if exists match_results_touch on public.match_results;
create trigger match_results_touch before update on public.match_results
  for each row execute function public.touch_updated_at();
