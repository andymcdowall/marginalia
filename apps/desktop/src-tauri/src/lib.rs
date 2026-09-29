mod fs;
mod git;
mod pdf;
mod state;
mod store;
mod watch;

use state::AppState;
use tauri::{Emitter, Manager, WindowEvent};

#[tauri::command]
async fn set_workspace(app: tauri::AppHandle, state: tauri::State<'_, AppState>, root: String) -> Result<(), String> {
    let path = std::path::Path::new(&root)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    *state.workspace_root.lock().unwrap() = Some(path.clone());
    app.asset_protocol_scope()
        .allow_directory(&path, true)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn quit_now(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .setup(|app| {
            let state = app.state::<AppState>();
            *state.git_bin.lock().unwrap() = git::resolve_git_binary();
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.emit("before-quit", ());
            }
        })
        .invoke_handler(tauri::generate_handler![
            set_workspace,
            quit_now,
            fs::fs_read_text,
            fs::fs_read_binary,
            fs::fs_write_text,
            fs::fs_write_binary,
            fs::fs_exists,
            fs::fs_list,
            fs::fs_mkdir,
            fs::fs_rename,
            fs::fs_remove,
            watch::watch_start,
            watch::watch_stop,
            git::git_run,
            store::store_get,
            store::store_set,
            pdf::pdf_render,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
