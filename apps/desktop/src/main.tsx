import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App, PlatformProvider } from "@marginalia/ui";
import "@marginalia/ui/src/styles/app.css";
import { createTauriPlatform } from "./platformTauri.js";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

const platform = createTauriPlatform();

createRoot(root).render(
  <StrictMode>
    <PlatformProvider platform={platform}>
      <App />
    </PlatformProvider>
  </StrictMode>
);
