//! Betriebssystem-spezifische Funktionen.
//! Linux/SteamOS ist vollständig umgesetzt, Windows ist vorbereitet.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;

use crate::proton;
use crate::storage::safe_name;

/// Wird vor dem Start der Oberfläche aufgerufen.
pub fn prepare_environment() {
    #[cfg(target_os = "linux")]
    {
        // Verhindert leere/weiße Fenster mit WebKitGTK auf manchen GPU-Treibern.
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
            std::env::set_var("LAKUEN_SET_DMABUF", "1");
        }
    }
}

/// Entfernt Umgebungsvariablen, die das AppImage des Launchers selbst gesetzt hat,
/// damit gestartete Spiele (insbesondere Proton) nicht die Bibliotheken des
/// Launchers erben.
pub fn sanitize_env(cmd: &mut Command) {
    #[cfg(target_os = "linux")]
    {
        if std::env::var_os("LAKUEN_SET_DMABUF").is_some() {
            cmd.env_remove("WEBKIT_DISABLE_DMABUF_RENDERER");
        }
        cmd.env_remove("LAKUEN_SET_DMABUF");

        let appdir = match std::env::var("APPDIR") {
            Ok(d) if !d.is_empty() => d,
            _ => return,
        };
        let path_lists = [
            "LD_LIBRARY_PATH",
            "PATH",
            "XDG_DATA_DIRS",
            "XDG_CONFIG_DIRS",
            "GST_PLUGIN_PATH",
            "GST_PLUGIN_SYSTEM_PATH",
            "GST_PLUGIN_SYSTEM_PATH_1_0",
            "GST_PLUGIN_SCANNER",
            "GSETTINGS_SCHEMA_DIR",
            "GDK_PIXBUF_MODULE_FILE",
            "GDK_PIXBUF_MODULEDIR",
            "GIO_MODULE_DIR",
            "GTK_PATH",
            "GTK_DATA_PREFIX",
            "GTK_EXE_PREFIX",
            "GTK_IM_MODULE_FILE",
            "PYTHONHOME",
            "PYTHONPATH",
            "PERLLIB",
            "QT_PLUGIN_PATH",
            "LIBGL_DRIVERS_PATH",
        ];
        for var in path_lists {
            if let Ok(value) = std::env::var(var) {
                if !value.contains(&appdir) {
                    continue;
                }
                let kept: Vec<&str> = value
                    .split(':')
                    .filter(|p| !p.is_empty() && !p.starts_with(&appdir))
                    .collect();
                if kept.is_empty() {
                    cmd.env_remove(var);
                } else {
                    cmd.env(var, kept.join(":"));
                }
            }
        }
        for var in ["APPDIR", "APPIMAGE", "ARGV0", "OWD", "GDK_BACKEND", "GTK_THEME"] {
            cmd.env_remove(var);
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = cmd;
    }
}

/// Setzt das Ausführungsrecht (z. B. für frisch heruntergeladene AppImages).
pub fn ensure_executable(path: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = fs::metadata(path) {
            let mut perms = meta.permissions();
            let mode = perms.mode();
            if mode & 0o111 == 0 {
                perms.set_mode(mode | 0o755);
                let _ = fs::set_permissions(path, perms);
            }
        }
    }
    #[cfg(not(unix))]
    {
        let _ = path;
    }
}

/// Startet den Prozess in einer eigenen Prozessgruppe.
pub fn detach_group(cmd: &mut Command) {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    #[cfg(not(unix))]
    {
        let _ = cmd;
    }
}

/// Prüft über /proc, ob noch ein (nicht-Zombie-)Prozess der Gruppe läuft.
#[cfg(target_os = "linux")]
pub fn group_alive(pgid: u32) -> bool {
    let Ok(entries) = fs::read_dir("/proc") else { return false };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if !name.bytes().all(|b| b.is_ascii_digit()) {
            continue;
        }
        let Ok(stat) = fs::read_to_string(entry.path().join("stat")) else { continue };
        // Format: pid (comm) state ppid pgrp ...
        let Some(close) = stat.rfind(')') else { continue };
        let rest: Vec<&str> = stat[close + 1..].split_whitespace().collect();
        if rest.len() < 3 {
            continue;
        }
        if rest[0] == "Z" || rest[0] == "X" {
            continue;
        }
        if rest[2].parse::<u32>().ok() == Some(pgid) {
            return true;
        }
    }
    false
}

#[cfg(not(target_os = "linux"))]
pub fn group_alive(_pgid: u32) -> bool {
    false
}

pub fn wait_for_group(pgid: u32) {
    while group_alive(pgid) {
        std::thread::sleep(std::time::Duration::from_secs(2));
    }
}

