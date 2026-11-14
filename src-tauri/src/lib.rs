//! LakuenLauncher – Backend
//!
//! Aufbau:
//! - `storage`  : lokale JSON-Dateien (Bibliothek, Einstellungen, Sitzungen), Artwork, Themes
//! - `proton`   : Erkennung installierter Proton-Versionen und Hilfswerkzeuge
//! - `launcher` : Starten/Beenden von Spielen und Messen der Spielzeit
//! - `platform` : alles Betriebssystem-Spezifische (Linux jetzt, Windows vorbereitet)
//!
//! Alle Daten bleiben lokal im App-Datenordner. Es gibt keine Telemetrie.

mod launcher;
mod platform;
mod proton;
mod storage;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use tauri::{Emitter, Manager};

/// Gemeinsamer Zustand des Backends.
pub struct AppState {
    pub data_dir: PathBuf,
    pub running: Arc<Mutex<HashMap<String, launcher::RunningGame>>>,
    pub sessions_lock: Arc<Mutex<()>>,
    pub pending_launch: Mutex<Option<String>>,
}

/// Liest `--launch <id>` aus den Startargumenten (für Desktop-Verknüpfungen).
fn launch_arg(args: &[String]) -> Option<String> {
    let mut iter = args.iter();
    while let Some(a) = iter.next() {
        if a == "--launch" {
            return iter.next().cloned();
        }
        if let Some(rest) = a.strip_prefix("--launch=") {
            return Some(rest.to_string());
        }
    }
    None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    platform::prepare_environment();

    let args: Vec<String> = std::env::args().collect();
    let pending = launch_arg(&args);

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // Zweiter Start (z. B. über eine Desktop-Verknüpfung): Fenster nach vorn holen
            // und ggf. das gewünschte Spiel an die laufende Instanz weiterreichen.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
            if let Some(id) = launch_arg(&argv) {
                let _ = app.emit("launch-request", id);
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(move |app| {
            let data_dir = app.path().app_data_dir()?;
            for sub in ["artwork", "themes", "logs", "prefixes"] {
                std::fs::create_dir_all(data_dir.join(sub))?;
            }
            app.manage(AppState {
                data_dir,
                running: Arc::new(Mutex::new(HashMap::new())),
                sessions_lock: Arc::new(Mutex::new(())),
                pending_launch: Mutex::new(pending),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            storage::load_data,
            storage::save_data,
            storage::data_dir,
            storage::import_artwork,
            storage::remove_artwork,
            storage::read_text_file,
            storage::write_text_file,
            storage::list_themes,
            storage::import_theme,
            storage::delete_theme,
            proton::list_proton,
            proton::detect_tools,
            launcher::launch_game,
            launcher::stop_game,
            launcher::running_games,
            launcher::read_log,
            launcher::run_prefix_tool,
            launcher::take_pending_launch,
            platform::inspect_file,
            platform::scan_folder,
            platform::open_path,
            platform::open_url,
            platform::create_shortcut,
            platform::remove_shortcut,
            platform::system_info,
        ])
        .run(tauri::generate_context!())
        .expect("LakuenLauncher konnte nicht gestartet werden");
}
