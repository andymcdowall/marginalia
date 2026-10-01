import { describe, expect, it } from "vitest";
import type { Platform } from "@marginalia/core";
import { buildCombinedCss } from "../src/editor/useSectionCss.js";

function fakePlatform(files: Record<string, string>): Platform {
  return {
    fs: {
      readText: async (path: string) => {
        if (!(path in files)) throw new Error(`not found: ${path}`);
        return files[path]!;
      },
    },
  } as unknown as Platform;
}

describe("buildCombinedCss", () => {
  it("combines doc-wide and section CSS, aliased and scoped, doc-wide first", async () => {
    const platform = fakePlatform({
      "/vault/note.css": "h1 { color: navy; }",
      "/vault/part-one.css": "h1 { color: purple; }",
    });
    const sectionStyles = new Map([["Part One", "part-one.css"]]);
    const out = await buildCombinedCss(platform, "/vault", "note.css", sectionStyles);

    expect(out).toContain(".cm-editor h1, .cm-editor .cm-h1 { color: navy; }");
    expect(out).toContain('.cm-section-part-one h1, .cm-section-part-one .cm-h1 { color: purple; }');
    expect(out.indexOf("navy")).toBeLessThan(out.indexOf("purple"));
  });

  it("skips a missing stylesheet instead of throwing", async () => {
    const platform = fakePlatform({});
    const out = await buildCombinedCss(platform, "/vault", "missing.css", new Map());
    expect(out).toBe("");
  });

  it("produces nothing when there's no css key and no sectionStyles", async () => {
    const platform = fakePlatform({});
    const out = await buildCombinedCss(platform, "/vault", null, new Map());
    expect(out).toBe("");
  });
});
