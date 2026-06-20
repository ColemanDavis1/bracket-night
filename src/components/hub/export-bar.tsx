"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Check, Copy, Download, ImageDown, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tournamentCsv } from "@/lib/csv";
import { recordLine, type NameMap } from "@/lib/hub-helpers";
import type { EngineState } from "@/lib/engine";
import type { HubTournament } from "./types";

export function ExportBar({
  tournament,
  state,
  names,
}: {
  tournament: HubTournament;
  state: EngineState;
  names: NameMap;
}) {
  const [copied, setCopied] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  function publicUrl() {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/t/${tournament.slug}`;
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }

  function download(filename: string, content: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadCsv() {
    download(
      `${tournament.slug}.csv`,
      tournamentCsv(tournament.name, state, names),
      "text/csv",
    );
  }

  async function downloadImage() {
    if (!cardRef.current) return;
    const { toPng } = await import("html-to-image");
    const dataUrl = await toPng(cardRef.current, {
      pixelRatio: 2,
      backgroundColor: "#0a0a0c",
    });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${tournament.slug}-card.png`;
    a.click();
  }

  const top = state.overallStandings.slice(0, 5);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={copyLink}>
        {copied ? <Check className="text-broadcast-green" /> : <Copy />}
        {copied ? "Copied" : "Share link"}
      </Button>
      <Button variant="outline" size="sm" onClick={downloadCsv}>
        <Download /> CSV
      </Button>
      <Button variant="outline" size="sm" asChild>
        <Link href={`/t/${tournament.slug}/print`} target="_blank">
          <Printer /> Print
        </Link>
      </Button>
      <Button variant="outline" size="sm" onClick={downloadImage}>
        <ImageDown /> Image
      </Button>

      {/* Off-screen card rendered to PNG on demand. */}
      <div className="pointer-events-none fixed -left-[9999px] top-0">
        <div
          ref={cardRef}
          className="w-[600px] bg-background p-8 text-foreground"
          style={{ fontFamily: "var(--font-sans)" }}
        >
          <div className="flex items-center justify-between">
            <span className="text-2xl font-extrabold tracking-tight">
              <span className="rounded-md bg-primary px-2 py-1 text-primary-foreground">
                ⟨⟩
              </span>{" "}
              {tournament.name}
            </span>
            {state.complete ? (
              <span className="rounded-full bg-broadcast-gold px-3 py-1 text-sm font-bold text-black">
                FINAL
              </span>
            ) : (
              <span className="rounded-full bg-primary px-3 py-1 text-sm font-bold text-primary-foreground">
                LIVE
              </span>
            )}
          </div>
          {state.complete && state.championId ? (
            <p className="mt-4 text-lg">
              🏆 Champion:{" "}
              <span className="font-extrabold text-broadcast-gold">
                {names[state.championId] ?? "—"}
              </span>
            </p>
          ) : null}
          <table className="mt-6 w-full">
            <tbody>
              {top.map((r) => (
                <tr key={r.participantId} className="border-b border-border">
                  <td className="py-2 text-2xl font-extrabold text-primary">
                    {r.rank}
                  </td>
                  <td className="py-2 pl-3 text-lg font-bold">{r.name}</td>
                  <td className="py-2 text-right font-mono text-lg">
                    {recordLine(r)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-6 text-sm text-muted-foreground">
            {tournament.gameName ? `${tournament.gameName} · ` : ""}Follow live at{" "}
            /t/{tournament.slug}
          </p>
        </div>
      </div>
    </div>
  );
}
