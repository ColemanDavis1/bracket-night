-- Bracket Night — enable Supabase Realtime (Feature 14).
-- The public hub and TV mode subscribe to changes on these tables so scores
-- appear live. Guarded so re-running the migration is a no-op.

do $$
begin
  begin
    alter publication supabase_realtime add table public.match_results;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.tournaments;
  exception when duplicate_object then null;
  end;
end $$;
