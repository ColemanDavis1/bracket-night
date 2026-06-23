-- Bracket Night — best-of-N series support (Feature 13).
-- A match in an elimination bracket can be a best-of-3/5 series. The individual
-- game scores are stored as a jsonb array on the match result; the existing
-- winner_player_id / score_a / score_b hold the series winner and games won.

alter table public.match_results
  add column if not exists series_games jsonb;
