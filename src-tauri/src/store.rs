//! Lokale Datenablage (JSON-Dateien im App-Datenordner). Nichts verlässt den Rechner.

use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

pub static FILE_LOCK: Mutex<()> = Mutex::new(());

const STORES: [&str; 3] = ["library", "settings", "sessions"];
const ART_KINDS: [&str; 4] = ["cover", "hero", "logo", "icon"];
const IMG_EXT: [&str; 8] = ["png", "jpg", "jpeg", "webp", "gif", "svg", "avif", "bmp"];

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn safe_id(id: &str) -> String {
    let s: String = id
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    if s.is_empty() {
        "unbekannt".into()
    } else {
        s
    }
}

pub fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn sub_dir(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let dir = data_dir(app)?.join(name);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn store_file(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    if !STORES.contains(&name) {
        return Err(format!("Unbekannter Speicher: {name}"));
    }
    Ok(data_dir(app)?.join(format!("{name}.json")))
}

pub fn write_atomic(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".tmp");
    let tmp = PathBuf::from(tmp);
    fs::write(&tmp, content).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

/// Einmal pro Tag eine Sicherung der Bibliothek anlegen, die letzten 7 behalten.
fn daily_backup(app: &AppHandle, name: &str, current: &Path) {
    if !current.exists() || name == "settings" {
        return;
    }
    let Ok(dir) = sub_dir(app, "backups") else { return };
    let day = now_ms() / 86_400_000;
    let target = dir.join(format!("{name}-{day}.json"));
    if !target.exists() {
        let _ = fs::copy(current, &target);
        if let Ok(rd) = fs::read_dir(&dir) {
            let mut files: Vec<PathBuf> = rd
                .flatten()
                .map(|e| e.path())
                .filter(|p| {
                    p.file_name()
                        .and_then(|n| n.to_str())
                        .map(|n| n.starts_with(&format!("{name}-")))
                        .unwrap_or(false)
                })
                .collect();
            files.sort();
            while files.len() > 7 {
                let _ = fs::remove_file(files.remove(0));
            }
        }
    }
}

#[tauri::command]
pub fn store_load(app: AppHandle, name: String) -> Result<Option<Value>, String> {
    let _g = FILE_LOCK.lock().map_err(|e| e.to_string())?;
    let path = store_file(&app, &name)?;
    if !path.exists() {
        return Ok(None);
    }
    let txt = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    match serde_json::from_str(&txt) {
        Ok(v) => Ok(Some(v)),
        Err(_) => {
            // Beschädigte Datei nicht überschreiben, sondern beiseitelegen.
            let bad = path.with_file_name(format!("{name}.defekt-{}.json", now_ms()));
            let _ = fs::copy(&path, bad);
            Ok(None)
        }
    }
}

#[tauri::command]
pub fn store_save(app: AppHandle, name: String, data: Value) -> Result<(), String> {
    let _g = FILE_LOCK.lock().map_err(|e| e.to_string())?;
    let path = store_file(&app, &name)?;
    daily_backup(&app, &name, &path);
    let txt = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    write_atomic(&path, &txt)
}

/// Wird vom Backend nach jeder Spielsitzung aufgerufen.
pub fn append_session(app: &AppHandle, session: Value) -> Result<(), String> {
    let _g = FILE_LOCK.lock().map_err(|e| e.to_string())?;
    let path = store_file(app, "sessions")?;
    let mut list: Vec<Value> = fs::read_to_string(&path)
        .ok()
        .and_then(|t| serde_json::from_str::<Value>(&t).ok())
        .and_then(|v| match v {
            Value::Array(a) => Some(a),
            _ => None,
        })
        .unwrap_or_default();
    list.push(session);
    let txt = serde_json::to_string(&Value::Array(list)).map_err(|e| e.to_string())?;
    write_atomic(&path, &txt)
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("{path}: {e}"))
}

#[tauri::command]
pub fn write_text_file(path: String, content: String) -> Result<(), String> {
    write_atomic(Path::new(&path), &content)
}

#[tauri::command]
pub fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    exists: bool,
    is_file: bool,
    size: u64,
    modified: u64,
}

#[tauri::command]
pub fn file_info(path: String) -> FileInfo {
    match fs::metadata(&path) {
        Ok(m) => FileInfo {
            exists: true,
            is_file: m.is_file(),
            size: m.len(),
            modified: m
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0),
        },
        Err(_) => FileInfo { exists: false, is_file: false, size: 0, modified: 0 },
    }
}

/// Kopiert ein Bild in den Artwork-Ordner des Spiels und gibt den neuen Pfad zurück.
#[tauri::command]
pub fn import_artwork(app: AppHandle, game_id: String, kind: String, src: String) -> Result<String, String> {
    if !ART_KINDS.contains(&kind.as_str()) {
        return Err("Unbekannte Artwork-Art".into());
    }
    let src_path = PathBuf::from(&src);
    let ext = src_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    if !IMG_EXT.contains(&ext.as_str()) {
        return Err("Bitte ein Bild wählen (PNG, JPG, WEBP, GIF, SVG, AVIF).".into());
    }
    let dir = sub_dir(&app, "artwork")?.join(safe_id(&game_id));
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    if let Ok(rd) = fs::read_dir(&dir) {
        for e in rd.flatten() {
            let n = e.file_name().to_string_lossy().to_string();
            if n.starts_with(&format!("{kind}-")) {
                let _ = fs::remove_file(e.path());
            }
        }
    }
    let dest = dir.join(format!("{kind}-{}.{ext}", now_ms()));
    fs::copy(&src_path, &dest).map_err(|e| format!("Bild konnte nicht kopiert werden: {e}"))?;
    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
pub fn delete_file(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_file() {
        fs::remove_file(p).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Entfernt Artwork, Logs und (optional) den Standard-Prefix eines Spiels.
#[tauri::command]
pub fn delete_game_data(app: AppHandle, game_id: String, delete_prefix: bool) -> Result<(), String> {
    let id = safe_id(&game_id);
    let base = data_dir(&app)?;
    let _ = fs::remove_dir_all(base.join("artwork").join(&id));
    let _ = fs::remove_file(base.join("logs").join(format!("{id}.log")));
    let _ = fs::remove_file(base.join("logs").join(format!("{id}-tool.log")));
    if delete_prefix {
        let _ = fs::remove_dir_all(base.join("prefixes").join(&id));
    }
    Ok(())
}

#[tauri::command]
pub fn get_data_dir(app: AppHandle) -> Result<String, String> {
    Ok(data_dir(&app)?.to_string_lossy().to_string())
}

#[tauri::command]
pub fn read_log(app: AppHandle, game_id: String) -> Result<String, String> {
    let path = sub_dir(&app, "logs")?.join(format!("{}.log", safe_id(&game_id)));
    let bytes = fs::read(&path).unwrap_or_default();
    let max = 256 * 1024;
    let slice = if bytes.len() > max { &bytes[bytes.len() - max..] } else { &bytes[..] };
    Ok(String::from_utf8_lossy(slice).to_string())
}

#[tauri::command]
pub fn list_backups(app: AppHandle) -> Result<Vec<String>, String> {
    let dir = sub_dir(&app, "backups")?;
    let mut out: Vec<String> = fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .flatten()
        .map(|e| e.path().to_string_lossy().to_string())
        .collect();
    out.sort();
    out.reverse();
    Ok(out)
}
