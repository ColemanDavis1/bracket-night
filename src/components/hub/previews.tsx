"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { EngineState } from "@/lib/engine";
import { matchupName, type NameMap } from "@/lib/hub-helpers";
import { getMatchPreview, type PreviewResult } from "@/lib/actions/preview";

export function Previews({
  tournamentId,
  state,
  names,
}: {
  tournamentId: string;
  state: EngineState;
  names: NameMap;
}) {
  const ready = state.matches
    .filter((m) => m.status === "ready")
    .sort((a, b) => a.order - b.order)
    .slice(0, 6);

  if (ready.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Previews show up for matchups that are ready to play.
      </p>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {ready.map((m) => {
        const { a, b } = matchupName(m, names);
        return (
          <PreviewCard
            key={m.key}
            tournamentId={tournamentId}
            matchKey={m.key}
            label={m.label}
            a={a}
            b={b}
          />
        );
      })}
    </div>
  );
}

function PreviewCard({
  tournamentId,
  matchKey,
  label,
  a,
  b,
}: {
  tournamentId: string;
  matchKey: string;
  label: string;
  a: string;
  b: string;
}) {
  const [data, setData] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getMatchPreview(tournamentId, matchKey)
      .then((res) => {
        if (active) setData(res);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tournamentId, matchKey]);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <Badge variant="outline">{label}</Badge>
        {data ? (
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {data.source === "ai" ? "AI analyst" : "Preview"}
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-base font-extrabold">
        {a} <span className="text-muted-foreground">vs</span> {b}
      </p>

      {loading ? (
        <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Writing the preview…
        </div>
      ) : data ? (
        <>
          <div className="mt-3 flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2 text-sm">
            <Target className="h-4 w-4 text-primary" />
            <span>
              Pick: <span className="font-bold">{data.predictedWinnerName}</span>{" "}
              <span className="text-muted-foreground">
                ({Math.round(data.prediction.confidence * 100)}% confidence)
              </span>
            </span>
          </div>
          <p className="mt-3 flex gap-2 text-sm leading-relaxed text-muted-foreground">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-broadcast-gold" />
            <span>{data.body}</span>
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Preview unavailable.
        </p>
      )}
    </div>
  );
}
