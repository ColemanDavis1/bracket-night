-- Bracket Night — Row Level Security
--
-- Model: every tournament has a PUBLIC, read-only hub at /t/[slug], so anyone
-- (including anonymous visitors) may SELECT tournaments and their children.
-- Only the owning organizer may INSERT / UPDATE / DELETE.

alter table public.profiles      enable row level security;
alter table public.tournaments   enable row level security;
alter table public.players       enable row level security;
alter table public.match_results enable row level security;
alter table public.ai_previews   enable row level security;

-- ----------------------------- profiles -----------------------------------
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select using (auth.uid() = id);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- --------------------------- tournaments -----------------------------------
-- Public read (the shared hub). Writes restricted to the organizer.
drop policy if exists tournaments_select_public on public.tournaments;
create policy tournaments_select_public on public.tournaments
  for select using (true);

drop policy if exists tournaments_insert_own on public.tournaments;
create policy tournaments_insert_own on public.tournaments
  for insert with check (auth.uid() = organizer_id);

drop policy if exists tournaments_update_own on public.tournaments;
create policy tournaments_update_own on public.tournaments
  for update using (auth.uid() = organizer_id) with check (auth.uid() = organizer_id);

drop policy if exists tournaments_delete_own on public.tournaments;
create policy tournaments_delete_own on public.tournaments
  for delete using (auth.uid() = organizer_id);

-- Helper: is the current user the organizer of tournament :tid ?
create or replace function public.is_organizer(tid uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.tournaments t
    where t.id = tid and t.organizer_id = auth.uid()
  );
$$;

-- ------------------------------ players ------------------------------------
drop policy if exists players_select_public on public.players;
create policy players_select_public on public.players
  for select using (true);

drop policy if exists players_write_organizer on public.players;
create policy players_write_organizer on public.players
  for all
  using (public.is_organizer(tournament_id))
  with check (public.is_organizer(tournament_id));

-- --------------------------- match_results ---------------------------------
drop policy if exists match_results_select_public on public.match_results;
create policy match_results_select_public on public.match_results
  for select using (true);

drop policy if exists match_results_write_organizer on public.match_results;
create policy match_results_write_organizer on public.match_results
  for all
  using (public.is_organizer(tournament_id))
  with check (public.is_organizer(tournament_id));

-- ---------------------------- ai_previews ----------------------------------
-- Public read. Inserts/updates by the organizer; the server may also write
-- using the service-role key (which bypasses RLS) to cache previews generated
-- on behalf of anonymous viewers.
drop policy if exists ai_previews_select_public on public.ai_previews;
create policy ai_previews_select_public on public.ai_previews
  for select using (true);

drop policy if exists ai_previews_write_organizer on public.ai_previews;
create policy ai_previews_write_organizer on public.ai_previews
  for all
  using (public.is_organizer(tournament_id))
  with check (public.is_organizer(tournament_id));
