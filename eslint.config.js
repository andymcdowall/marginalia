// @ts-check
import tseslint from "typescript-eslint";

const CORE_FORBIDDEN = [
  { group: ["react", "react-dom", "react/*"], message: "packages/core must not import react." },
  { group: ["@codemirror/*", "@lezer/*"], message: "packages/core must not import CodeMirror." },
  { group: ["@tauri-apps/*"], message: "packages/core must not import Tauri." },
  { group: ["electron", "electron/*"], message: "packages/core must not import Electron." },
  { group: ["node:*"], message: "packages/core must not import Node builtins." },
];

const UI_FORBIDDEN = [
  { group: ["@tauri-apps/*"], message: "packages/ui must not import Tauri directly; use platformContext." },
  { group: ["electron", "electron/*"], message: "packages/ui must not import Electron." },
  { group: ["node:*"], message: "packages/ui must not import Node builtins." },
];

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/src-tauri/target/**", "**/*.d.ts"],
  },
  ...tseslint.configs.recommended,
  {
    files: ["packages/core/src/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: CORE_FORBIDDEN }],
      "no-restricted-globals": ["error", "window", "document"],
    },
  },
  {
    files: ["packages/ui/src/**/*.ts", "packages/ui/src/**/*.tsx"],
    rules: {
      "no-restricted-imports": ["error", { patterns: UI_FORBIDDEN }],
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  }
);
