import { Award, Flame, TrendingUp, Trophy, Zap } from "lucide-react";
import type { EngineState } from "@/lib/engine";
import { computeAwards, type NameMap } from "@/lib/hub-helpers";

export function Awards({
  state,
  names,
}: {
  state: EngineState;
  names: NameMap;
}) {
  const awards = computeAwards(state, names);
  const final = state.complete;

  return (
    <div className="space-y-4">
      {final ? (
        <div className="rounded-xl border border-broadcast-gold/40 bg-broadcast-gold/10 p-5 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-broadcast-gold">
            Final awards
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            The numbers are in. Here&apos;s who shined.
          </p>
        </div>
      ) : (
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Running stat leaders
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard
          icon={Trophy}
          label={final ? "MVP" : "Leader"}
          value={awards.mvp?.name ?? "—"}
          accent="gold"
        />
        <StatCard
          icon={TrendingUp}
          label="Points Leader"
          value={awards.pointsLeader?.name ?? "—"}
          sub={
            awards.pointsLeader
              ? `${awards.pointsLeader.value} pts`
              : "No scoring yet"
          }
        />
        <StatCard
          icon={Flame}
          label="Longest Streak"
          value={awards.longestStreak?.name ?? "—"}
          sub={
            awards.longestStreak
              ? `${awards.longestStreak.value} in a row`
              : "No streaks yet"
          }
          accent="red"
        />
        <StatCard
          icon={Zap}
          label="Biggest Upset"
          value={
            awards.biggestUpset
              ? `${awards.biggestUpset.winnerName} def. ${awards.biggestUpset.loserName}`
              : "—"
          }
          sub={
            awards.biggestUpset
              ? `${awards.biggestUpset.label} · +${awards.biggestUpset.gap} seeds`
              : "No upsets yet"
          }
        />
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: typeof Award;
  label: string;
  value: string;
  sub?: string;
  accent?: "gold" | "red";
}) {
  const color =
    accent === "gold"
      ? "text-broadcast-gold"
      : accent === "red"
        ? "text-broadcast-red"
        : "text-primary";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <p className="mt-2 font-extrabold leading-tight">{value}</p>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}
