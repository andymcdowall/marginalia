import { useState } from "react";
import { resolveBaselineSha, baselineText, cleanText, splitFile, toHtml, toMarkdown, redlineHtml, type PdfOptions } from "@marginalia/core";
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
  const [format, setFormat] = useState<"pdf" | "markdown">("pdf");
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

      if (format === "markdown") {
        const outPath = await platform.dialogs.saveFile({ defaultName: `${name}.md`, extensions: ["md"] });
        if (!outPath) return;
        await platform.fs.writeExportText(outPath, toMarkdown(body));
        onClose();
        return;
      }

      const html =
        mode === "clean"
          ? await toHtml(platform, baseDir, body)
          : await (async () => {
              const sha = await resolveBaselineSha(workspace.git, baseline, currentBranch);
              const rel = workspace.git.toRelative(openFile.path);
              const text = await baselineText(workspace.git, sha, rel);
              return redlineHtml(platform, baseDir, body, cleanText(splitFile(text).body).text, baselineLabel, currentBranch);
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
        <h3>Export</h3>
        <div>
          <label>
            Format:{" "}
            <select value={format} onChange={(e) => setFormat(e.target.value as "pdf" | "markdown")}>
              <option value="pdf">PDF</option>
              <option value="markdown">Markdown</option>
            </select>
          </label>
        </div>
        {format === "pdf" ? (
          <>
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
          </>
        ) : (
          <p>Plain markdown with comments, frontmatter, and HTML comments removed.</p>
        )}
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
