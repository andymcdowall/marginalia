// 6 characters of lowercase base36, randomly generated; thread IDs and comment IDs share one
// namespace within a file (SPEC.md §5.2).
const ID_LENGTH = 6;
const BASE = 36;

export function generateId(existing: ReadonlySet<string> = new Set()): string {
  let id: string;
  do {
    id = randomBase36(ID_LENGTH);
  } while (existing.has(id));
  return id;
}

function randomBase36(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += (bytes[i]! % BASE).toString(BASE);
  }
  return out;
}
