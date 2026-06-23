"use client";

import { useEffect, useRef, useState } from "react";
import { Radio, Trophy, CheckCircle2 } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { Ticker } from "./ticker";
import { matchupName, recordLine, rankingMovement } from "@/lib/hub-helpers";
import { ChevronUp, ChevronDown, Minus } from "lucide-react";
import { completedRounds } from "@/lib/engine";
import type { HubData } from "./types";
import { nameMapOf } from "@/lib/hub-helpers";
import { useRealtimeRefresh } from "./use-realtime";

const ROTATE_MS = 9000;

export function TvShow({ data }: { data: HubData }) {
  const names = nameMapOf(data.players);
  const { state, tournament } = data;

  // Live updates via Realtime, with a built-in 30s polling fallback.
  useRealtimeRefresh(tournament.id);

  const scenes = buildScenes(data, names);
  const [i, setI] = useState(0);

  // Full-screen "Round Complete" interstitial when a round finishes.
  const completed = completedRounds(state);
  const completedCount = completed.length;
  const prevCompleted = useRef<number | null>(null);
  const [interstitial, setInterstitial] = useState<string | null>(null);
  useEffect(() => {
    if (prevCompleted.current !== null && completedCount > prevCompleted.current) {
      const label = completed[completed.length - 1]?.label ?? "Round";
      setInterstitial(label);
      const id = setTimeout(() => setInterstitial(null), 4500);
      prevCompleted.current = completedCount;
      return () => clearTimeout(id);
    }
    prevCompleted.current = completedCount;
  }, [completedCount, completed]);

  // Auto-rotate scenes.
  useEffect(() => {
    const id = setInterval(() => setI((x) => (x + 1) % scenes.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [scenes.length]);

  const scene = scenes[i] ?? scenes[0];

  if (interstitial) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background text-center">
        <CheckCircle2 className="h-24 w-24 text-broadcast-green" />
        <p className="mt-6 text-3xl font-bold uppercase tracking-[0.3em] text-broadcast-green">
          Round complete
        </p>
        <p className="scorenum mt-3 text-6xl">{interstitial}</p>
        {state.phaseTransition ? (
          <p className="mt-6 text-2xl font-bold uppercase tracking-widest text-broadcast-gold">
            {state.phaseTransition.from} complete — {state.phaseTransition.to}{" "}
            begins next
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex items-center justify-between px-8 py-5">
        <BrandMark size="lg" />
        <div className="text-right">
          <p className="text-xl font-extrabold tracking-tight">
            {tournament.name}
          </p>
          <p className="text-sm uppercase tracking-widest text-primary">
            {scene?.label}
          </p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-8">
        <div className="w-full max-w-5xl">{scene?.node}</div>
      </div>

      {/* Scene progress dots */}
      <div className="flex justify-center gap-2 py-4">
        {scenes.map((_, idx) => (
          <span
            key={idx}
            className={`h-1.5 rounded-full transition-all ${
              idx === i ? "w-8 bg-primary" : "w-3 bg-muted"
            }`}
          />
        ))}
      </div>

      <Ticker state={state} names={names} />
    </div>
  );
}

function buildScenes(
  data: HubData,
  names: Record<string, string>,
): { label: string; node: React.ReactNode }[] {
  const { state } = data;
  const scenes: { label: string; node: React.ReactNode }[] = [];

  if (state.phaseTransition) {
    scenes.push({
      label: "Phase change",
      node: (
        <div className="text-center">
          <CheckCircle2 className="mx-auto h-20 w-20 text-broadcast-gold" />
          <p className="mt-6 text-3xl font-bold uppercase tracking-widest text-broadcast-gold">
            {state.phaseTransition.from} complete
          </p>
          <p className="mt-2 text-5xl font-extrabold">
            {state.phaseTransition.to} begins next
          </p>
        </div>
      ),
    });
  }

  if (state.complete && state.championId) {
    scenes.push({
      label: "Champion",
      node: (
        <div className="text-center">
          <Trophy className="mx-auto h-20 w-20 text-broadcast-gold" />
          <p className="mt-4 text-2xl font-bold uppercase tracking-widest text-broadcast-gold">
            Your champion
          </p>
          <p className="scorenum mt-2 text-7xl">
            {names[state.championId] ?? "—"}
          </p>
        </div>
      ),
    });
  }

  const stationCount = Math.min(8, Math.max(1, data.tournament.numStations ?? 1));
  const ready = state.matches
    .filter((m) => m.status === "ready")
    .sort((a, b) => a.order - b.order);
  const current = ready[0];
  const live = ready.slice(0, stationCount);
  if (current && stationCount === 1) {
    const { a, b } = matchupName(current, names);
    scenes.push({
      label: "Now playing",
      node: (
        <div className="text-center">
          <span className="inline-flex items-center gap-2 text-lg font-bold uppercase tracking-widest text-primary">
            <Radio className="h-5 w-5 animate-pulse-red" /> Now playing
          </span>
          <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-8">
            <p className="text-right text-5xl font-extrabold">{a}</p>
            <span className="scorenum text-4xl text-muted-foreground">VS</span>
            <p className="text-left text-5xl font-extrabold">{b}</p>
          </div>
          <p className="mt-6 text-lg text-muted-foreground">{current.label}</p>
        </div>
      ),
    });
  } else if (current) {
    // Parallel stations: split-screen the live matches.
    scenes.push({
      label: `Now playing · ${live.length} stations`,
      node: (
        <div>
          <span className="mb-6 flex items-center justify-center gap-2 text-lg font-bold uppercase tracking-widest text-primary">
            <Radio className="h-5 w-5 animate-pulse-red" /> Now playing
          </span>
          <div className="grid gap-4 sm:grid-cols-2">
            {live.map((m, idx) => {
              const { a, b } = matchupName(m, names);
              return (
                <div
                  key={m.key}
                  className="rounded-2xl border border-primary/30 bg-card/50 p-6 text-center"
                >
                  <p className="text-sm font-bold uppercase tracking-widest text-primary">
                    Station {idx + 1}
                  </p>
                  <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <p className="text-right text-2xl font-extrabold sm:text-3xl">
                      {a}
                    </p>
                    <span className="scorenum text-xl text-muted-foreground">
                      VS
                    </span>
                    <p className="text-left text-2xl font-extrabold sm:text-3xl">
                      {b}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ),
    });
  }

  if (state.overallStandings.some((r) => r.played > 0)) {
    scenes.push({
      label: "Standings",
      node: (
        <table className="w-full text-2xl">
          <tbody>
            {state.overallStandings.slice(0, 8).map((r) => (
              <tr key={r.participantId} className="border-b border-border">
                <td className="py-3 pr-4 text-right">
                  <span className="scorenum text-3xl text-primary">{r.rank}</span>
                </td>
                <td className="py-3 font-bold">{r.name}</td>
                <td className="py-3 text-right font-mono">{recordLine(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ),
    });

    const ranking = state.overallStandings.map((r) => r.participantId);
    const move = rankingMovement(ranking, data.prevRanking);
    scenes.push({
      label: "Power rankings",
      node: (
        <ol className="space-y-3 text-2xl">
          {ranking.slice(0, 8).map((id, idx) => {
            const d = move.get(id) ?? 0;
            return (
              <li
                key={id}
                className="flex items-center gap-4 border-b border-border pb-2"
              >
                <span className="scorenum w-12 text-center text-3xl">
                  {idx + 1}
                </span>
                {d > 0 ? (
                  <ChevronUp className="h-6 w-6 text-broadcast-green" />
                ) : d < 0 ? (
                  <ChevronDown className="h-6 w-6 text-broadcast-red" />
                ) : (
                  <Minus className="h-6 w-6 text-muted-foreground" />
                )}
                <span className="font-bold">{names[id] ?? "—"}</span>
              </li>
            );
          })}
        </ol>
      ),
    });
  }

  if (ready.length > stationCount) {
    scenes.push({
      label: "Up next",
      node: (
        <div className="space-y-4 text-3xl">
          {ready.slice(stationCount, stationCount + 4).map((m) => {
            const { a, b } = matchupName(m, names);
            return (
              <div
                key={m.key}
                className="flex items-center justify-center gap-4 border-b border-border pb-3 font-bold"
              >
                <span>{a}</span>
                <span className="text-xl text-muted-foreground">vs</span>
                <span>{b}</span>
              </div>
            );
          })}
        </div>
      ),
    });
  }

  if (scenes.length === 0) {
    scenes.push({
      label: "Standing by",
      node: (
        <p className="text-center text-3xl text-muted-foreground">
          Waiting for the first game…
        </p>
      ),
    });
  }

  return scenes;
}
