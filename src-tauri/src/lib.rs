// Otto Perso — Tauri v2 library entry point
// This contains the actual app logic. main.rs calls this.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Command;
use std::thread;
use std::time::Duration;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Spawn the Otto server (Next.js standalone) as a child process
            // We use std::process::Command directly — no Tauri plugin needed
            let resource_path = app
                .path()
                .resource_dir()
                .expect("failed to resolve resource dir");

            #[cfg(target_os = "windows")]
            let server_exe = resource_path.join("otto-server").join("otto-server.exe");
            #[cfg(not(target_os = "windows"))]
            let server_exe = resource_path.join("otto-server").join("otto-server");

            // Start the server in the background
            if server_exe.exists() {
                let server_handle = Command::new(&server_exe)
                    .spawn()
                    .expect("failed to start Otto server");

                app.manage(ServerHandle {
                    child: std::sync::Mutex::new(Some(server_handle)),
                });
            }

            // Wait for the server to be ready (poll localhost:3000)
            thread::spawn(|| {
                for _ in 0..30 {
                    if std::net::TcpStream::connect("127.0.0.1:3000").is_ok() {
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
                        if let Some(mut child) = guard.take() {
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
