import { useEffect, useState } from "react";
import { useStore } from "../store.js";

// Renders the single in-flight `showPrompt()` request (prompt.ts) as a modal text input, in place
// of the native `window.prompt()` that Tauri's WebView doesn't support. Mount once per app.
export function PromptDialogHost() {
  const promptRequest = useStore((s) => s.promptRequest);
  const settlePrompt = useStore((s) => s.settlePrompt);
  const [value, setValue] = useState("");

  useEffect(() => {
    setValue(promptRequest?.defaultValue ?? "");
  }, [promptRequest]);

  if (!promptRequest) return null;

  function submit(): void {
    settlePrompt(value.trim() || null);
  }
  function cancel(): void {
    settlePrompt(null);
  }

  return (
    <div className="export-dialog-overlay" onClick={cancel}>
      <div className="export-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>{promptRequest.title}</h3>
        <input
          autoFocus
          className="prompt-dialog-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
        />
        <div className="export-dialog-actions">
          <button type="button" onClick={cancel}>
            Cancel
          </button>
          <button type="button" onClick={submit}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
