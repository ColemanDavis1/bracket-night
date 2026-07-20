/**
 * Parse a Google Form CSV export (or any CSV) into registrants for the Team
 * Builder. Columns are mapped flexibly by header (case-insensitive); a "solo"
 * response becomes a solo registrant and a "team" response becomes a captain
 * plus any listed teammates grouped under the team name.
 *
 * Pure — no DB, no React. The wizard/hub parse + preview here, then hand the
 * result to the `importRegistrantsCsv` server action.
 */

export interface ParsedRegistrant {
  name: string;
  email?: string;
  phone?: string;
  signupType: "solo" | "team";
  /** For team rows: the team name this person belongs to. */
  teamName?: string;
  /** True for the person who registered the team (its first member). */
  isCaptain?: boolean;
}

/** Column indexes for each field. `undefined` = column not present. */
export interface ColumnMapping {
  name?: number;
  email?: number;
  phone?: number;
  soloOrTeam?: number;
  teamName?: number;
  teammates?: number;
}

export interface RegistrantImportPreview {
  /** Everyone that will actually be inserted (deduped, within capacity). */
  toAdd: ParsedRegistrant[];
  /** Full-team sign-ups, grouped by team name. */
  teams: { name: string; members: ParsedRegistrant[] }[];
  /** Solo sign-ups (the pool). */
  solos: ParsedRegistrant[];
  /** Skipped because a same-name(+email) person already exists or repeats. */
  duplicates: number;
  /** Dropped because the capacity cap was reached. */
  overflow: number;
}

/**
 * RFC-4180-ish CSV parser: handles quoted fields, escaped quotes (""), and
 * newlines inside quotes. Returns non-empty rows of trimmed-later cells.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const s = text.replace(/\r\n?/g, "\n");

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const has = (h: string, ...needles: string[]) =>
  needles.some((n) => h.includes(n));

/**
 * Best-effort header detection. Order matters: "Team Name" must not be mistaken
 * for the person's name column. Returns a mapping the caller can adjust in a UI.
 */
export function detectColumns(header: readonly string[]): ColumnMapping {
  const h = header.map((c) => c.trim().toLowerCase());
  const mapping: ColumnMapping = {};

  h.forEach((col, i) => {
    if (mapping.teamName === undefined && has(col, "team") && has(col, "name")) {
      mapping.teamName = i;
      return;
    }
    if (
      mapping.teammates === undefined &&
      has(col, "teammate", "team member", "roster", "other players", "members")
    ) {
      mapping.teammates = i;
      return;
    }
    if (
      mapping.soloOrTeam === undefined &&
      (has(col, "solo", "individual") ||
        (has(col, "team") && has(col, "or", "signing", "type", "join")))
    ) {
      mapping.soloOrTeam = i;
      return;
    }
    if (mapping.email === undefined && has(col, "email", "e-mail")) {
      mapping.email = i;
      return;
    }
    if (mapping.phone === undefined && has(col, "phone", "mobile", "cell")) {
      mapping.phone = i;
      return;
    }
    if (mapping.name === undefined && has(col, "name")) {
      mapping.name = i;
      return;
    }
  });

  // Fallback: if no name column matched, use the first non-timestamp column.
  if (mapping.name === undefined) {
    const idx = h.findIndex((c) => c && !has(c, "timestamp"));
    if (idx >= 0) mapping.name = idx;
  }
  return mapping;
}

const cell = (row: readonly string[], idx: number | undefined): string =>
  idx === undefined ? "" : (row[idx] ?? "").trim();

/** Split a teammates cell on commas, semicolons, slashes, or newlines. */
function splitNames(value: string): string[] {
  return value
    .split(/[,;/\n]+/)
    .map((n) => n.trim())
    .filter(Boolean);
}

/**
 * Parse CSV text into a flat list of registrants. Team rows expand into a
 * captain plus any listed teammates, all sharing the team name.
 */
export function parseRegistrants(
  text: string,
  mappingOverride?: ColumnMapping,
): ParsedRegistrant[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const header = rows[0]!;
  const mapping = mappingOverride ?? detectColumns(header);
  const out: ParsedRegistrant[] = [];

  for (const row of rows.slice(1)) {
    const name = cell(row, mapping.name);
    if (!name) continue;

    const teamName = cell(row, mapping.teamName);
    const soloOrTeam = cell(row, mapping.soloOrTeam).toLowerCase();
    let signupType: "solo" | "team";
    if (soloOrTeam) {
      signupType = has(soloOrTeam, "team") ? "team" : "solo";
    } else {
      signupType = teamName ? "team" : "solo";
    }

    const email = cell(row, mapping.email) || undefined;
    const phone = cell(row, mapping.phone) || undefined;

    if (signupType === "solo") {
      out.push({ name, email, phone, signupType: "solo" });
      continue;
    }

    // Team row: captain + teammates under a shared team name.
    const team = teamName || `${name}'s Team`;
    out.push({
      name,
      email,
      phone,
      signupType: "team",
      teamName: team,
      isCaptain: true,
    });
    for (const mate of splitNames(cell(row, mapping.teammates))) {
      out.push({ name: mate, signupType: "team", teamName: team });
    }
  }
  return out;
}

const dedupeKey = (r: ParsedRegistrant) =>
  `${r.name.trim().toLowerCase()}${r.email ? `|${r.email.trim().toLowerCase()}` : ""}`;

/**
 * Reconcile parsed registrants against existing people and a capacity cap.
 * Dedupes case-insensitively by name (+ email when present), groups team
 * sign-ups, and reports duplicates / overflow — mirroring `previewImport`.
 */
export function previewRegistrantImport(
  parsed: readonly ParsedRegistrant[],
  existingNames: readonly string[],
  capacity = Number.POSITIVE_INFINITY,
): RegistrantImportPreview {
  // Existing people are known by name only; dedupe within the import by the
  // composite name(+email) key so two distinct people who share a name but
  // have different emails are both kept.
  const existing = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  const seen = new Set<string>();
  const toAdd: ParsedRegistrant[] = [];
  let duplicates = 0;
  let overflow = 0;

  for (const r of parsed) {
    const nameKey = r.name.trim().toLowerCase();
    const key = dedupeKey(r);
    if (existing.has(nameKey) || seen.has(key)) {
      duplicates++;
      continue;
    }
    if (toAdd.length >= capacity) {
      overflow++;
      continue;
    }
    seen.add(key);
    toAdd.push(r);
  }

  const teamMap = new Map<string, ParsedRegistrant[]>();
  const solos: ParsedRegistrant[] = [];
  for (const r of toAdd) {
    if (r.signupType === "team" && r.teamName) {
      const list = teamMap.get(r.teamName) ?? [];
      list.push(r);
      teamMap.set(r.teamName, list);
    } else {
      solos.push(r);
    }
  }
  const teams = [...teamMap.entries()].map(([name, members]) => ({ name, members }));

  return { toAdd, teams, solos, duplicates, overflow };
}
