-- Bracket Night — player self-service scoring (Feature 15).
-- Players with the public link can submit a proposed result for a match. It is
-- held as "pending" until the organizer approves it (which writes the real
-- match_results row) or rejects it.

create table if not exists public.pending_results (
  id               uuid primary key default gen_random_uuid(),
  tournament_id    uuid not null references public.tournaments (id) on delete cascade,
  match_key        text not null,
  submitted_by     text,
  winner_player_id uuid references public.players (id) on delete set null,
  score_a          int,
  score_b          int,
  is_draw          boolean not null default false,
  status           text not null default 'pending'
                     check (status in ('pending', 'approved', 'rejected')),
  reason           text,
  created_at       timestamptz not null default now()
);

create index if not exists pending_results_tournament_idx
  on public.pending_results (tournament_id);

-- Rate-limit: at most one PENDING submission per match at a time.
create unique index if not exists pending_results_one_per_match
  on public.pending_results (tournament_id, match_key)
  where status = 'pending';

alter table public.pending_results enable row level security;

-- Public read so the hub can show "awaiting approval" state.
drop policy if exists pending_results_select_public on public.pending_results;
create policy pending_results_select_public on public.pending_results
  for select using (true);

-- Anyone may submit, but only when the tournament has self-service scoring on
-- and is still running.
drop policy if exists pending_results_insert_selfservice on public.pending_results;
create policy pending_results_insert_selfservice on public.pending_results
  for insert with check (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and coalesce((t.config ->> 'selfServiceScoring')::boolean, false) = true
        and t.status <> 'complete'
    )
  );

-- The organizer approves / rejects / clears submissions.
drop policy if exists pending_results_write_organizer on public.pending_results;
create policy pending_results_write_organizer on public.pending_results
  for all
  using (public.is_organizer(tournament_id))
  with check (public.is_organizer(tournament_id));

-- Live updates so the organizer sees submissions arrive without refreshing.
do $$
begin
  begin
    alter publication supabase_realtime add table public.pending_results;
  exception when duplicate_object then null;
  end;
end $$;
