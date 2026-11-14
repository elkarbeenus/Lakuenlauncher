// LakuenLauncher – erstellt von Dominic Lesina x Claude
// Lokaler Spiele- und App-Launcher. Keine Anmeldung, keine Telemetrie.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod platform;
mod proton;
mod runner;
mod scan;
mod store;

use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{Emitter, Manager};

pub struct AppState {
    pub running: Mutex<HashMap<String, runner::RunningGame>>,
    pub pending_launch: Mutex<Option<String>>,
}

/// `--launch <spiel-id>` (z. B. aus einer Desktop-Verknüpfung)
fn parse_launch_arg() -> Option<String> {
    let args: Vec<String> = std::env::args().collect();
    args.iter()
        .position(|a| a == "--launch")
        .and_then(|i| args.get(i + 1).cloned())
}

#[tauri::command]
fn take_pending_launch(state: tauri::State<'_, AppState>) -> Option<String> {
    state.pending_launch.lock().ok().and_then(|mut p| p.take())
}

fn main() {
    // WebKitGTK zeigt auf manchen Grafiktreibern sonst ein leeres Fenster.
    #[cfg(target_os = "linux")]
    {
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }

    tauri::Builder::default()
        // Zweiter Start (z. B. Desktop-Verknüpfung): an das offene Fenster weiterreichen
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
            let id = argv
                .iter()
                .position(|a| a == "--launch")
                .and_then(|i| argv.get(i + 1))
                .cloned();
            if let Some(id) = id {
                let _ = app.emit("launch-request", id);
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .manage(AppState {
            running: Mutex::new(HashMap::new()),
            pending_launch: Mutex::new(parse_launch_arg()),
        })
        .invoke_handler(tauri::generate_handler![
            take_pending_launch,
            store::store_load,
            store::store_save,
            store::read_text_file,
            store::write_text_file,
            store::path_exists,
            store::file_info,
            store::import_artwork,
            store::delete_file,
            store::delete_game_data,
            store::get_data_dir,
            store::read_log,
            store::list_backups,
            platform::open_path,
            platform::reveal_path,
            platform::system_info,
            platform::notify,
            platform::http_get,
            platform::create_desktop_entry,
            platform::remove_desktop_entry,
            proton::list_proton,
            runner::launch_game,
            runner::stop_game,
            runner::list_running,
            runner::run_prefix_tool,
            runner::get_prefix_path,
            runner::delete_prefix,
            scan::scan_folder,
        ])
        .run(tauri::generate_context!())
        .expect("LakuenLauncher konnte nicht gestartet werden");
}
