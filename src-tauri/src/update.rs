//! Selbst-Update der AppImage (1 Klick: laden, prüfen, ersetzen, neu starten)
//! sowie Bilddaten für zugeschnittenes/generiertes Artwork.

use crate::{platform, store};
use serde_json::json;
use std::fs;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

// ---------- Base64 (ohne zusätzliche Abhängigkeit) ----------
const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

pub fn b64_encode(data: &[u8]) -> String {
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | b[2] as u32;
        out.push(B64[(n >> 18) as usize & 63] as char);
        out.push(B64[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { B64[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { B64[n as usize & 63] as char } else { '=' });
    }
    out
}

pub fn b64_decode(s: &str) -> Result<Vec<u8>, String> {
    let mut map = [255u8; 256];
    for (i, c) in B64.iter().enumerate() {
        map[*c as usize] = i as u8;
    }
    let mut out = Vec::with_capacity(s.len() / 4 * 3);
    let mut buf = 0u32;
    let mut bits = 0u32;
    for c in s.bytes() {
        if c == b'=' || c == b'\n' || c == b'\r' || c == b' ' {
            continue;
        }
        let v = map[c as usize];
        if v == 255 {
            return Err("Ungültige Bilddaten".into());
        }
        buf = (buf << 6) | v as u32;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
            buf &= (1 << bits) - 1;
        }
    }
    Ok(out)
}

/// Liest eine Bilddatei als data:-URL (für den Zuschneide-Editor, ohne Canvas-Sperre).
#[tauri::command]
pub fn read_image_data_url(path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    let meta = fs::metadata(&p).map_err(|e| format!("{path}: {e}"))?;
    if meta.len() > 60 * 1024 * 1024 {
        return Err("Das Bild ist zu groß (max. 60 MB).".into());
    }
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "avif" => "image/avif",
        "bmp" => "image/bmp",
        _ => return Err("Bitte ein Bild wählen (PNG, JPG, WEBP, GIF, SVG, AVIF).".into()),
    };
    let bytes = fs::read(&p).map_err(|e| e.to_string())?;
    Ok(format!("data:{mime};base64,{}", b64_encode(&bytes)))
}

/// Speichert zugeschnittenes oder generiertes Artwork (PNG/JPEG als Base64).
#[tauri::command]
pub fn save_artwork_data(app: AppHandle, game_id: String, kind: String, data: String) -> Result<String, String> {
    if !["cover", "hero", "logo", "icon"].contains(&kind.as_str()) {
        return Err("Unbekannte Artwork-Art".into());
    }
    let (ext, payload) = if let Some(rest) = data.strip_prefix("data:image/png;base64,") {
        ("png", rest)
    } else if let Some(rest) = data.strip_prefix("data:image/jpeg;base64,") {
        ("jpg", rest)
    } else if let Some(rest) = data.strip_prefix("data:image/webp;base64,") {
        ("webp", rest)
    } else {
        ("png", data.as_str())
    };
    let bytes = b64_decode(payload)?;
    let dir = store::sub_dir(&app, "artwork")?.join(store::safe_id(&game_id));
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    if let Ok(rd) = fs::read_dir(&dir) {
        for e in rd.flatten() {
            if e.file_name().to_string_lossy().starts_with(&format!("{kind}-")) {
                let _ = fs::remove_file(e.path());
            }
        }
    }
    let dest = dir.join(format!("{kind}-{}.{ext}", store::now_ms()));
    fs::write(&dest, bytes).map_err(|e| format!("Bild konnte nicht gespeichert werden: {e}"))?;
    Ok(dest.to_string_lossy().to_string())
}

// ---------- Selbst-Update ----------
fn appimage_path() -> Option<PathBuf> {
    std::env::var_os("APPIMAGE").map(PathBuf::from).filter(|p| p.is_file())
}

#[tauri::command]
pub fn can_self_update() -> bool {
    cfg!(target_os = "linux") && appimage_path().is_some()
}

fn sha256_of(path: &PathBuf) -> Result<String, String> {
    let mut c = Command::new("sha256sum");
    c.arg(path);
    platform::sanitize_env(&mut c);
    let out = c.output().map_err(|e| format!("sha256sum nicht verfügbar: {e}"))?;
    if !out.status.success() {
        return Err("Prüfsumme konnte nicht berechnet werden".into());
    }
    Ok(String::from_utf8_lossy(&out.stdout)
        .split_whitespace()
        .next()
        .unwrap_or("")
        .to_ascii_lowercase())
}

