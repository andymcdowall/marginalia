// SPEC.md §10.2. Every character belongs to exactly one token.
export const TOKEN_RE = /\s+|[\p{L}\p{N}_]+(?:['’][\p{L}\p{N}_]+)*|[^\s\p{L}\p{N}_]/gu;

export type Token = { text: string; from: number; to: number };

export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  for (const m of text.matchAll(TOKEN_RE)) {
    out.push({ text: m[0], from: m.index, to: m.index + m[0].length });
  }
  return out;
}
