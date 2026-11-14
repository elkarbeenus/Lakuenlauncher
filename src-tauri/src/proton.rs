//! Erkennung von Proton-Versionen (Steam, GE-Proton & Co.) und der Steam Linux Runtime.

use crate::platform::home;
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProtonInfo {
    pub name: String,
    pub path: String,
    pub source: String,
    pub experimental: bool,
    pub version: Vec<u64>,
    pub runtime: Option<String>,
}

fn push_unique(list: &mut Vec<PathBuf>, seen: &mut HashSet<PathBuf>, p: PathBuf) {
    if !p.is_dir() {
        return;
    }
    let key = fs::canonicalize(&p).unwrap_or_else(|_| p.clone());
    if seen.insert(key) {
        list.push(p);
    }
}

/// Mögliche Steam-Installationsordner (nativ und Flatpak).
pub fn steam_roots() -> Vec<PathBuf> {
    let h = home();
    let candidates = [
        h.join(".local/share/Steam"),
        h.join(".steam/steam"),
        h.join(".steam/root"),
        h.join(".steam/debian-installation"),
        h.join(".var/app/com.valvesoftware.Steam/data/Steam"),
        h.join(".var/app/com.valvesoftware.Steam/.local/share/Steam"),
    ];
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    for c in candidates {
        push_unique(&mut out, &mut seen, c);
    }
    out
}

pub fn steam_root() -> Option<PathBuf> {
    steam_roots().into_iter().next()
}

/// Alle Steam-Bibliotheksordner (inkl. SD-Karte / weitere Laufwerke).
pub fn library_dirs() -> Vec<PathBuf> {
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    for root in steam_roots() {
        push_unique(&mut out, &mut seen, root.clone());
        for vdf in [
            root.join("steamapps/libraryfolders.vdf"),
            root.join("config/libraryfolders.vdf"),
        ] {
            let Ok(txt) = fs::read_to_string(&vdf) else { continue };
            for line in txt.lines() {
                let t = line.trim();
                if t.starts_with("\"path\"") {
                    let parts: Vec<&str> = t.split('"').collect();
                    if parts.len() >= 4 {
                        let p = parts[3].replace("\\\\", "\\");
                        push_unique(&mut out, &mut seen, PathBuf::from(p));
                    }
                }
            }
        }
    }
    out
}

fn version_of(name: &str) -> Vec<u64> {
    let mut out = Vec::new();
    let mut cur = String::new();
    for c in name.chars() {
        if c.is_ascii_digit() {
            cur.push(c);
        } else if !cur.is_empty() {
            out.push(cur.parse().unwrap_or(0));
            cur.clear();
        }
    }
    if !cur.is_empty() {
        out.push(cur.parse().unwrap_or(0));
    }
    out
}

fn display_name(dir: &Path) -> String {
    // compatibilitytool.vdf enthält oft einen schöneren Namen
    if let Ok(txt) = fs::read_to_string(dir.join("compatibilitytool.vdf")) {
        for line in txt.lines() {
            let t = line.trim();
            if t.starts_with("\"display_name\"") {
                let parts: Vec<&str> = t.split('"').collect();
                if parts.len() >= 4 && !parts[3].is_empty() {
                    return parts[3].to_string();
                }
            }
        }
    }
    dir.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "Proton".into())
}

/// Ordner der Steam Linux Runtime, die eine Proton-Version laut toolmanifest braucht.
pub fn runtime_for(proton_dir: &Path) -> Option<PathBuf> {
    let manifest = fs::read_to_string(proton_dir.join("toolmanifest.vdf")).ok()?;
    let dir_name = if manifest.contains("1628350") {
        "SteamLinuxRuntime_sniper"
    } else if manifest.contains("1391110") {
        "SteamLinuxRuntime_soldier"
    } else {
        return None;
    };
    library_dirs()
        .into_iter()
        .map(|l| l.join("steamapps/common").join(dir_name))
        .find(|p| p.join("_v2-entry-point").exists())
}

pub fn detect() -> Vec<ProtonInfo> {
    let mut found: Vec<(PathBuf, String)> = Vec::new();
    let mut seen = HashSet::new();
    let mut add = |dir: PathBuf, source: &str, found: &mut Vec<(PathBuf, String)>| {
        if dir.join("proton").is_file() {
            let key = fs::canonicalize(&dir).unwrap_or_else(|_| dir.clone());
            if seen.insert(key) {
                found.push((dir, source.to_string()));
            }
        }
    };
    for lib in library_dirs() {
        if let Ok(rd) = fs::read_dir(lib.join("steamapps/common")) {
            for e in rd.flatten() {
                add(e.path(), "Steam", &mut found);
            }
        }
    }
    let mut compat_dirs: Vec<PathBuf> = steam_roots()
        .into_iter()
        .map(|r| r.join("compatibilitytools.d"))
        .collect();
    compat_dirs.push(PathBuf::from("/usr/share/steam/compatibilitytools.d"));
    compat_dirs.push(PathBuf::from("/usr/local/share/steam/compatibilitytools.d"));
    for cd in compat_dirs {
        if let Ok(rd) = fs::read_dir(&cd) {
            for e in rd.flatten() {
                add(e.path(), "Eigene", &mut found);
            }
        }
    }
    let mut list: Vec<ProtonInfo> = found
        .into_iter()
        .map(|(dir, source)| {
            let name = display_name(&dir);
            let lower = name.to_lowercase();
            ProtonInfo {
                experimental: lower.contains("experimental"),
                version: version_of(&name),
                runtime: runtime_for(&dir).map(|p| p.to_string_lossy().to_string()),
                path: dir.to_string_lossy().to_string(),
                name,
                source,
            }
        })
        .collect();
    list.sort_by(|a, b| {
        b.experimental
            .cmp(&a.experimental)
            .then_with(|| b.version.cmp(&a.version))
            .then_with(|| a.name.cmp(&b.name))
    });
    list
}

/// Neueste stabile Version, sonst Experimental.
pub fn newest() -> Option<ProtonInfo> {
    let list = detect();
    list.iter()
        .filter(|p| !p.experimental)
        .max_by(|a, b| a.version.cmp(&b.version))
        .cloned()
        .or_else(|| list.first().cloned())
}

#[tauri::command]
pub fn list_proton() -> Vec<ProtonInfo> {
    detect()
}
