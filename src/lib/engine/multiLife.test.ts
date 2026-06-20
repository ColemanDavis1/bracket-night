import { describe, expect, it } from "vitest";
import { buildMultiLifeElimination } from "./multiLife";
import { makePlayers, playToCompletion } from "./testHelpers";
import type { TournamentConfig } from "./index";

describe("triple elimination (multi-life)", () => {
  function config(): TournamentConfig {
    return {
      format: "triple_elim",
      scoringMode: "win_loss",
      tiebreak: "points_scored",
      drawSeed: 1,
      seedingMethod: "manual",
      manualSeedOrder: makePlayers(6).map((p) => p.id),
    };
  }

  it("eliminates every non-champion with exactly 3 losses (6 players)", () => {
    const players = makePlayers(6);
    const { state, results } = playToCompletion(config(), players);
    expect(state.complete).toBe(true);
    expect(state.championId).not.toBeNull();

    // Recount losses from the result log.
    const losses = new Map<string, number>(players.map((p) => [p.id, 0]));
    const final = buildMultiLifeElimination(
      players.map((p) => p.id),
      results,
      3,
    );
    for (const m of final.matches) {
      const r = results.find((x) => x.matchKey === m.key);
      if (r && r.winnerId && m.aRef.kind === "participant") {
        const a = m.aRef.id;
        const b = m.bRef.kind === "participant" ? m.bRef.id : null;
        if (b) {
          const loser = r.winnerId === a ? b : a;
          losses.set(loser, (losses.get(loser) ?? 0) + 1);
        }
      }
    }
    for (const p of players) {
      if (p.id === state.championId) {
        expect(losses.get(p.id)!).toBeLessThan(3);
      } else {
        expect(losses.get(p.id)).toBe(3);
      }
    }
  });

  it("crowns the strongest player when there are no upsets", () => {
    const players = makePlayers(8);
    const cfg = config();
    cfg.seedingMethod = "manual";
    cfg.manualSeedOrder = players.map((p) => p.id);
    const { state } = playToCompletion(cfg, players);
    expect(state.championId).toBe("p1");
  });

  it("gives a non-penalizing bye on odd counts (5 players)", () => {
    const players = makePlayers(5);
    const built = buildMultiLifeElimination(
      players.map((p) => p.id),
      [],
      3,
    );
    const round1 = built.matches.filter((m) => m.roundNumber === 1);
    const byes = round1.filter((m) => m.bRef.kind === "bye");
    expect(byes.length).toBe(1);
  });
});
