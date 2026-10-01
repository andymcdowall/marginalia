import { describe, expect, it } from "vitest";
import { fileKindFor } from "../src/store.js";

describe("fileKindFor", () => {
  it("opens .md as markdown", () => {
    expect(fileKindFor("/vault/note.md")).toBe("markdown");
  });

  it("opens .css as css", () => {
    expect(fileKindFor("/vault/styles/part-one.css")).toBe("css");
  });

  it("is case-insensitive on extension", () => {
    expect(fileKindFor("/vault/NOTE.MD")).toBe("markdown");
    expect(fileKindFor("/vault/STYLE.CSS")).toBe("css");
  });

  it("treats anything else, including extensionless and dotfiles, as unreadable", () => {
    expect(fileKindFor("/vault/image.png")).toBe("unreadable");
    expect(fileKindFor("/vault/notes.txt")).toBe("unreadable");
    expect(fileKindFor("/vault/.gitignore")).toBe("unreadable");
    expect(fileKindFor("/vault/README")).toBe("unreadable");
  });
});
