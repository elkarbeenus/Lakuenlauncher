//! Erkennung von Proton-Versionen (offiziell, Experimental, GE-Proton, eigene)
//! sowie von Hilfswerkzeugen wie umu-launcher, MangoHud und GameMode.

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
pub struct ProtonVersion {
    pub name: String,
    pub path: String,
    /// "experimental" | "official" | "ge" | "custom"
    pub kind: String,
}

pub fn home() -> PathBuf {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/"))
}

/// Mögliche Steam-Installationsorte (nativ und Flatpak).
pub fn steam_roots() -> Vec<PathBuf> {
    let h = home();
    let candidates = [
        h.join(".steam/steam"),
        h.join(".steam/root"),
        h.join(".local/share/Steam"),
        h.join(".var/app/com.valvesoftware.Steam/data/Steam"),
        h.join(".var/app/com.valvesoftware.Steam/.local/share/Steam"),
    ];
    let mut out: Vec<PathBuf> = Vec::new();
    for c in candidates {
        if c.is_dir() {
            let real = c.canonicalize().unwrap_or(c);
            if !out.contains(&real) {
                out.push(real);
            }
        }
    }
    out
}

pub fn steam_root() -> Option<PathBuf> {
    steam_roots().into_iter().next()
}

/// Liest zusätzliche Steam-Bibliotheken (z. B. SD-Karte) aus libraryfolders.vdf.
fn library_dirs(root: &Path) -> Vec<PathBuf> {
    let mut libs = vec![root.to_path_buf()];
    let vdf = root.join("steamapps/libraryfolders.vdf");
    if let Ok(text) = fs::read_to_string(vdf) {
        for line in text.lines() {
            let t = line.trim();
            if !t.starts_with("\"path\"") {
                continue;
            }
            let parts: Vec<&str> = t.split('"').collect();
            if parts.len() >= 4 {
                let p = PathBuf::from(parts[3].replace("\\\\", "\\"));
                if p.is_dir() && !libs.contains(&p) {
                    libs.push(p);
                }
            }
        }
    }
    libs
}

fn classify(name: &str) -> String {
    let n = name.to_lowercase();
    if n.contains("experimental") {
        "experimental".into()
    } else if n.contains("ge-proton") || n.contains("proton-ge") || n.contains("proton-cachyos") {
        "ge".into()
    } else if n.starts_with("proton") {
        "official".into()
    } else {
        "custom".into()
    }
}

fn numbers(name: &str) -> Vec<u32> {
    name.split(|c: char| !c.is_ascii_digit())
        .filter(|s| !s.is_empty())
        .filter_map(|s| s.parse::<u32>().ok())
        .collect()
}

fn rank(v: &ProtonVersion) -> (u8, Vec<u32>) {
    let prio = match v.kind.as_str() {
        "experimental" => 4,
        "official" => 3,
        "ge" => 2,
        _ => 1,
    };
    (prio, numbers(&v.name))
}

/// Durchsucht alle bekannten Orte nach Ordnern mit einem `proton`-Skript.
pub fn detect() -> Vec<ProtonVersion> {
    let mut dirs: Vec<PathBuf> = Vec::new();
    for root in steam_roots() {
        for lib in library_dirs(&root) {
            dirs.push(lib.join("steamapps/common"));
        }
        dirs.push(root.join("compatibilitytools.d"));
    }
    dirs.push(PathBuf::from("/usr/share/steam/compatibilitytools.d"));
    dirs.push(PathBuf::from("/usr/local/share/steam/compatibilitytools.d"));

    let mut found: Vec<ProtonVersion> = Vec::new();
    let mut seen: HashSet<PathBuf> = HashSet::new();
    for dir in dirs {
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let p = entry.path();
            if !p.join("proton").is_file() {
                continue;
            }
            let real = p.canonicalize().unwrap_or_else(|_| p.clone());
            if !seen.insert(real) {
                continue;
            }
            let name = p
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "Proton".into());
            let kind = classify(&name);
            found.push(ProtonVersion {
                name,
                path: p.to_string_lossy().to_string(),
                kind,
            });
        }
    }
    found.sort_by(|a, b| rank(b).cmp(&rank(a)));
    found
}

/// Wählt eine Version anhand der Einstellung:
/// "auto-experimental", "auto-latest" oder ein konkreter Name.
pub fn resolve(choice: &str, versions: &[ProtonVersion]) -> Option<ProtonVersion> {
    let by_kind = |k: &str| versions.iter().find(|v| v.kind == k).cloned();
    match choice {
        "auto-experimental" => by_kind("experimental")
            .or_else(|| by_kind("official"))
            .or_else(|| versions.first().cloned()),
        "auto-latest" | "" => by_kind("official")
            .or_else(|| by_kind("ge"))
            .or_else(|| by_kind("experimental"))
            .or_else(|| versions.first().cloned()),
        name => versions
            .iter()
            .find(|v| v.name == name)
            .cloned()
            .or_else(|| resolve("auto-latest", versions)),
    }
}

/// Sucht ein Programm im PATH (plus typische Orte auf SteamOS).
pub fn which(program: &str) -> Option<PathBuf> {
    let mut paths: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).collect())
        .unwrap_or_default();
    let h = home();
    paths.push(h.join(".local/bin"));
    paths.push(h.join("bin"));
    paths.push(PathBuf::from("/usr/bin"));
    paths.push(PathBuf::from("/usr/local/bin"));
    for dir in paths {
        let cand = dir.join(program);
        if cand.is_file() {
            return Some(cand);
        }
    }
    None
}

#[tauri::command]
pub fn list_proton() -> Vec<ProtonVersion> {
    detect()
}

#[derive(Serialize)]
pub struct Tools {
    pub umu: bool,
    pub mangohud: bool,
    pub gamemode: bool,
    pub winetricks: bool,
    pub steam_root: Option<String>,
}

#[tauri::command]
pub fn detect_tools() -> Tools {
    Tools {
        umu: which("umu-run").is_some(),
        mangohud: which("mangohud").is_some(),
        gamemode: which("gamemoderun").is_some(),
        winetricks: which("winetricks").is_some(),
        steam_root: steam_root().map(|p| p.to_string_lossy().to_string()),
    }
}