/// Beendet die ganze Prozessgruppe: erst freundlich, nach 8 s hart.
pub fn terminate_group(pid: u32) {
    #[cfg(unix)]
    {
        let target = format!("-{pid}");
        let _ = Command::new("kill").args(["-TERM", "--", &target]).status();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(8));
            if group_alive(pid) {
                let _ = Command::new("kill").args(["-KILL", "--", &target]).status();
            }
        });
    }
    #[cfg(windows)]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .status();
    }
}

#[derive(Serialize, Clone)]
pub struct FileInfo {
    pub path: String,
    pub name: String,
    pub kind: String,
    pub size: u64,
}

pub fn kind_of(path: &Path) -> String {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();
    match ext.as_str() {
        "exe" => "exe".into(),
        "appimage" => "appimage".into(),
        _ => "native".into(),
    }
}

const GENERIC_DIRS: [&str; 14] = [
    "bin", "bin64", "x64", "x86", "win64", "win32", "binaries", "system", "game", "release",
    "build", "shipping", "linux", "windows",
];
const CONTAINER_DIRS: [&str; 10] = [
    "downloads", "download", "desktop", "games", "spiele", "apps", "applications", "home",
    "appimages", "programme",
];

fn tidy(raw: &str, kind: &str) -> String {
    let drop = [
        "x86_64", "x86-64", "amd64", "x64", "linux", "appimage", "win64", "win32", "shipping",
        "setup", "portable",
    ];
    let mut words: Vec<String> = Vec::new();
    for w in raw.split(|c: char| c == '_' || c == '-' || c == ' ' || c == '.') {
        if w.is_empty() {
            continue;
        }
        let low = w.to_lowercase();
        if drop.contains(&low.as_str()) {
            continue;
        }
        // Versionsnummern wie v1.2 oder 1.0.3 weglassen (nur bei AppImages üblich)
        let versionish = low.starts_with('v') && low[1..].chars().all(|c| c.is_ascii_digit())
            && low.len() > 1
            || (kind == "appimage" && low.chars().all(|c| c.is_ascii_digit()));
        if versionish {
            continue;
        }
        let word = if w.chars().all(|c| !c.is_uppercase()) {
            let mut cs = w.chars();
            match cs.next() {
                Some(f) => f.to_uppercase().collect::<String>() + cs.as_str(),
                None => String::new(),
            }
        } else {
            w.to_string()
        };
        words.push(word);
    }
    if words.is_empty() {
        raw.to_string()
    } else {
        words.join(" ")
    }
}

/// Schlägt einen Anzeigenamen vor: bei .exe meist der Spielordner, sonst der Dateiname.
pub fn suggest_name(path: &Path, kind: &str) -> String {
    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "Unbenannt".into());
    if kind == "exe" {
        let user = proton::home()
            .file_name()
            .map(|n| n.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        let mut dir = path.parent();
        while let Some(d) = dir {
            let Some(name) = d.file_name().map(|n| n.to_string_lossy().to_string()) else { break };
            let low = name.to_lowercase();
            if GENERIC_DIRS.contains(&low.as_str()) {
                dir = d.parent();
                continue;
            }
            if CONTAINER_DIRS.contains(&low.as_str()) || low == user || low.starts_with('.') {
                break;
            }
            return tidy(&name, kind);
        }
    }
    tidy(&stem, kind)
}

#[tauri::command]
pub fn inspect_file(path: String) -> Result<FileInfo, String> {
    let p = PathBuf::from(&path);
    let meta = fs::metadata(&p).map_err(|e| format!("Datei nicht gefunden: {e}"))?;
    let kind = kind_of(&p);
    Ok(FileInfo {
        name: suggest_name(&p, &kind),
        kind,
        size: meta.len(),
        path,
    })
}

fn skip_file(low: &str) -> bool {
    const SKIP: [&str; 22] = [
        "unins", "setup", "install", "redist", "vcredist", "dxsetup", "crashhandler",
        "crashpad", "crashreport", "uploader", "updater", "helper", "dotnet", "directx",
        "physx", "prereq", "easyanticheat", "be_service", "cefsharp", "dxwebsetup", "vc_redist",
        "notification",
    ];
    SKIP.iter().any(|s| low.contains(s))
}

fn skip_dir(low: &str) -> bool {
    const SKIP: [&str; 12] = [
        "_commonredist", "redist", "__installer", "directx", "prefixes", "pfx", "compatdata",
        "node_modules", "windows", "shadercache", "steamapps", "dotnet",
    ];
    low.starts_with('.') || SKIP.contains(&low)
}

