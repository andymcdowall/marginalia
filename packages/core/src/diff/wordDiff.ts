import { diff_match_patch } from "diff-match-patch";
import { tokenize, type Token } from "./tokenize.js";
import { dropWhitespaceOnlyHunks, type Hunk } from "./hunks.js";

// Private-use code points, so token-encoding never collides with real text. Once the BMP private
// use area (0xE000-0xF8FF, ~6400 code points) is exhausted, roll into a supplementary private-use
// plane — those need two UTF-16 units per char, which is why encoding tracks per-unit token
// indices below rather than assuming one unit == one token.
const BMP_PUA_START = 0xe000;
const BMP_PUA_END = 0xf8ff;
const SUPPLEMENTARY_PUA_START = 0x100000;

function makeAllocator(): () => string {
  let next = BMP_PUA_START;
  return () => {
    const ch = String.fromCodePoint(next);
    next = next === BMP_PUA_END ? SUPPLEMENTARY_PUA_START : next + 1;
    return ch;
  };
}

type Encoding = { encoded: string; unitToTokenIndex: number[] };

function encode(tokens: Token[], tokenToChar: Map<string, string>, allocate: () => string): Encoding {
  const chars: string[] = new Array(tokens.length);
  const unitToTokenIndex: number[] = [];
  tokens.forEach((tok, idx) => {
    let ch = tokenToChar.get(tok.text);
    if (ch === undefined) {
      ch = allocate();
      tokenToChar.set(tok.text, ch);
    }
    for (let u = 0; u < ch.length; u++) unitToTokenIndex.push(idx);
    chars[idx] = ch;
  });
  const encoded = chars.join("");
  return { encoded, unitToTokenIndex };
}

type Range = { from: number; to: number };

// Maps a run of `len` encoded UTF-16 units starting at `startUnit` back to a clean-text character
// range, via the token each unit belongs to. `len === 0` means "an anchor point" (for a pure
// insert's base position, or a pure delete's cur position) rather than a real span.
function tokenRangeFor(unitToTok: number[], tokens: Token[], text: string, startUnit: number, len: number): Range {
  if (len === 0) {
    if (startUnit < unitToTok.length) {
      const from = tokens[unitToTok[startUnit]!]!.from;
      return { from, to: from };
    }
    const last = tokens[tokens.length - 1];
    const pos = last ? last.to : text.length;
    return { from: pos, to: pos };
  }
  const fromIdx = unitToTok[startUnit]!;
  const toIdx = unitToTok[startUnit + len - 1]!;
  return { from: tokens[fromIdx]!.from, to: tokens[toIdx]!.to };
}

// SPEC.md §10.2. `baseClean`/`curClean` are already-cleaned text (see cleanText.ts). Adjacent
// delete+insert diff ops merge into one replace hunk.
export function wordDiff(baseClean: string, curClean: string): Hunk[] {
  const baseTokens = tokenize(baseClean);
  const curTokens = tokenize(curClean);

  const tokenToChar = new Map<string, string>();
  const allocate = makeAllocator();
  const baseEnc = encode(baseTokens, tokenToChar, allocate);
  const curEnc = encode(curTokens, tokenToChar, allocate);

  const dmp = new diff_match_patch();
  const diffs = dmp.diff_main(baseEnc.encoded, curEnc.encoded, false);
  dmp.diff_cleanupSemantic(diffs);

  const hunks: Hunk[] = [];
  let baseUnit = 0;
  let curUnit = 0;
  let nextId = 0;

  const baseRangeAt = (unit: number, len: number) => tokenRangeFor(baseEnc.unitToTokenIndex, baseTokens, baseClean, unit, len);
  const curRangeAt = (unit: number, len: number) => tokenRangeFor(curEnc.unitToTokenIndex, curTokens, curClean, unit, len);

  for (let i = 0; i < diffs.length; i++) {
    const [op, text] = diffs[i]!;
    const len = text.length;

    if (op === 0) {
      baseUnit += len;
      curUnit += len;
      continue;
    }

    if (op === -1) {
      const baseRange = baseRangeAt(baseUnit, len);
      const deleted = baseClean.slice(baseRange.from, baseRange.to);
      baseUnit += len;

      const next = diffs[i + 1];
      if (next && next[0] === 1) {
        const insLen = next[1].length;
        const curRange = curRangeAt(curUnit, insLen);
        const inserted = curClean.slice(curRange.from, curRange.to);
        curUnit += insLen;
        i++; // consume the merged insert
        hunks.push({ id: nextId++, baseFrom: baseRange.from, baseTo: baseRange.to, curFrom: curRange.from, curTo: curRange.to, deleted, inserted });
      } else {
        const curRange = curRangeAt(curUnit, 0);
        hunks.push({ id: nextId++, baseFrom: baseRange.from, baseTo: baseRange.to, curFrom: curRange.from, curTo: curRange.to, deleted, inserted: "" });
      }
      continue;
    }

    // op === 1: pure insert (no preceding delete — that case was consumed above)
    const curRange = curRangeAt(curUnit, len);
    const inserted = curClean.slice(curRange.from, curRange.to);
    curUnit += len;
    const baseRange = baseRangeAt(baseUnit, 0);
    hunks.push({ id: nextId++, baseFrom: baseRange.from, baseTo: baseRange.to, curFrom: curRange.from, curTo: curRange.to, deleted: "", inserted });
  }

  return dropWhitespaceOnlyHunks(hunks).map((h, i) => ({ ...h, id: i }));
}
