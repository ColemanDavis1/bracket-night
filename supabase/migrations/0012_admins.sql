-- Shared access: an owner can invite other people to help run an event.
--
-- Invites are by email, because the person may not have an account yet. The
-- role function matches either the linked user_id or the email on the caller's
-- JWT, so an invite works the moment they sign in — no separate claim step.
--
-- Roles (see src/lib/access/roles.ts, the readable copy of this):
--   owner       the creator. Everything, including access and deletion.
--   admin       runs the event; no access changes, no deletion.
--   registrar   sign-up form, sign-ups, rosters.
--   scorekeeper scores and the call board.
--
-- Enforcement is layered. This migration draws the line the database can see:
-- owner-only for deletion and access, owner/admin for tournament settings, and
-- any accepted role for the child tables. The finer split between registrar and
-- scorekeeper is enforced by capability checks in the server actions, which are
-- the only write path the app uses.

create table if not exists public.tournament_admins (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  -- Linked on first successful access; null while the invite is outstanding.
  user_id uuid references auth.users (id) on delete set null,
  email text not null,
  role text not null check (role in ('admin', 'registrar', 'scorekeeper')),
  invited_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tournament_id, email)
);

create index if not exists tournament_admins_tournament_idx
  on public.tournament_admins (tournament_id);
create index if not exists tournament_admins_email_idx
  on public.tournament_admins (lower(email));
create index if not exists tournament_admins_user_idx
  on public.tournament_admins (user_id);

alter table public.tournament_admins enable row level security;

-- The caller's role on an event: 'owner', an invited role, or null.
create or replace function public.tournament_role(tid uuid)
returns text
language sql
stable
security definer set search_path = public
as $$
  select case
    when exists (
      select 1 from public.tournaments t
      where t.id = tid and t.organizer_id = auth.uid()
    ) then 'owner'
    else (
      select a.role from public.tournament_admins a
      where a.tournament_id = tid
        and (
          a.user_id = auth.uid()
          or lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
      limit 1
    )
  end;
$$;

-- Any accepted role counts as an organizer for the child tables (players,
-- results, teams, registrants, stations, previews). Redefining this one
-- function grants shared access everywhere it is already used, instead of
-- rewriting a dozen policies.
create or replace function public.is_organizer(tid uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select public.tournament_role(tid) is not null;
$$;

-- Owner-only, to keep 'is the owner' meaningful now that is_organizer is broader.
create or replace function public.is_owner(tid uuid)
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

-- ------------------------- tournaments (re-scoped) --------------------------
-- Settings changes: owner or co-organizer. Deletion stays with the owner.
drop policy if exists tournaments_update_own on public.tournaments;
create policy tournaments_update_own on public.tournaments
  for update
  using (public.tournament_role(id) in ('owner', 'admin'))
  with check (public.tournament_role(id) in ('owner', 'admin'));

drop policy if exists tournaments_delete_own on public.tournaments;
create policy tournaments_delete_own on public.tournaments
  for delete using (auth.uid() = organizer_id);

-- --------------------------- tournament_admins ------------------------------
-- Deliberately not public: this table holds invitees' email addresses. Readable
-- by the owner, and by an invitee looking up their own row.
drop policy if exists tournament_admins_select on public.tournament_admins;
create policy tournament_admins_select on public.tournament_admins
  for select using (
    public.is_owner(tournament_id)
    or user_id = auth.uid()
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- Only the owner hands out or revokes access.
drop policy if exists tournament_admins_write_owner on public.tournament_admins;
create policy tournament_admins_write_owner on public.tournament_admins
  for all
  using (public.is_owner(tournament_id))
  with check (public.is_owner(tournament_id));

-- An invitee may link their own row on first access (user_id + accepted_at).
drop policy if exists tournament_admins_accept_self on public.tournament_admins;
create policy tournament_admins_accept_self on public.tournament_admins
  for update
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  with check (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
