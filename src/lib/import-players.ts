/**
 * Parse pasted text or a CSV/TXT file into a clean list of player names.
 * - One name per line; for CSV rows the first column is used.
 * - Trims whitespace and surrounding quotes, skips blank lines.
 * - Drops a leading header row ("name" / "player").
 */
export function parsePlayerNames(text: string): string[] {
  const names: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const firstCell = raw.includes(",") ? (raw.split(",")[0] ?? "") : raw;
    const name = firstCell.trim().replace(/^"(.*)"$/, "$1").trim();
    if (name) names.push(name);
  }
  const first = names[0];
  if (first && /^(name|player|player name|players)$/i.test(first)) {
    names.shift();
  }
  return names;
}

export interface ImportPreview {
  /** Names that will actually be added (unique, within capacity). */
  toAdd: string[];
  /** How many parsed names were skipped because they already exist or repeat. */
  duplicates: number;
  /** How many were dropped because the player cap was reached. */
  overflow: number;
}

/**
 * Reconcile parsed names against the players already entered and a capacity cap.
 */
export function previewImport(
  parsed: string[],
  existingNames: string[],
  capacity: number,
): ImportPreview {
  const seen = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  const toAdd: string[] = [];
  let duplicates = 0;
  let overflow = 0;
  for (const name of parsed) {
    const key = name.toLowerCase();
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    if (toAdd.length >= capacity) {
      overflow++;
      continue;
    }
    seen.add(key);
    toAdd.push(name);
  }
  return { toAdd, duplicates, overflow };
}
