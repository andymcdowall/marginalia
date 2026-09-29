// Prevents an additional console window on Windows in debug builds; irrelevant on macOS,
// kept because it's the standard Tauri entrypoint shape.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    marginalia_lib::run();
}
