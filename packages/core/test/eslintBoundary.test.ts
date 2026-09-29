import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// Proves the no-restricted-imports boundary rule in eslint.config.js actually fires (SPEC.md §2.2,
// Phase 1 acceptance). Uses ESLint's lintText with a virtual path under packages/core/src so the
// flat config's `files` glob matches, without writing a real file into src/.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

async function lintAsCoreSrc(code: string): Promise<ESLint.LintResult> {
  const eslint = new ESLint({ cwd: REPO_ROOT });
  const [result] = await eslint.lintText(code, {
    filePath: path.join(REPO_ROOT, "packages/core/src/__eslint_boundary_fixture__.ts"),
  });
  return result!;
}

describe("ESLint boundary rule: packages/core must not import forbidden modules", () => {
  it("flags a react import from core/src", async () => {
    const result = await lintAsCoreSrc('import { useState } from "react";\nuseState;\n');
    const ruleIds = result.messages.map((m) => m.ruleId);
    expect(ruleIds).toContain("no-restricted-imports");
  });

  it("flags a node: builtin import from core/src", async () => {
    const result = await lintAsCoreSrc('import fs from "node:fs";\nfs;\n');
    const ruleIds = result.messages.map((m) => m.ruleId);
    expect(ruleIds).toContain("no-restricted-imports");
  });

  it("flags a @tauri-apps/* import from core/src", async () => {
    const result = await lintAsCoreSrc('import { invoke } from "@tauri-apps/api/core";\ninvoke;\n');
    const ruleIds = result.messages.map((m) => m.ruleId);
    expect(ruleIds).toContain("no-restricted-imports");
  });

  it("does not flag an ordinary import from core/src", async () => {
    const result = await lintAsCoreSrc('import { findMilestones } from "./comments/milestones.js";\nfindMilestones;\n');
    const ruleIds = result.messages.map((m) => m.ruleId);
    expect(ruleIds).not.toContain("no-restricted-imports");
  });
});