fn do_update(app: &AppHandle, url: &str, sha256: Option<String>, size: u64) -> Result<(), String> {
    let target = appimage_path().ok_or("Läuft nicht als AppImage – bitte manuell aktualisieren.")?;
    let dir = target.parent().ok_or("Ordner der AppImage nicht gefunden")?.to_path_buf();
    let tmp = dir.join(".LakuenLauncher-update.part");
    let _ = fs::remove_file(&tmp);

    let mut c = Command::new("curl");
    c.args(["-fL", "--retry", "3", "--connect-timeout", "20", "--max-time", "1800", "-s", "-o"])
        .arg(&tmp)
        .arg(url)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());
    platform::sanitize_env(&mut c);
    let mut child = c
        .spawn()
        .map_err(|e| format!("Download konnte nicht starten (curl fehlt?): {e}"))?;
    loop {
        if let Some(st) = child.try_wait().map_err(|e| e.to_string())? {
            if !st.success() {
                let _ = fs::remove_file(&tmp);
                return Err(format!("Download fehlgeschlagen (curl {:?}). Ist der Ordner beschreibbar und das Internet da?", st.code()));
            }
            break;
        }
        let done = fs::metadata(&tmp).map(|m| m.len()).unwrap_or(0);
        let _ = app.emit("update-progress", json!({ "done": done, "total": size }));
        std::thread::sleep(Duration::from_millis(350));
    }
    let done = fs::metadata(&tmp).map(|m| m.len()).unwrap_or(0);
    let _ = app.emit("update-progress", json!({ "done": done, "total": size, "verifying": true }));

    // Plausibilität: ELF-Datei und erwartete Größe
    let head = fs::read(&tmp).map(|b| b.get(..4).map(|h| h.to_vec()).unwrap_or_default()).unwrap_or_default();
    if head != b"\x7fELF" {
        let _ = fs::remove_file(&tmp);
        return Err("Die heruntergeladene Datei ist keine gültige AppImage.".into());
    }
    if size > 0 && done != size {
        let _ = fs::remove_file(&tmp);
        return Err(format!("Download unvollständig ({done} von {size} Bytes)."));
    }
    if let Some(expected) = sha256.map(|s| s.trim().trim_start_matches("sha256:").to_ascii_lowercase()).filter(|s| s.len() == 64) {
        let got = sha256_of(&tmp)?;
        if got != expected {
            let _ = fs::remove_file(&tmp);
            return Err("Prüfsumme (SHA-256) stimmt nicht – Update abgebrochen, nichts wurde verändert.".into());
        }
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&tmp, fs::Permissions::from_mode(0o755)).map_err(|e| e.to_string())?;
    }
    // Atomar ersetzen (die laufende alte Version bleibt bis zum Neustart nutzbar)
    fs::rename(&tmp, &target).map_err(|e| format!("Konnte die AppImage nicht ersetzen: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn self_update(app: AppHandle, url: String, sha256: Option<String>, size: Option<u64>) -> Result<(), String> {
    if !url.starts_with("https://github.com/elkarbeenus/") {
        return Err("Update-Quelle nicht erlaubt.".into());
    }
    if !can_self_update() {
        return Err("Läuft nicht als AppImage – bitte manuell aktualisieren.".into());
    }
    let app2 = app.clone();
    std::thread::spawn(move || match do_update(&app2, &url, sha256, size.unwrap_or(0)) {
        Ok(()) => {
            let _ = app2.emit("update-done", json!({}));
        }
        Err(e) => {
            let _ = app2.emit("update-error", json!({ "error": e }));
        }
    });
    Ok(())
}

/// Startet die (neue) AppImage und beendet die laufende Instanz.
#[tauri::command]
pub fn restart_app(app: AppHandle) -> Result<(), String> {
    let exe = appimage_path()
        .or_else(|| std::env::current_exe().ok())
        .ok_or("Programmpfad unbekannt")?;
    #[cfg(unix)]
    {
        let mut c = Command::new("sh");
        c.arg("-c").arg("sleep 1.2; exec \"$0\"").arg(&exe);
        platform::sanitize_env(&mut c);
        c.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
        c.spawn().map_err(|e| e.to_string())?;
    }
    #[cfg(not(unix))]
    {
        Command::new(&exe).spawn().map_err(|e| e.to_string())?;
    }
    app.exit(0);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn base64_roundtrip() {
        for s in ["", "a", "ab", "abc", "abcd", "Hallo Welt! 🌸"] {
            let enc = b64_encode(s.as_bytes());
            assert_eq!(b64_decode(&enc).unwrap(), s.as_bytes());
        }
        assert_eq!(b64_encode(b"Man"), "TWFu");
        assert_eq!(b64_encode(b"Ma"), "TWE=");
    }
}
