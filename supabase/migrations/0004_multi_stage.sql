-- Bracket Night — multi-stage group pipeline format.
-- Adds 'multi_stage' to the allowed tournament formats. The stage pipeline
-- itself lives in the existing tournaments.config jsonb (no new columns).

alter table public.tournaments
  drop constraint if exists tournaments_format_check;

alter table public.tournaments
  add constraint tournaments_format_check
  check (format in (
    'round_robin',
    'single_elim',
    'double_elim',
    'triple_elim',
    'group_knockout',
    'multi_stage'
  ));
