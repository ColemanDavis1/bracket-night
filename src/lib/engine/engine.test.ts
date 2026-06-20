import { describe, expect, it } from "vitest";
import { buildEngineState, type TournamentConfig } from "./index";
import { makePlayers, playToCompletion } from "./testHelpers";

describe("seeding rounds -> single elimination (the demo scenario)", () => {
  const players = makePlayers(6);
  const config: TournamentConfig = {
    format: "single_elim",
    scoringMode: "scored",
    tiebreak: "points_scored",
    drawSeed: 1234,
    seedingMethod: "seeding_rounds",
    seedingRounds: 2,
  };

  it("starts in the seeding phase with seeds undecided", () => {
    const state = buildEngineState(config, players, []);
    expect(state.phase).toBe("seeding");
    expect(state.seeds).toBeNull();
    // 6 players, 2 seeding rounds -> 6 seeding matches, no bracket yet.
    expect(state.matches.filter((m) => m.stage === "seeding").length).toBe(6);
    expect(state.matches.some((m) => m.stage === "knockout")).toBe(false);
  });

  it("draws the bracket once seeding completes and finishes with a champion", () => {
    const { state } = playToCompletion(config, players);
    expect(state.complete).toBe(true);
    expect(state.seeds).not.toBeNull();
    expect(state.seeds!.length).toBe(6);
    expect(state.championId).not.toBeNull();
    // Bracket of 8 -> top 2 seeds get round-1 byes.
    const r1byes = state.matches.filter(
      (m) => m.stage === "knockout" && m.roundNumber === 1 && m.status === "bye",
    );
    expect(r1byes.length).toBe(2);
  });
});

describe("round robin", () => {
  it("everyone plays everyone once and a champion emerges", () => {
    const players = makePlayers(5);
    const config: TournamentConfig = {
      format: "round_robin",
      scoringMode: "scored",
      tiebreak: "points_scored",
      drawSeed: 1,
      seedingMethod: "random",
    };
    const { state } = playToCompletion(config, players);
    expect(state.complete).toBe(true);
    // 5 players RR -> C(5,2) = 10 games.
    expect(state.matches.filter((m) => m.status === "done").length).toBe(10);
    expect(state.championId).toBe("p1");
    expect(state.overallStandings[0]!.participantId).toBe("p1");
  });
});

describe("withdrawals", () => {
  it("a withdrawn player forfeits remaining games and sinks in the table", () => {
    const players = makePlayers(4).map((p) =>
      p.id === "p3" ? { ...p, withdrawn: true } : p,
    );
    const config: TournamentConfig = {
      format: "round_robin",
      scoringMode: "win_loss",
      tiebreak: "points_scored",
      drawSeed: 1,
      seedingMethod: "random",
    };
    const state = buildEngineState(config, players, []);
    // p3's matches should auto-resolve as forfeits (status bye, forfeit flag).
    const p3matches = state.matches.filter(
      (m) => m.aId === "p3" || m.bId === "p3",
    );
    expect(p3matches.every((m) => m.status === "bye" && m.forfeit)).toBe(true);
    const p3row = state.overallStandings.find((r) => r.participantId === "p3")!;
    expect(p3row.withdrawn).toBe(true);
  });
});
