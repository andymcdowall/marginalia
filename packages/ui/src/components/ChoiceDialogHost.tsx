import { useEffect } from "react";
import { useStore } from "../store.js";

// Renders the single in-flight `showChoice()` request (choice.ts). Mount once per app.
export function ChoiceDialogHost() {
  const request = useStore((s) => s.choiceRequest);
  const settleChoice = useStore((s) => s.settleChoice);

  useEffect(() => {
    if (!request) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") settleChoice(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [request, settleChoice]);

  if (!request) return null;

  return (
    <div className="export-dialog-overlay" onClick={() => settleChoice(null)}>
      <div className="export-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>{request.title}</h3>
        <p className="choice-dialog-message">{request.message}</p>
        <div className="export-dialog-actions">
          <button type="button" onClick={() => settleChoice(null)}>
            Cancel
          </button>
          {request.options.map((o) => (
            <button key={o.value} type="button" className={o.danger ? "danger" : ""} onClick={() => settleChoice(o.value)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
