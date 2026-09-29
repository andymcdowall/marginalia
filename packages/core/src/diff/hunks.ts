// SPEC.md §10.2. Offsets are in CLEAN text (post cleanText.ts).
export type Hunk = {
  id: number;
  baseFrom: number;
  baseTo: number;
  curFrom: number;
  curTo: number;
  deleted: string;
  inserted: string;
};

function isWhitespaceOrEmpty(s: string): boolean {
  return s === "" || /^\s+$/.test(s);
}

// Hunks that are whitespace-only on both sides are dropped (whitespace changes are hidden).
export function dropWhitespaceOnlyHunks(hunks: Hunk[]): Hunk[] {
  return hunks.filter((h) => !(isWhitespaceOrEmpty(h.deleted) && isWhitespaceOrEmpty(h.inserted)));
}
