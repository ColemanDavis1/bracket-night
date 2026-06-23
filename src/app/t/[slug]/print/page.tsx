import { notFound } from "next/navigation";
import { loadHub } from "@/lib/load-hub";
import { nameMapOf } from "@/lib/hub-helpers";
import { StandingsTable } from "@/components/hub/standings-table";
import { Bracket } from "@/components/hub/bracket";
import { PrintButton } from "@/components/hub/print-button";
import { FORMAT_LABELS } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function PrintPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await loadHub(slug);
  if (!result) notFound();
  const { tournament, state, players } = result.data;
  const names = nameMapOf(players);

  return (
    <div className="print-area mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">{tournament.name}</h1>
          <p className="text-sm text-muted-foreground">
            {FORMAT_LABELS[tournament.format]}
            {tournament.gameName ? ` · ${tournament.gameName}` : ""}
            {state.complete && state.championId
              ? ` · Champion: ${names[state.championId] ?? "—"}`
              : ""}
          </p>
        </div>
        <PrintButton />
      </div>

      {tournament.notes ? (
        <div className="mb-6 rounded-lg border border-border px-3 py-2 text-sm">
          <span className="mr-1.5 font-semibold">House rules:</span>
          <span className="whitespace-pre-wrap">{tournament.notes}</span>
        </div>
      ) : null}

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-widest text-muted-foreground">
          Standings
        </h2>
        <StandingsTable
          rows={state.overallStandings}
          scoringMode={tournament.scoringMode}
        />
      </section>

      <section className="break-inside-avoid">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-widest text-muted-foreground">
          {tournament.format === "multi_stage" ? "Stages" : "Bracket"}
        </h2>
        <Bracket
          state={state}
          names={names}
          scoringMode={tournament.scoringMode}
          expandAll
        />
      </section>
    </div>
  );
}
