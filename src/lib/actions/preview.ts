"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeTournamentState,
  type MatchResultRow,
  type PlayerRow,
  type TournamentRow,
} from "@/lib/db";
import {
  buildPreviewContext,
  generateAiPreview,
  predictWinner,
  previewInputsHash,
  templatePreview,
  type MatchPreview,
} from "@/lib/ai/preview";

export interface PreviewResult extends MatchPreview {
  predictedWinnerName: string;
}

/**
 * Get (or generate + cache) the matchup preview for a given match.
 *
 * Works for public viewers too: reads use the public-readable tables, and cache
 * writes go through the service-role client (best-effort — if the service-role
 * key isn't configured we simply skip caching and still return a fresh result).
 */
export async function getMatchPreview(
  tournamentId: string,
  matchKey: string,
): Promise<PreviewResult | null> {
  const supabase = await createClient();

  const { data: t } = await supabase
    .from("tournaments")
    .select("*")
    .eq("id", tournamentId)
    .single();
  if (!t) return null;
  const tournament = t as TournamentRow;

  const [{ data: players }, { data: results }] = await Promise.all([
    supabase.from("players").select("*").eq("tournament_id", tournamentId),
    supabase.from("match_results").select("*").eq("tournament_id", tournamentId),
  ]);

  const { state } = computeTournamentState(
    tournament,
    (players ?? []) as PlayerRow[],
    (results ?? []) as MatchResultRow[],
  );

  const match = state.matches.find((m) => m.key === matchKey);
  if (!match || !match.aId || !match.bId) return null;

  const ctx = buildPreviewContext(
    match,
    state.overallStandings,
    state.matches,
    tournament.ai_tone,
    tournament.scoring_mode,
  );
  if (!ctx) return null;

  const prediction = predictWinner(ctx);
  const inputsHash = previewInputsHash(ctx);
  const nameById = new Map((players ?? []).map((p) => [p.id, p.name as string]));
  const predictedWinnerName = nameById.get(prediction.predictedWinnerId) ?? "—";

  // Best-effort cache via service role (bypasses RLS for public viewers).
  let admin: ReturnType<typeof createAdminClient> | null = null;
  try {
    admin = createAdminClient();
  } catch {
    admin = null;
  }

  if (admin) {
    const { data: cached } = await admin
      .from("ai_previews")
      .select("*")
      .eq("tournament_id", tournamentId)
      .eq("match_key", matchKey)
      .maybeSingle();
    if (cached && cached.inputs_hash === inputsHash && cached.tone === ctx.tone) {
      return {
        prediction,
        predictedWinnerName,
        body: cached.body,
        source: cached.source,
        inputsHash,
      };
    }
  }

  const ai = await generateAiPreview(ctx, prediction);
  const body = ai ?? templatePreview(ctx, prediction);
  const source: "ai" | "template" = ai ? "ai" : "template";

  if (admin) {
    await admin.from("ai_previews").upsert(
      {
        tournament_id: tournamentId,
        match_key: matchKey,
        tone: ctx.tone,
        predicted_winner: prediction.predictedWinnerId,
        body,
        source,
        inputs_hash: inputsHash,
      },
      { onConflict: "tournament_id,match_key" },
    );
  }

  return { prediction, predictedWinnerName, body, source, inputsHash };
}
