-- Bracket Night — soft-delete (archive) support.
-- Archived tournaments stay in the database and remain visible to their
-- organizer, but their public hub is hidden (403-style message).

alter table public.tournaments
  add column if not exists archived_at timestamptz;

create index if not exists tournaments_archived_idx
  on public.tournaments (organizer_id, archived_at);
