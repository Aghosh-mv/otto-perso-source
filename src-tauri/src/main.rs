// Otto Perso — Tauri main process
// Spawns the bundled Next.js standalone server as a sidecar process,
// waits for it to be ready, then opens the webview pointing to it.
// When the window closes, the sidecar is killed.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Command;
use std::thread;
use std::time::Duration;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Spawn the Otto server (Next.js standalone) as a sidecar
            let resource_path = app
                .path()
                .resource_dir()
                .expect("failed to resolve resource dir")
                .join("otto-server");

            #[cfg(target_os = "windows")]
            let server_exe = resource_path.join("otto-server.exe");
            #[cfg(not(target_os = "windows"))]
            let server_exe = resource_path.join("otto-server");

            let server_handle = Command::new(&server_exe)
                .spawn()
                .expect("failed to start Otto server");

            app.manage(ServerHandle {
                child: std::sync::Mutex::new(Some(server_handle)),
            });

            // Wait for the server to be ready (poll localhost:3000)
            thread::spawn(move || {
                for _ in 0..30 {
                    if try_connect() {
                        break;
                    }
                    thread::sleep(Duration::from_millis(500));
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if let Some(handle) = window.app_handle().try_state::<ServerHandle>() {
                    if let Ok(mut guard) = handle.child.lock() {
                        if let Some(child) = guard.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Otto Perso");
}

struct ServerHandle {
    child: std::sync::Mutex<Option<std::process::Child>>,
}

fn try_connect() -> bool {
    match std::net::TcpStream::connect("127.0.0.1:3000") {
        Ok(_) => true,
        Err(_) => false,
    }
}
