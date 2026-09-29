use std::path::PathBuf;
use std::sync::Mutex;

pub struct AppState {
    pub workspace_root: Mutex<Option<PathBuf>>,
    pub git_bin: Mutex<Option<PathBuf>>,
    pub watcher: Mutex<Option<crate::watch::WatchHandle>>,
}

impl Default for AppState {
    fn default() -> Self {
        AppState {
            workspace_root: Mutex::new(None),
            git_bin: Mutex::new(None),
            watcher: Mutex::new(None),
        }
    }
}

/// Canonicalizes `path` (or, if it doesn't exist yet, its deepest existing ancestor plus the
/// remaining components) and requires it to be inside `root`. Returns the canonicalized path.
pub fn guard_path(root: &std::path::Path, path: &std::path::Path) -> Result<PathBuf, String> {
    let root = root
        .canonicalize()
        .map_err(|e| format!("workspace root is invalid: {e}"))?;

    let normalized = normalize_maybe_missing(path)?;

    if !normalized.starts_with(&root) {
        return Err(format!(
            "path {} is outside the workspace root",
            path.display()
        ));
    }
    Ok(normalized)
}

fn normalize_maybe_missing(path: &std::path::Path) -> Result<PathBuf, String> {
    if let Ok(canon) = path.canonicalize() {
        return Ok(canon);
    }
    // Path (or a suffix of it) doesn't exist yet (e.g. a new file about to be written).
    // Canonicalize the deepest existing ancestor and re-append the missing tail.
    let mut existing = path.to_path_buf();
    let mut tail: Vec<std::ffi::OsString> = Vec::new();
    loop {
        if existing.exists() {
            break;
        }
        match existing.file_name() {
            Some(name) => {
                tail.push(name.to_os_string());
                existing = match existing.parent() {
                    Some(p) => p.to_path_buf(),
                    None => return Err(format!("path {} does not resolve", path.display())),
                };
            }
            None => return Err(format!("path {} does not resolve", path.display())),
        }
    }
    let mut base = existing
        .canonicalize()
        .map_err(|e| format!("path {} does not resolve: {e}", path.display()))?;
    for part in tail.into_iter().rev() {
        base.push(part);
    }
    Ok(base)
}
