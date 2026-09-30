import { useStore } from "./store.js";

// In-app replacement for `window.prompt()`, which Tauri's macOS WebView (WKWebView via wry) never
// implements — see DECISIONS.md. Rendered by <PromptDialogHost/> (mounted once in App.tsx).
// Resolves to null if the user cancels (Esc / overlay click) or submits empty, same as `window.prompt`.
export function showPrompt(title: string, defaultValue = ""): Promise<string | null> {
  return new Promise((resolve) => {
    useStore.getState().requestPrompt(title, defaultValue, resolve);
  });
}
