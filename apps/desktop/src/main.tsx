import { StrictMode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createRoot } from "react-dom/client";
import { App, PlatformProvider } from "@marginalia/ui";
import "@marginalia/ui/src/styles/app.css";
import { createTauriPlatform, setWorkspaceRoot } from "./platformTauri.js";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

const platform = createTauriPlatform();

// App's own startup effect reopens `lastWorkspace` without going through
// dialogs.openFolder(), so it needs the fs-guard armed here first (SPEC.md §6).
const last = await platform.store.get<string>("lastWorkspace");
if (last) await setWorkspaceRoot(last).catch(() => {});

// The UI package can't import @tauri-apps/*, so native menu clicks are forwarded as a DOM event.
await listen<string>("menu", (e) => window.dispatchEvent(new CustomEvent("marginalia:menu", { detail: e.payload })));
window.addEventListener("marginalia:compare-state", (e) => {
  void invoke("set_compare_checked", { checked: (e as CustomEvent<boolean>).detail });
});

createRoot(root).render(
  <StrictMode>
    <PlatformProvider platform={platform}>
      <App />
    </PlatformProvider>
  </StrictMode>
);
