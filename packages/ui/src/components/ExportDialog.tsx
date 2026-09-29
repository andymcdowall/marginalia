import { useState } from "react";
import { resolveBaselineSha, baselineText, cleanText, toHtml, redlineHtml, type PdfOptions } from "@marginalia/core";
import { usePlatform } from "../platformContext.js";
import { useStore } from "../store.js";
import { activeEditorView } from "./EditorPane.js";

// SPEC.md §11.1. Since `platform.pdf.renderHtmlToPdf` uses the Phase 0 fallback (a visible
// "Export preview" window + native Print dialog, not silent automatic export — see
// DECISIONS.md), the save-file path chosen here isn't actually used by that implementation; kept
// for interface consistency and so a future native implementation needs no UI change.
export function ExportDialog({ onClose }: { onClose: () => void }) {
  const platform = usePlatform();
  const workspace = useStore((s) => s.workspace);
  const openFile = useStore((s) => s.openFile);
  const currentBranch = useStore((s) => s.currentBranch);
  const baseline = useStore((s) => s.baseline);
  const baselineLabel = useStore((s) => s.baselineLabel);
  const settings = useStore((s) => s.settings);
  const [mode, setMode] = useState<"clean" | "redline">("clean");
  const [pageSize, setPageSize] = useState<PdfOptions["pageSize"]>(settings.defaultPageSize);
  const [busy, setBusy] = useState(false);

  async function handleExport(): Promise<void> {
    if (!workspace || !openFile) return;
    setBusy(true);
    try {
      const view = activeEditorView.current;
      const body = view ? view.state.doc.toString() : "";
      const baseDir = openFile.path.slice(0, openFile.path.lastIndexOf("/"));
      const name = openFile.path.slice(openFile.path.lastIndexOf("/") + 1).replace(/\.md$/, "");

      const html =
        mode === "clean"
          ? await toHtml(platform, baseDir, body)
          : await (async () => {
              const sha = await resolveBaselineSha(workspace.git, baseline, currentBranch);
              const rel = workspace.git.toRelative(openFile.path);
              const text = await baselineText(workspace.git, sha, rel);
              return redlineHtml(platform, baseDir, body, cleanText(text).text, baselineLabel, currentBranch);
            })();

      const outPath = await platform.dialogs.saveFile({ defaultName: `${name}.pdf`, extensions: ["pdf"] });
      if (!outPath) return;
      await platform.pdf.renderHtmlToPdf(html, outPath, { pageSize, marginPt: 54 });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="export-dialog-overlay" onClick={onClose}>
      <div className="export-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Export PDF</h3>
        <label>
          <input type="radio" checked={mode === "clean"} onChange={() => setMode("clean")} /> Clean
        </label>
        <label>
          <input type="radio" checked={mode === "redline"} onChange={() => setMode("redline")} />
          {` Redline (vs ${baselineLabel})`}
        </label>
        <div>
          <label>
            Page size:{" "}
            <select value={pageSize} onChange={(e) => setPageSize(e.target.value as PdfOptions["pageSize"])}>
              <option value="letter">Letter</option>
              <option value="a4">A4</option>
            </select>
          </label>
        </div>
        <div className="export-dialog-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" onClick={() => void handleExport()} disabled={busy}>
            {busy ? "Exporting…" : "Export"}
          </button>
        </div>
      </div>
    </div>
  );
}