fn scan(dir: &Path, depth: u32, out: &mut Vec<FileInfo>) {
    if depth > 4 || out.len() >= 400 {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else { return };
    let mut subdirs = Vec::new();
    for entry in entries.flatten() {
        let p = entry.path();
        let name = entry.file_name().to_string_lossy().to_lowercase();
        let Ok(ft) = entry.file_type() else { continue };
        if ft.is_dir() {
            if !skip_dir(&name) {
                subdirs.push(p);
            }
            continue;
        }
        let kind = kind_of(&p);
        if kind == "native" || skip_file(&name) {
            continue;
        }
        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
        out.push(FileInfo {
            name: suggest_name(&p, &kind),
            path: p.to_string_lossy().to_string(),
            kind,
            size,
        });
    }
    for sub in subdirs {
        scan(&sub, depth + 1, out);
    }
}

/// Sucht in einem Ordner (bis 4 Ebenen tief) nach AppImages und .exe-Dateien.
#[tauri::command]
pub fn scan_folder(path: String) -> Result<Vec<FileInfo>, String> {
    let dir = PathBuf::from(&path);
    if !dir.is_dir() {
        return Err("Ordner nicht gefunden.".into());
    }
    let mut out = Vec::new();
    scan(&dir, 0, &mut out);
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}

fn spawn_opener(target: &str) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    let mut cmd = {
        let mut c = Command::new("xdg-open");
        c.arg(target);
        c
    };
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = Command::new("explorer");
        c.arg(target);
        c
    };
    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = Command::new("open");
        c.arg(target);
        c
    };
    sanitize_env(&mut cmd);
    let mut child = cmd.spawn().map_err(|e| format!("Konnte nicht geöffnet werden: {e}"))?;
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

/// Öffnet einen Ordner im Dateimanager (bei Dateien den enthaltenden Ordner).
#[tauri::command]
pub fn open_path(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    let target = if p.is_file() {
        p.parent().map(|d| d.to_path_buf()).unwrap_or(p)
    } else {
        p
    };
    if !target.exists() {
        return Err("Ordner existiert (noch) nicht.".into());
    }
    spawn_opener(&target.to_string_lossy())
}

#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    if !url.starts_with("https://") {
        return Err("Nur https-Links werden geöffnet.".into());
    }
    spawn_opener(&url)
}

fn self_executable() -> String {
    if let Ok(appimage) = std::env::var("APPIMAGE") {
        if !appimage.is_empty() {
            return appimage;
        }
    }
    std::env::current_exe()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| "lakuenlauncher".into())
}

fn applications_dir() -> PathBuf {
    proton::home().join(".local/share/applications")
}

fn desktop_dir() -> PathBuf {
    let out = Command::new("xdg-user-dir").arg("DESKTOP").output();
    if let Ok(o) = out {
        let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
        if !s.is_empty() && Path::new(&s).is_dir() {
            return PathBuf::from(s);
        }
    }
    proton::home().join("Desktop")
}

fn shortcut_file_name(id: &str) -> String {
    format!("lakuenlauncher-{}.desktop", safe_name(id))
}

/// Legt eine .desktop-Verknüpfung an, die das Spiel über den Launcher startet
/// (so wird auch die Spielzeit gezählt). Lässt sich in Steam als Nicht-Steam-Spiel hinzufügen.
#[tauri::command]
pub fn create_shortcut(
    id: String,
    name: String,
    icon: Option<String>,
    on_desktop: bool,
) -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        let clean_name: String = name.chars().filter(|c| *c != '\n' && *c != '\r').collect();
        let exec = self_executable().replace('"', "\\\"");
        let mut content = format!(
            "[Desktop Entry]\nType=Application\nName={clean_name}\nComment=Über LakuenLauncher starten\nExec=\"{exec}\" --launch {id}\nTerminal=false\nCategories=Game;\n",
            id = safe_name(&id)
        );
        if let Some(icon) = icon.filter(|i| !i.trim().is_empty()) {
            content.push_str(&format!("Icon={icon}\n"));
        }
        let file = shortcut_file_name(&id);
        let mut targets = vec![applications_dir()];
        if on_desktop {
            targets.push(desktop_dir());
        }
        let mut written = String::new();
        for dir in targets {
            fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            let path = dir.join(&file);
            fs::write(&path, &content).map_err(|e| format!("Verknüpfung nicht anlegbar: {e}"))?;
            ensure_executable(&path);
            written = path.to_string_lossy().to_string();
        }
        Ok(written)
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (id, name, icon, on_desktop);
        Err("Verknüpfungen sind unter diesem System noch nicht verfügbar.".into())
    }
}

#[tauri::command]
pub fn remove_shortcut(id: String) -> Result<(), String> {
    let file = shortcut_file_name(&id);
    for dir in [applications_dir(), desktop_dir()] {
        let p = dir.join(&file);
        if p.is_file() {
            let _ = fs::remove_file(p);
        }
    }
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub os: String,
    pub version: String,
    pub appimage: bool,
    pub steam_os: bool,
}

#[tauri::command]
pub fn system_info() -> SystemInfo {
    let os_release = fs::read_to_string("/etc/os-release").unwrap_or_default();
    SystemInfo {
        os: std::env::consts::OS.into(),
        version: env!("CARGO_PKG_VERSION").into(),
        appimage: std::env::var_os("APPIMAGE").is_some(),
        steam_os: os_release.contains("ID=steamos"),
    }
}
