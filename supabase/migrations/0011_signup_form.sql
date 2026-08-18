-- Custom sign-up forms for large events.
--
-- The form definition (questions, required flags, close time) lives in
-- tournaments.config.signupForm as jsonb. Answers live here, one map per
-- person, keyed by question id. Team-scope answers are stored on the captain's
-- row, since a team sign-up is a single submission.
--
-- player_id links a registrant who is themselves a bracket entrant, which is
-- how the "individual sign-up" style works: approving the person creates their
-- players row. In team mode the link lives on teams.player_id instead and this
-- column stays null.

alter table public.registrants
  add column if not exists answers jsonb not null default '{}'::jsonb;

alter table public.registrants
  add column if not exists player_id uuid
    references public.players (id) on delete set null;

create index if not exists registrants_player_idx
  on public.registrants (player_id);

-- Parse a config timestamp without raising. A malformed closesAt must not make
-- every sign-up insert error out; it should simply leave the form open, which
-- is what formClosed() does client-side. Marked stable, not immutable, because
-- text -> timestamptz depends on the session TimeZone.
create or replace function public.parse_ts(value text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
  return value::timestamptz;
exception when others then
  return null;
end;
$$;

-- Extend the public sign-up policy with the close time. Everything else is
-- carried over from 0010 unchanged: pending/native rows only, sign-ups on, the
-- event not complete, and the signup_type allowed by config.signupMode.
--
-- A missing or unparseable closesAt leaves the form open, matching
-- formClosed() in src/lib/signup/form-schema.ts.
drop policy if exists registrants_insert_signup on public.registrants;
create policy registrants_insert_signup on public.registrants
  for insert with check (
    status = 'pending'
    and source = 'native'
    and exists (
      select 1 from public.tournaments t
      where t.id = registrants.tournament_id
        and coalesce((t.config ->> 'signupEnabled')::boolean, false) = true
        and t.status <> 'complete'
        and coalesce(t.config ->> 'signupMode', 'both') in (
          'both',
          case
            when registrants.signup_type = 'team' then 'team_only'
            else 'solo_only'
          end
        )
        and (
          (t.config -> 'signupForm' ->> 'closesAt') is null
          or public.parse_ts(t.config -> 'signupForm' ->> 'closesAt') is null
          or public.parse_ts(t.config -> 'signupForm' ->> 'closesAt') > now()
        )
    )
  );
