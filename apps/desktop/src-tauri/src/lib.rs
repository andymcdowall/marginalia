mod fs;
mod git;
mod pdf;
mod state;
mod store;
mod watch;

use state::AppState;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, MenuItemKind, PredefinedMenuItem};
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
fn set_compare_checked(app: tauri::AppHandle, checked: bool) {
    if let Some(MenuItemKind::Check(item)) = app.menu().and_then(|m| m.get("toggle-compare")) {
        let _ = item.set_checked(checked);
    }
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

            // Add our items to the default File menu. The webview handles them (see main.tsx).
            let handle = app.handle();
            let menu = Menu::default(handle)?;
            let open = MenuItem::with_id(handle, "open-folder", "Open Folder…", true, Some("CmdOrCtrl+O"))?;
            let save = MenuItem::with_id(handle, "save-idea", "Save Idea", true, Some("CmdOrCtrl+S"))?;
            let export = MenuItem::with_id(handle, "export-pdf", "Export…", true, Some("CmdOrCtrl+Shift+E"))?;
            let sep = PredefinedMenuItem::separator(handle)?;
            let compare = CheckMenuItem::with_id(handle, "toggle-compare", "Compare", true, true, Some("CmdOrCtrl+Shift+R"))?;
            let view_sep = PredefinedMenuItem::separator(handle)?;
            for item in menu.items()? {
                if let MenuItemKind::Submenu(sub) = item {
                    match sub.text()?.as_str() {
                        "File" => sub.insert_items(&[&open, &save, &export, &sep], 0)?,
                        "View" => sub.insert_items(&[&compare, &view_sep], 0)?,
                        _ => {}
                    }
                }
            }
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            let _ = app.emit("menu", event.id().as_ref());
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
            set_compare_checked,
            fs::fs_read_text,
            fs::fs_read_binary,
            fs::fs_write_text,
            fs::fs_write_binary,
            fs::fs_write_export_text,
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
