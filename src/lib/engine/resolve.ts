import type {
  GeneratedMatch,
  MatchResult,
  Participant,
  ResolvedMatch,
  SlotRef,
} from "./types";

type SlotState = "real" | "empty" | "tbd";

/**
 * Resolve generated matches into concrete matches given the seed list and any
 * recorded results. Walks matches in generation order (which generators emit in
 * dependency order) so winner/loser references are always available by the time
 * they are read.
 *
 * The key subtlety is distinguishing three slot states:
 *  - "real": a live participant occupies the slot,
 *  - "empty": the slot is settled but has nobody (a structural bye, or the
 *    loser of a bye match — there is no loser to drop into the losers bracket),
 *  - "tbd": the upstream match hasn't been decided yet.
 *
 * Only when both slots are settled (real/empty) can a match auto-advance a bye
 * or be marked ready; a "tbd" slot keeps the match pending.
 */
export function resolveMatches(
  generated: readonly GeneratedMatch[],
  seeds: readonly string[],
  results: readonly MatchResult[],
  participants: readonly Participant[],
): ResolvedMatch[] {
  const resultByKey = new Map(results.map((r) => [r.matchKey, r]));
  const withdrawn = new Set(
    participants.filter((p) => p.withdrawn).map((p) => p.id),
  );
  const winnerOf = new Map<string, string | null>();
  const loserOf = new Map<string, string | null>();
  const settled = new Set<string>();
  const byKey = new Map<string, ResolvedMatch>();
  const out: ResolvedMatch[] = [];

  const resolveRef = (ref: SlotRef): { id: string | null; slot: SlotState } => {
    switch (ref.kind) {
      case "seed": {
        const id = seeds[ref.seed - 1] ?? null;
        return { id, slot: id ? "real" : "empty" };
      }
      case "participant":
        return { id: ref.id, slot: "real" };
      case "bye":
        return { id: null, slot: "empty" };
      case "tbd":
        return { id: null, slot: "tbd" };
      case "winner": {
        if (!settled.has(ref.matchKey)) return { id: null, slot: "tbd" };
        const id = winnerOf.get(ref.matchKey) ?? null;
        return { id, slot: id ? "real" : "empty" };
      }
      case "loser": {
        if (!settled.has(ref.matchKey)) return { id: null, slot: "tbd" };
        const id = loserOf.get(ref.matchKey) ?? null;
        return { id, slot: id ? "real" : "empty" };
      }
    }
  };

  for (const g of generated) {
    const a = resolveRef(g.aRef);
    const b = resolveRef(g.bRef);

    const m: ResolvedMatch = {
      ...g,
      aId: a.id,
      bId: b.id,
      status: "pending",
      winnerId: null,
      loserId: null,
      scoreA: null,
      scoreB: null,
      isDraw: false,
      forfeit: false,
    };

    // Grand-final reset: void GF-2 if the winners-bracket player won GF-1.
    // Keys may be namespaced per stage (e.g. "S3-GF-2"); derive the sibling.
    if (g.key.endsWith("GF-2")) {
      const gf1 = byKey.get(g.key.slice(0, -1) + "1");
      if (gf1 && gf1.status === "done" && gf1.winnerId === gf1.aId) {
        m.status = "bye";
        m.voided = true;
        m.aId = null;
        m.bId = null;
        finalize(m);
        continue;
      }
    }

    const result = resultByKey.get(g.key);
    if (result) {
      m.status = "done";
      m.scoreA = result.scoreA;
      m.scoreB = result.scoreB;
      m.isDraw = result.isDraw;
      m.forfeit = result.forfeit;
      m.winnerId = result.isDraw ? null : result.winnerId;
      finalize(m);
      continue;
    }

    const aWithdrawn = a.id !== null && withdrawn.has(a.id);
    const bWithdrawn = b.id !== null && withdrawn.has(b.id);
    const aLive = a.slot === "real" && !aWithdrawn;
    const bLive = b.slot === "real" && !bWithdrawn;

    // Still waiting on an upstream result.
    if (a.slot === "tbd" || b.slot === "tbd") {
      finalize(m);
      continue;
    }

    if (aLive && bLive) {
      m.status = "ready";
    } else if (aLive && !bLive) {
      m.status = "bye";
      m.winnerId = a.id;
      m.forfeit = bWithdrawn; // a real but withdrawn opponent -> forfeit win
    } else if (bLive && !aLive) {
      m.status = "bye";
      m.winnerId = b.id;
      m.forfeit = aWithdrawn;
    } else {
      // Neither side is live: a structural empty match. Settled with no winner.
      m.status = "bye";
      m.voided = true;
    }
    finalize(m);
  }

  function finalize(m: ResolvedMatch): void {
    if (m.winnerId) {
      const loser = m.winnerId === m.aId ? m.bId : m.aId;
      m.loserId = loser ?? null;
      winnerOf.set(m.key, m.winnerId);
      loserOf.set(m.key, loser ?? null);
    } else {
      winnerOf.set(m.key, null);
      loserOf.set(m.key, null);
    }
    if (m.status === "done" || m.status === "bye") settled.add(m.key);
    byKey.set(m.key, m);
    out.push(m);
  }

  return out;
}

/** The crowned champion, if the tournament has a single decisive final. */
export function championOf(resolved: readonly ResolvedMatch[]): string | null {
  const gf2 = resolved.find((m) => m.key === "GF-2");
  if (gf2 && !gf2.voided) {
    return gf2.status === "done" ? gf2.winnerId : null;
  }
  const gf1 = resolved.find((m) => m.key === "GF-1");
  if (gf1) return gf1.status === "done" ? gf1.winnerId : null;

  // Single-elim / knockout: winner of the highest-ordered decisive match.
  const finals = resolved.filter(
    (m) => m.stage === "knockout" || m.stage === "winners",
  );
  if (finals.length === 0) return null;
  const last = finals.reduce((acc, m) => (m.order > acc.order ? m : acc));
  return last.status === "done" ? last.winnerId : null;
}

/** Whether every match that can be played has a result (or was a bye/void). */
export function isComplete(resolved: readonly ResolvedMatch[]): boolean {
  if (resolved.length === 0) return false;
  return resolved.every(
    (m) => m.status === "done" || m.status === "bye" || m.voided === true,
  );
}
