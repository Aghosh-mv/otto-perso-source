// Otto Perso — Tauri library entry point
// This file exists because Cargo.toml declares [lib] with name = "otto_perso_lib"
// Tauri requires both main.rs (the binary) and lib.rs (the library).

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    otto_perso_lib::run()
}
