import { useState } from "react";
import { useStore } from "../store.js";

// SPEC.md §12 "Errors": every thrown GitError or file error shows a dismissible toast with a
// one-line message and a Details expander. Populated by a global `unhandledrejection` listener
// (App.tsx) that catches whatever async action threw, rather than wrapping every call site.
function ToastRow({ id, message, details }: { id: number; message: string; details?: string }) {
  const dismissToast = useStore((s) => s.dismissToast);
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="toast">
      <div className="toast-row">
        <span className="toast-message">{message}</span>
        {details && (
          <button type="button" className="toast-details-toggle" onClick={() => setExpanded((e) => !e)}>
            Details
          </button>
        )}
        <button type="button" className="toast-dismiss" onClick={() => dismissToast(id)}>
          {"×"}
        </button>
      </div>
      {expanded && details && <pre className="toast-details">{details}</pre>}
    </div>
  );
}

export function ToastContainer() {
  const toasts = useStore((s) => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <ToastRow key={t.id} id={t.id} message={t.message} details={t.details} />
      ))}
    </div>
  );
}
