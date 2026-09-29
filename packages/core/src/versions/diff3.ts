// Parses `git merge-file --diff3`'s marker output (SPEC.md §9.4's MergeView) into alternating
// plain-text and conflict segments, and re-renders a chosen resolution per conflict back to text.
export type Diff3Segment =
  | { kind: "text"; text: string }
  | { kind: "conflict"; ours: string; base: string; theirs: string };

export function parseDiff3(markedText: string): Diff3Segment[] {
  const lines = markedText.split("\n");
  const segments: Diff3Segment[] = [];
  let textBuffer: string[] = [];
  let i = 0;

  function flushText(): void {
    if (textBuffer.length > 0) {
      segments.push({ kind: "text", text: textBuffer.join("\n") });
      textBuffer = [];
    }
  }

  while (i < lines.length) {
    const line = lines[i]!;
    if (line.startsWith("<<<<<<< ")) {
      flushText();
      i++;
      const ours: string[] = [];
      while (i < lines.length && !lines[i]!.startsWith("||||||| ")) {
        ours.push(lines[i]!);
        i++;
      }
      i++; // skip the "||||||| base" marker line
      const base: string[] = [];
      while (i < lines.length && lines[i] !== "=======") {
        base.push(lines[i]!);
        i++;
      }
      i++; // skip "======="
      const theirs: string[] = [];
      while (i < lines.length && !lines[i]!.startsWith(">>>>>>> ")) {
        theirs.push(lines[i]!);
        i++;
      }
      i++; // skip the ">>>>>>> theirs" marker line
      segments.push({ kind: "conflict", ours: ours.join("\n"), base: base.join("\n"), theirs: theirs.join("\n") });
    } else {
      textBuffer.push(line);
      i++;
    }
  }
  flushText();
  return segments;
}

export type ConflictResolution = { kind: "ours" } | { kind: "theirs" } | { kind: "both" } | { kind: "edit"; text: string };

export function renderDiff3Resolution(segments: Diff3Segment[], resolutions: ConflictResolution[]): string {
  const parts: string[] = [];
  let conflictIndex = 0;
  for (const seg of segments) {
    if (seg.kind === "text") {
      parts.push(seg.text);
      continue;
    }
    const resolution: ConflictResolution = resolutions[conflictIndex++] ?? { kind: "ours" };
    if (resolution.kind === "ours") parts.push(seg.ours);
    else if (resolution.kind === "theirs") parts.push(seg.theirs);
    else if (resolution.kind === "both") parts.push([seg.ours, seg.theirs].filter(Boolean).join("\n"));
    else parts.push(resolution.text);
  }
  return parts.join("\n");
}

export function countConflicts(segments: Diff3Segment[]): number {
  return segments.filter((s) => s.kind === "conflict").length;
}
