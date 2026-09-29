use crate::state::AppState;
use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, DebounceEventResult};
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

pub struct WatchHandle {
    _debouncer: notify_debouncer_mini::Debouncer<notify::RecommendedWatcher>,
}

#[derive(Serialize, Clone)]
struct FsChangePayload {
    kind: String,
    paths: Vec<String>,
}

#[tauri::command]
pub async fn watch_start(app: AppHandle, state: State<'_, AppState>, root: String) -> Result<(), String> {
    let app_for_events = app.clone();
    let mut debouncer = new_debouncer(
        Duration::from_millis(200),
        move |res: DebounceEventResult| {
            let events = match res {
                Ok(events) => events,
                Err(_) => return,
            };
            // notify-debouncer-mini collapses create/modify/remove into one DebouncedEventKind,
            // so it can't tell us which happened. Re-derive a coarse kind by checking whether the
            // path still exists — good enough for "something changed here, go re-check."
            let mut by_kind: HashMap<&'static str, Vec<String>> = HashMap::new();
            for event in events {
                let path_str = event.path.to_string_lossy().to_string();
                if path_str.contains("/.git/") || path_str.ends_with("/.git") {
                    continue;
                }
                let kind = if event.path.exists() { "modify" } else { "remove" };
                by_kind.entry(kind).or_default().push(path_str);
            }
            for (kind, paths) in by_kind {
                if paths.is_empty() {
                    continue;
                }
                let _ = app_for_events.emit(
                    "fs-change",
                    FsChangePayload { kind: kind.to_string(), paths },
                );
            }
        },
    )
    .map_err(|e| e.to_string())?;

    debouncer
        .watcher()
        .watch(Path::new(&root), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    *state.watcher.lock().unwrap() = Some(WatchHandle {
        _debouncer: debouncer,
    });
    Ok(())
}

#[tauri::command]
pub async fn watch_stop(state: State<'_, AppState>) -> Result<(), String> {
    *state.watcher.lock().unwrap() = None;
    Ok(())
}
