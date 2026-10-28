use crate::state::{guard_path, AppState};
use serde::Serialize;
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::State;

#[derive(Serialize)]
pub struct DirEntryDto {
    name: String,
    path: String,
    kind: String,
}

fn workspace_root(state: &State<AppState>) -> Result<PathBuf, String> {
    state
        .workspace_root
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "no workspace open".to_string())
}

#[tauri::command]
pub async fn fs_read_text(state: State<'_, AppState>, path: String) -> Result<String, String> {
    let root = workspace_root(&state)?;
    let p = guard_path(&root, Path::new(&path))?;
    std::fs::read_to_string(p).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn fs_read_binary(state: State<'_, AppState>, path: String) -> Result<Vec<u8>, String> {
    let root = workspace_root(&state)?;
    let p = guard_path(&root, Path::new(&path))?;
    std::fs::read(p).map_err(|e| e.to_string())
}

fn atomic_write(target: &Path, data: &[u8]) -> Result<(), String> {
    let dir = target.parent().ok_or_else(|| "path has no parent".to_string())?;
    let rand: u64 = {
        use std::time::{SystemTime, UNIX_EPOCH};
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(0)
    };
    let tmp_name = format!(
        ".{}.tmp-{rand}",
        target.file_name().and_then(|n| n.to_str()).unwrap_or("marginalia")
    );
    let tmp_path = dir.join(tmp_name);
    {
        let mut f = std::fs::File::create(&tmp_path).map_err(|e| e.to_string())?;
        f.write_all(data).map_err(|e| e.to_string())?;
        f.sync_all().map_err(|e| e.to_string())?;
    }
    std::fs::rename(&tmp_path, target).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn fs_write_text(
    state: State<'_, AppState>,
    path: String,
    content: String,
) -> Result<(), String> {
    let root = workspace_root(&state)?;
    // The target may not exist yet, so guard the parent directory instead.
    let target = Path::new(&path);
    let parent = target.parent().ok_or_else(|| "path has no parent".to_string())?;
    guard_path(&root, parent)?;
    atomic_write(target, content.as_bytes())
}

#[tauri::command]
pub async fn fs_write_binary(
    state: State<'_, AppState>,
    path: String,
    content: Vec<u8>,
) -> Result<(), String> {
    let root = workspace_root(&state)?;
    let target = Path::new(&path);
    let parent = target.parent().ok_or_else(|| "path has no parent".to_string())?;
    guard_path(&root, parent)?;
    atomic_write(target, &content)
}

/// Skips the workspace root check: the path comes from the save dialog (Markdown export), so it
/// can be anywhere the person chose — same exemption as `pdf_render`.
#[tauri::command]
pub async fn fs_write_export_text(path: String, content: String) -> Result<(), String> {
    atomic_write(Path::new(&path), content.as_bytes())
}

#[tauri::command]
pub async fn fs_exists(state: State<'_, AppState>, path: String) -> Result<bool, String> {
    let root = workspace_root(&state)?;
    match guard_path(&root, Path::new(&path)) {
        Ok(p) => Ok(p.exists()),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
pub async fn fs_list(state: State<'_, AppState>, dir: String) -> Result<Vec<DirEntryDto>, String> {
    let root = workspace_root(&state)?;
    let p = guard_path(&root, Path::new(&dir))?;
    let mut out = Vec::new();
    let read = std::fs::read_dir(&p).map_err(|e| e.to_string())?;
    for entry in read {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let kind = if path.is_dir() { "dir" } else { "file" };
        out.push(DirEntryDto {
            name: entry.file_name().to_string_lossy().to_string(),
            path: path.to_string_lossy().to_string(),
            kind: kind.to_string(),
        });
    }
    Ok(out)
}

#[tauri::command]
pub async fn fs_mkdir(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let root = workspace_root(&state)?;
    let target = Path::new(&path);
    if let Some(parent) = target.parent() {
        guard_path(&root, parent)?;
    }
    std::fs::create_dir_all(target).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn fs_rename(state: State<'_, AppState>, from: String, to: String) -> Result<(), String> {
    let root = workspace_root(&state)?;
    let from_p = guard_path(&root, Path::new(&from))?;
    let to_parent = Path::new(&to)
        .parent()
        .ok_or_else(|| "path has no parent".to_string())?;
    guard_path(&root, to_parent)?;
    std::fs::rename(from_p, &to).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn fs_remove(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let root = workspace_root(&state)?;
    let p = guard_path(&root, Path::new(&path))?;
    if p.is_dir() {
        std::fs::remove_dir_all(p).map_err(|e| e.to_string())
    } else {
        std::fs::remove_file(p).map_err(|e| e.to_string())
    }
}
