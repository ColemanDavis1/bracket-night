-- Bracket Night — court/station assignment + "now playing / up next" call board.
--
-- Live, per-match operational state keyed like match_results by
-- (tournament_id, match_key). Ephemeral: NEVER consumed by the engine. A pure
-- display/queue layer over already-scheduled matches.

create table if not exists public.station_assignments (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  match_key     text not null,
  station       int,          -- index into stationLabels / numStations; null = unassigned/queued
  state         text not null default 'queued' check (state in ('queued','playing','done')),
  called_at     timestamptz,  -- when the match was "called to court"
  updated_at    timestamptz not null default now(),
  unique (tournament_id, match_key)
);

create index if not exists station_assignments_tournament_idx
  on public.station_assignments (tournament_id);

drop trigger if exists station_assignments_touch on public.station_assignments;
create trigger station_assignments_touch before update on public.station_assignments
  for each row execute function public.touch_updated_at();

alter table public.station_assignments enable row level security;

-- Public read: the TV call board and per-team schedule views read court
-- assignments without auth (mirrors how the hub/TV already read results).
drop policy if exists station_assignments_select_public on public.station_assignments;
create policy station_assignments_select_public on public.station_assignments
  for select using (true);

-- Only the organizer writes station state. No public insert/update/delete.
drop policy if exists station_assignments_write_organizer on public.station_assignments;
create policy station_assignments_write_organizer on public.station_assignments
  for all
  using (public.is_organizer(tournament_id))
  with check (public.is_organizer(tournament_id));

-- Live call board: push station changes to the TV/hub without a refresh.
do $$
begin
  begin
    alter publication supabase_realtime add table public.station_assignments;
  exception when duplicate_object then null;
  end;
end $$;
