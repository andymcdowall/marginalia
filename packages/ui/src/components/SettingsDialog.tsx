import { useState } from "react";
import { usePlatform } from "../platformContext.js";
import { useStore, type Settings } from "../store.js";

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const platform = usePlatform();
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const [draft, setDraft] = useState<Settings>(settings);

  async function handleSave(): Promise<void> {
    await platform.store.set("settings", draft);
    setSettings(draft);
    onClose();
  }

  return (
    <div className="export-dialog-overlay" onClick={onClose}>
      <div className="export-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Settings</h3>
        <label>
          Autosave delay (ms):{" "}
          <input
            type="number"
            min={200}
            step={100}
            value={draft.autosaveDelayMs}
            onChange={(e) => setDraft((d) => ({ ...d, autosaveDelayMs: Number(e.target.value) || d.autosaveDelayMs }))}
          />
        </label>
        <label>
          Default export page size:{" "}
          <select
            value={draft.defaultPageSize}
            onChange={(e) => setDraft((d) => ({ ...d, defaultPageSize: e.target.value as Settings["defaultPageSize"] }))}
          >
            <option value="letter">Letter</option>
            <option value="a4">A4</option>
          </select>
        </label>
        <div className="export-dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" onClick={() => void handleSave()}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
