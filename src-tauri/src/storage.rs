//! Lokale Datenhaltung. Alles liegt als JSON im App-Datenordner des Users.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::State;

use crate::AppState;

const DATA_FILES: [&str; 3] = ["library", "settings", "sessions"];

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Erzeugt einen dateisystem-sicheren Namen.
pub fn safe_name(input: &str) -> String {
    let s: String = input
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();
    if s.is_empty() {
        "unbenannt".into()
    } else {
        s
    }
}

fn data_file(state: &AppState, name: &str) -> Result<PathBuf, String> {
    if !DATA_FILES.contains(&name) {
        return Err(format!("Unbekannte Datendatei: {name}"));
    }
    Ok(state.data_dir.join(format!("{name}.json")))
}

/// Schreibt erst in eine temporäre Datei und benennt dann um,
/// damit bei Absturz oder Stromausfall keine halbe Datei entsteht.
pub fn write_atomic(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, content).map_err(|e| format!("Speichern fehlgeschlagen: {e}"))?;
    fs::rename(&tmp, path).map_err(|e| format!("Speichern fehlgeschlagen: {e}"))
}

#[tauri::command]
pub fn load_data(state: State<'_, AppState>, name: String) -> Result<Option<String>, String> {
    let path = data_file(&state, &name)?;
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(&path).map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_data(state: State<'_, AppState>, name: String, content: String) -> Result<(), String> {
    let path = data_file(&state, &name)?;
    // Sitzungen werden auch vom Backend geschrieben → gemeinsame Sperre
    if name == "sessions" {
        let _guard = state.sessions_lock.lock().map_err(|e| e.to_string())?;
        return write_atomic(&path, &content);
    }
    write_atomic(&path, &content)
}

#[tauri::command]
pub fn data_dir(state: State<'_, AppState>) -> String {
    state.data_dir.to_string_lossy().to_string()
}

/// Hängt eine Spielsitzung an `sessions.json` an (vom Launcher nach Spielende aufgerufen).
pub fn append_session(
    data_dir: &Path,
    lock: &std::sync::Mutex<()>,
    session: serde_json::Value,
) -> Result<(), String> {
    let _guard = lock.lock().map_err(|e| e.to_string())?;
    let path = data_dir.join("sessions.json");
    let mut list: Vec<serde_json::Value> = fs::read_to_string(&path)
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default();
    list.push(session);
    let text = serde_json::to_string(&list).map_err(|e| e.to_string())?;
    write_atomic(&path, &text)
}

/// Kopiert ein Bild in den Artwork-Ordner und gibt den neuen Pfad zurück.
#[tauri::command]
pub fn import_artwork(
    state: State<'_, AppState>,
    game_id: String,
    kind: String,
    source: String,
) -> Result<String, String> {
    let src = PathBuf::from(&source);
    if !src.is_file() {
        return Err(format!("Bild nicht gefunden: {source}"));
    }
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_else(|| "png".into());
    let allowed = ["png", "jpg", "jpeg", "webp", "gif", "avif", "bmp", "svg", "ico"];
    if !allowed.contains(&ext.as_str()) {
        return Err(format!("Dateiformat .{ext} wird nicht unterstützt."));
    }
    let name = format!("{}_{}_{}.{}", safe_name(&game_id), safe_name(&kind), now_ms(), ext);
    let dest = state.data_dir.join("artwork").join(name);
    fs::copy(&src, &dest).map_err(|e| format!("Bild konnte nicht kopiert werden: {e}"))?;
    Ok(dest.to_string_lossy().to_string())
}

/// Entfernt ein Bild – aber nur, wenn es im eigenen Artwork-Ordner liegt.
#[tauri::command]
pub fn remove_artwork(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let artwork_dir = state.data_dir.join("artwork");
    let p = PathBuf::from(&path);
    if p.starts_with(&artwork_dir) && p.is_file() {
        fs::remove_file(&p).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    let meta = fs::metadata(&path).map_err(|e| format!("Datei nicht lesbar: {e}"))?;
    if meta.len() > 50 * 1024 * 1024 {
        return Err("Datei ist zu groß.".into());
    }
    fs::read_to_string(&path).map_err(|e| format!("Datei nicht lesbar: {e}"))
}

#[tauri::command]
pub fn write_text_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| format!("Datei konnte nicht geschrieben werden: {e}"))
}

#[derive(Serialize)]
pub struct ThemeFile {
    pub file: String,
    pub content: String,
}

#[tauri::command]
pub fn list_themes(state: State<'_, AppState>) -> Vec<ThemeFile> {
    let dir = state.data_dir.join("themes");
    let mut out = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            if let Ok(content) = fs::read_to_string(&p) {
                out.push(ThemeFile {
                    file: p.file_name().unwrap_or_default().to_string_lossy().to_string(),
                    content,
                });
            }
        }
    }
    out.sort_by(|a, b| a.file.cmp(&b.file));
    out
}

/// Prüft eine Theme-Datei grob und kopiert sie in den Theme-Ordner.
#[tauri::command]
pub fn import_theme(state: State<'_, AppState>, source: String) -> Result<String, String> {
    let text = read_text_file(source.clone())?;
    let value: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("Kein gültiges Theme (JSON-Fehler): {e}"))?;
    let name = value
        .get("name")
        .and_then(|n| n.as_str())
        .ok_or("Dem Theme fehlt das Feld \"name\".")?;
    if value.get("colors").and_then(|c| c.as_object()).is_none() {
        return Err("Dem Theme fehlt das Feld \"colors\".".into());
    }
    let file = format!("{}.json", safe_name(&name.to_lowercase()));
    write_atomic(&state.data_dir.join("themes").join(&file), &text)?;
    Ok(file)
}

#[tauri::command]
pub fn delete_theme(state: State<'_, AppState>, file: String) -> Result<(), String> {
    let p = state.data_dir.join("themes").join(safe_name(file.trim_end_matches(".json")) + ".json");
    if p.is_file() {
        fs::remove_file(p).map_err(|e| e.to_string())?;
    }
    Ok(())
}
