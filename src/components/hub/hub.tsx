"use client";

import Link from "next/link";
import { Tv } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BrandMark } from "@/components/brand";
import { nameMapOf } from "@/lib/hub-helpers";
import { FORMAT_LABELS } from "@/lib/labels";
import type { HubData } from "./types";
import { Scoreboard } from "./scoreboard";
import { Schedule } from "./schedule";
import { StandingsTable } from "./standings-table";
import { PowerRankings } from "./power-rankings";
import { Previews } from "./previews";
import { Awards } from "./awards";
import { Bracket } from "./bracket";
import { Ticker } from "./ticker";
import { ExportBar } from "./export-bar";
import { PlayersAdmin } from "./players-admin";
import { PhaseBar } from "./phase-bar";
import { ShareDialog } from "./share-dialog";
import { LiveIndicator } from "./live-indicator";
import { PendingApprovals } from "./pending-approvals";

export function Hub({ data }: { data: HubData }) {
  const { tournament, players, state, prevRanking, isOrganizer, pending } = data;
  const showPending = isOrganizer && tournament.selfServiceScoring;
  const names = nameMapOf(players);
  const ranking = state.overallStandings.map((r) => r.participantId);

  const showBracket =
    tournament.format !== "round_robin" ||
    state.matches.some((m) => m.stage !== "round_robin");

  return (
    <div>
      <header className="border-b border-border">
        <div className="container flex items-center justify-between py-4">
          <Link href="/">
            <BrandMark />
          </Link>
          <div className="flex items-center gap-2">
            <LiveIndicator tournamentId={tournament.id} />
            {isOrganizer ? (
              <ShareDialog
                slug={tournament.slug}
                name={tournament.name}
                gameName={tournament.gameName}
                eventDate={tournament.eventDate}
              />
            ) : null}
            <Button asChild variant="outline" size="sm">
              <Link href={`/t/${tournament.slug}/tv`} target="_blank">
                <Tv /> TV mode
              </Link>
            </Button>
            {isOrganizer ? (
              <Button asChild variant="ghost" size="sm">
                <Link href="/dashboard">Dashboard</Link>
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <Ticker state={state} names={names} />
      <PhaseBar state={state} />

      <main className="container py-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <StatusBadge status={tournament.status} />
              <span className="text-xs text-muted-foreground">
                {FORMAT_LABELS[tournament.format]}
                {tournament.gameName ? ` · ${tournament.gameName}` : ""}
              </span>
            </div>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">
              {tournament.name}
            </h1>
            {!isOrganizer ? (
              <p className="text-sm text-muted-foreground">
                Live read-only hub. The organizer enters all scores.
              </p>
            ) : null}
            {tournament.notes ? (
              <div className="mt-3 max-w-prose rounded-lg border border-border bg-card/60 px-3 py-2 text-sm">
                <span className="mr-1.5 font-semibold text-primary">House rules:</span>
                <span className="whitespace-pre-wrap text-muted-foreground">
                  {tournament.notes}
                </span>
              </div>
            ) : null}
          </div>
          <ExportBar tournament={tournament} state={state} names={names} />
        </div>

        <Tabs defaultValue="scoreboard">
          <TabsList>
            <TabsTrigger value="scoreboard">Scoreboard</TabsTrigger>
            {showBracket ? (
              <TabsTrigger value="bracket">
                {tournament.format === "group_knockout"
                  ? "Groups & Bracket"
                  : tournament.format === "multi_stage"
                    ? "Stages"
                    : "Bracket"}
              </TabsTrigger>
            ) : null}
            <TabsTrigger value="schedule">Schedule</TabsTrigger>
            <TabsTrigger value="standings">Standings</TabsTrigger>
            <TabsTrigger value="power">Power Rankings</TabsTrigger>
            <TabsTrigger value="previews">Previews</TabsTrigger>
            <TabsTrigger value="awards">Stats & Awards</TabsTrigger>
            {isOrganizer ? <TabsTrigger value="players">Players</TabsTrigger> : null}
            {showPending ? (
              <TabsTrigger value="pending">
                Approvals
                {pending.length > 0 ? (
                  <Badge className="ml-1.5">{pending.length}</Badge>
                ) : null}
              </TabsTrigger>
            ) : null}
          </TabsList>

          <TabsContent value="scoreboard">
            <Scoreboard
              tournament={tournament}
              state={state}
              names={names}
              isOrganizer={isOrganizer}
              pendingKeys={pending.map((p) => p.matchKey)}
            />
          </TabsContent>

          {showBracket ? (
            <TabsContent value="bracket">
              <Bracket
                state={state}
                names={names}
                scoringMode={tournament.scoringMode}
              />
            </TabsContent>
          ) : null}

          <TabsContent value="schedule">
            <Schedule
              state={state}
              names={names}
              scoringMode={tournament.scoringMode}
              tournamentId={tournament.id}
              isOrganizer={isOrganizer}
              seriesLength={tournament.seriesLength}
            />
          </TabsContent>

          <TabsContent value="standings">
            <Card>
              <CardHeader>
                <CardTitle>Standings</CardTitle>
              </CardHeader>
              <CardContent>
                <StandingsTable
                  rows={state.overallStandings}
                  scoringMode={tournament.scoringMode}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="power">
            <PowerRankings
              standings={state.overallStandings}
              current={ranking}
              previous={prevRanking}
              names={names}
            />
          </TabsContent>

          <TabsContent value="previews">
            <Previews tournamentId={tournament.id} state={state} names={names} />
          </TabsContent>

          <TabsContent value="awards">
            <Awards state={state} names={names} />
          </TabsContent>

          {isOrganizer ? (
            <TabsContent value="players">
              <PlayersAdmin tournamentId={tournament.id} players={players} />
            </TabsContent>
          ) : null}

          {showPending ? (
            <TabsContent value="pending">
              <PendingApprovals
                pending={pending}
                state={state}
                names={names}
                scoringMode={tournament.scoringMode}
              />
            </TabsContent>
          ) : null}
        </Tabs>
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: HubData["tournament"]["status"] }) {
  if (status === "complete") return <Badge variant="gold">Final</Badge>;
  if (status === "live") return <Badge>Live</Badge>;
  return <Badge variant="muted">Setup</Badge>;
}
