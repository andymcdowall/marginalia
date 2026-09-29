use crate::state::AppState;
use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, DebounceEventResult, DebouncedEventKind};
use serde::Serialize;
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
            let mut paths = Vec::new();
            let mut kind = "modify".to_string();
            for event in events {
                let path_str = event.path.to_string_lossy().to_string();
                if path_str.contains("/.git/") || path_str.ends_with("/.git") {
                    continue;
                }
                kind = match event.kind {
                    DebouncedEventKind::Any => "modify".to_string(),
                    DebouncedEventKind::AnyContinuous => "modify".to_string(),
                    _ => "modify".to_string(),
                };
                paths.push(path_str);
            }
            if paths.is_empty() {
                return;
            }
            let _ = app_for_events.emit("fs-change", FsChangePayload { kind, paths });
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
