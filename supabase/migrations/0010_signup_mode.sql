-- Sign-up mode: which paths the public sign-up page accepts.
--
-- config.signupMode is one of 'both' (default, and the behavior before this
-- migration), 'team_only' (players form their own rosters and register
-- together), or 'solo_only' (everyone registers alone; the organizer builds the
-- teams from the pool).
--
-- The server action rejects a disallowed signup_type with a friendly message;
-- this policy is the real gate, so a direct anon-key insert can't bypass it.
-- Organizer writes (walk-ins, manual adds, CSV imports) go through
-- registrants_write_organizer and are deliberately unaffected.

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
    )
  );
