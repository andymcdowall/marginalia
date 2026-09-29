use crate::state::AppState;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::State;

const CANDIDATES: [&str; 3] = ["/opt/homebrew/bin/git", "/usr/local/bin/git", "/usr/bin/git"];

/// Resolves the git binary once at startup by trying candidates in order and checking
/// `git --version` exits 0. Returns None if none work; the UI then shows the blocking screen.
pub fn resolve_git_binary() -> Option<PathBuf> {
    for candidate in CANDIDATES {
        let path = Path::new(candidate);
        if !path.exists() {
            continue;
        }
        let ok = Command::new(path)
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
        if ok {
            return Some(path.to_path_buf());
        }
    }
    None
}

#[derive(Serialize)]
pub struct GitResultDto {
    stdout: String,
    stderr: String,
    code: i32,
}

#[tauri::command]
pub async fn git_run(
    state: State<'_, AppState>,
    cwd: String,
    args: Vec<String>,
    stdin: Option<String>,
) -> Result<GitResultDto, String> {
    let git_bin = state
        .git_bin
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "git is not available".to_string())?;

    tauri::async_runtime::spawn_blocking(move || run_git(&git_bin, &cwd, &args, stdin.as_deref()))
        .await
        .map_err(|e| e.to_string())?
}

fn run_git(
    git_bin: &Path,
    cwd: &str,
    args: &[String],
    stdin: Option<&str>,
) -> Result<GitResultDto, String> {
    use std::io::Write;
    use std::process::Stdio;

    let mut cmd = Command::new(git_bin);
    cmd.current_dir(cwd)
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("LC_ALL", "C")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| e.to_string())?;

    if let Some(input) = stdin {
        if let Some(mut child_stdin) = child.stdin.take() {
            child_stdin
                .write_all(input.as_bytes())
                .map_err(|e| e.to_string())?;
        }
    } else {
        drop(child.stdin.take());
    }

    let output = child.wait_with_output().map_err(|e| e.to_string())?;

    Ok(GitResultDto {
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        code: output.status.code().unwrap_or(-1),
    })
}
