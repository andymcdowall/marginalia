import { StrictMode } from "react";
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

createRoot(root).render(
  <StrictMode>
    <PlatformProvider platform={platform}>
      <App />
    </PlatformProvider>
  </StrictMode>
);
