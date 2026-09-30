const SHORTCUTS: [string, string][] = [
  ["Cmd+S", "Save idea (commit your changes)"],
  ["Cmd+N", "New note"],
  ["Cmd+E", "Toggle Live/Source mode"],
  ["Cmd+Shift+M", "Comment on selection"],
  ["Cmd+Shift+R", "Toggle side-by-side compare"],
  ["Cmd+B / Cmd+I", "Bold / italic selection"],
  ["Cmd+K", "Insert link"],
  ["Cmd+F", "Find"],
  ["Alt+↑ / Alt+↓", "Previous / next change (Changes panel)"],
  ["Cmd+\\", "Toggle left sidebar"],
  ["Cmd+Shift+\\", "Toggle right sidebar"],
  ["Cmd+/", "Show this shortcut sheet"],
];

// SPEC.md §7 (Phase 7 polish): a Cmd+/ keyboard shortcut sheet.
export function ShortcutsSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="export-dialog-overlay" onClick={onClose}>
      <div className="export-dialog shortcuts-sheet" onClick={(e) => e.stopPropagation()}>
        <h3>Keyboard shortcuts</h3>
        <table>
          <tbody>
            {SHORTCUTS.map(([keys, label]) => (
              <tr key={keys}>
                <td className="shortcut-keys">{keys}</td>
                <td>{label}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="export-dialog-actions">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
