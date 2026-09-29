import { defineConfig } from "vitest/config";

// Single root config for `pnpm test` across all workspace packages. UI tests that need a DOM
// opt in per-file with a `// @vitest-environment jsdom` docblock (see SPEC.md §14).
export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/*/test/**/*.test.ts", "packages/*/test/**/*.test.tsx"],
  },
});
