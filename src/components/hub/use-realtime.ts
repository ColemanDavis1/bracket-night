"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Live updates for a tournament's hub (Feature 14).
 *
 * Subscribes to Supabase Realtime for the tournament's match_results and
 * tournaments rows; any change triggers a server re-fetch via router.refresh().
 * If Realtime never connects or drops, it falls back to polling every 30s, so
 * the page still stays fresh without Realtime enabled.
 *
 * Returns the connection state so the UI can show a "Live" / "Reconnecting…"
 * indicator. Realtime is never required for core functionality.
 */
export function useRealtimeRefresh(tournamentId: string): "live" | "polling" {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  // Coalesce bursts of changes into a single refresh.
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => {
      if (pending.current) clearTimeout(pending.current);
      pending.current = setTimeout(() => router.refresh(), 250);
    };

    const channel = supabase
      .channel(`hub:${tournamentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "match_results",
          filter: `tournament_id=eq.${tournamentId}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tournaments",
          filter: `id=eq.${tournamentId}`,
        },
        refresh,
      )
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
      });

    return () => {
      if (pending.current) clearTimeout(pending.current);
      supabase.removeChannel(channel);
    };
  }, [tournamentId, router]);

  // Polling fallback whenever Realtime isn't connected.
  useEffect(() => {
    if (connected) return;
    const id = setInterval(() => router.refresh(), 30000);
    return () => clearInterval(id);
  }, [connected, router]);

  return connected ? "live" : "polling";
}
