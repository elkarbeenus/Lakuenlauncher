//! Durchsucht Ordner nach AppImages und Windows-Spielen (.exe).

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanHit {
    path: String,
    name: String,
    kind: String,
    size: u64,
}

const SKIP_DIRS: [&str; 22] = [
    "windows", "system32", "syswow64", "redist", "_commonredist", "commonredist", "directx",
    "dotnet", "vcredist", "__installer", "_installer", "installer", "support", "__support",
    "crashreport", "crashpad", "engine", "node_modules", "prerequisites", "_redist", "drive_c",
    "compatdata",
];

const SKIP_EXE: [&str; 24] = [
    "unins", "uninstall", "setup", "install", "vc_redist", "vcredist", "dxsetup", "dxwebsetup",
    "crashhandler", "crashreport", "crashpad", "unitycrashhandler", "notification_helper",
    "dotnet", "redist", "updater", "update", "helper", "easyanticheat", "be_service",
    "battleye", "launcherpatcher", "cefprocess", "quicksfv",
];

const GENERIC_DIRS: [&str; 10] = [
    "bin", "binaries", "win64", "win32", "x64", "x86", "game", "release", "shipping", "build",
];

fn clean_name(raw: &str) -> String {
    let mut words: Vec<String> = Vec::new();
    for w in raw
        .replace(".AppImage", "")
        .replace(".appimage", "")
        .split(|c: char| c == '_' || c == '-' || c == '.' || c == ' ')
    {
        let lw = w.to_ascii_lowercase();
        if w.is_empty()
            || ["x86", "64", "x86_64", "amd64", "appimage", "linux", "win64", "shipping", "x64"]
                .contains(&lw.as_str())
        {
            continue;
        }
        // Versionsnummern wie v1, 1, 2025 weglassen
        let is_version = lw.trim_start_matches('v').chars().all(|c| c.is_ascii_digit());
        if is_version && !words.is_empty() {
            continue;
        }
        words.push(w.to_string());
    }
    let joined = words.join(" ");
    if joined.trim().is_empty() {
        raw.to_string()
    } else {
        joined
    }
}

fn guess_exe_name(path: &Path) -> String {
    let mut dir = path.parent();
    while let Some(d) = dir {
        let n = d.file_name().map(|x| x.to_string_lossy().to_string()).unwrap_or_default();
        if n.is_empty() {
            break;
        }
        if !GENERIC_DIRS.contains(&n.to_ascii_lowercase().as_str()) {
            return clean_name(&n);
        }
        dir = d.parent();
    }
    clean_name(&path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default())
}

fn walk(dir: &Path, depth: u32, max_depth: u32, out: &mut Vec<ScanHit>) {
    if out.len() > 500 {
        return;
    }
    let Ok(rd) = fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let path: PathBuf = e.path();
        let Ok(meta) = fs::symlink_metadata(&path) else { continue };
        let name = e.file_name().to_string_lossy().to_string();
        let lower = name.to_ascii_lowercase();
        if name.starts_with('.') {
            continue;
        }
        if meta.is_dir() {
            if depth < max_depth && !SKIP_DIRS.contains(&lower.as_str()) {
                walk(&path, depth + 1, max_depth, out);
            }
            continue;
        }
        let kind = if lower.ends_with(".appimage") {
            "appimage"
        } else if lower.ends_with(".exe") {
            if SKIP_EXE.iter().any(|s| lower.starts_with(s) || lower.contains(&format!("_{s}")) || lower.contains(&format!("-{s}"))) {
                continue;
            }
            "exe"
        } else {
            continue;
        };
        let display = if kind == "exe" {
            guess_exe_name(&path)
        } else {
            clean_name(&name)
        };
        out.push(ScanHit {
            path: path.to_string_lossy().to_string(),
            name: display,
            kind: kind.into(),
            size: fs::metadata(&path).map(|m| m.len()).unwrap_or(0),
        });
    }
}

#[tauri::command]
pub fn scan_folder(path: String, max_depth: Option<u32>) -> Result<Vec<ScanHit>, String> {
    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err(format!("Ordner nicht gefunden: {path}"));
    }
    let mut out = Vec::new();
    walk(&root, 0, max_depth.unwrap_or(4).min(8), &mut out);
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}
