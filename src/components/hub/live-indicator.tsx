"use client";

import { Radio, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRealtimeRefresh } from "./use-realtime";

/**
 * Mounts the Realtime subscription for a tournament and shows a small live /
 * reconnecting indicator. Safe to drop anywhere inside a hub view.
 */
export function LiveIndicator({
  tournamentId,
  className,
}: {
  tournamentId: string;
  className?: string;
}) {
  const status = useRealtimeRefresh(tournamentId);
  const live = status === "live";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        live
          ? "border-broadcast-green/40 text-broadcast-green"
          : "border-border text-muted-foreground",
        className,
      )}
      title={live ? "Live updates on" : "Reconnecting — polling every 30s"}
    >
      {live ? (
        <Radio className="h-3 w-3 animate-pulse-red" />
      ) : (
        <RefreshCw className="h-3 w-3 animate-spin" />
      )}
      {live ? "Live" : "Reconnecting…"}
    </span>
  );
}
