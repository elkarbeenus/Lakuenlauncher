//! Betriebssystem-spezifische Hilfen. Linux/SteamOS ist das Hauptziel,
//! Windows ist über die cfg-Zweige vorbereitet.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tauri::AppHandle;

pub fn home() -> PathBuf {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/"))
}

/// Sucht ein Programm im PATH (ohne Ordner aus dem eigenen AppImage).
pub fn which(name: &str) -> Option<PathBuf> {
    let mut dirs: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).collect())
        .unwrap_or_default();
    let h = home();
    dirs.push(h.join(".local/bin"));
    dirs.push(PathBuf::from("/usr/local/bin"));
    dirs.push(PathBuf::from("/usr/bin"));
    let appdir = std::env::var("APPDIR").ok();
    for d in dirs {
        if let Some(a) = &appdir {
            if d.starts_with(a) {
                continue;
            }
        }
        let p = d.join(name);
        if p.is_file() {
            return Some(p);
        }
        #[cfg(windows)]
        {
            let pe = d.join(format!("{name}.exe"));
            if pe.is_file() {
                return Some(pe);
            }
        }
    }
    None
}

/// Entfernt Umgebungsvariablen, die das AppImage des Launchers setzt und die
/// gestartete Spiele/AppImages durcheinanderbringen würden.
pub fn sanitize_env(cmd: &mut Command) {
    #[cfg(target_os = "linux")]
    {
        const DROP: &[&str] = &[
            "LD_LIBRARY_PATH",
            "GDK_PIXBUF_MODULE_FILE",
            "GDK_PIXBUF_MODULEDIR",
            "GDK_BACKEND",
            "GTK_PATH",
            "GTK_EXE_PREFIX",
            "GTK_DATA_PREFIX",
            "GTK_IM_MODULE_FILE",
            "GTK_THEME",
            "GIO_MODULE_DIR",
            "GIO_EXTRA_MODULES",
            "GSETTINGS_SCHEMA_DIR",
            "GST_PLUGIN_SYSTEM_PATH",
            "GST_PLUGIN_SYSTEM_PATH_1_0",
            "GST_PLUGIN_PATH",
            "GST_PLUGIN_PATH_1_0",
            "GST_PLUGIN_SCANNER",
            "GST_PLUGIN_SCANNER_1_0",
            "GST_REGISTRY",
            "GST_REGISTRY_1_0",
            "PYTHONHOME",
            "PYTHONPATH",
            "PERLLIB",
            "QT_PLUGIN_PATH",
            "APPDIR",
            "APPIMAGE",
            "ARGV0",
            "OWD",
            "WEBKIT_DISABLE_DMABUF_RENDERER",
            "WEBKIT_EXEC_PATH",
        ];
        for k in DROP.iter() {
            cmd.env_remove(k);
        }
        if let Ok(appdir) = std::env::var("APPDIR") {
            for k in ["PATH", "XDG_DATA_DIRS", "XDG_CONFIG_DIRS"] {
                if let Ok(v) = std::env::var(k) {
                    let kept: Vec<&str> = v
                        .split(':')
                        .filter(|p| !p.is_empty() && !p.starts_with(&appdir))
                        .collect();
                    cmd.env(k, kept.join(":"));
                }
            }
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = cmd;
    }
}

#[cfg(unix)]
pub fn shell(script: &str) -> Command {
    let mut c = Command::new("sh");
    c.arg("-c").arg(script);
    sanitize_env(&mut c);
    c
}

#[cfg(windows)]
pub fn shell(script: &str) -> Command {
    let mut c = Command::new("cmd");
    c.arg("/C").arg(script);
    c
}

#[cfg(unix)]
pub fn ensure_executable(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    if let Ok(meta) = std::fs::metadata(path) {
        let mut perm = meta.permissions();
        if perm.mode() & 0o111 == 0 {
            perm.set_mode(perm.mode() | 0o755);
            let _ = std::fs::set_permissions(path, perm);
        }
    }
}

#[cfg(not(unix))]
pub fn ensure_executable(_path: &Path) {}

/// Alle Prozesse einer Prozessgruppe (Linux, über /proc).
#[cfg(target_os = "linux")]
pub fn group_members(pgid: u32) -> Vec<(u32, String)> {
    let mut out = Vec::new();
    let Ok(rd) = std::fs::read_dir("/proc") else { return out };
    for entry in rd.flatten() {
        let name = entry.file_name();
        let Some(pid) = name.to_str().and_then(|s| s.parse::<u32>().ok()) else { continue };
        let Ok(stat) = std::fs::read_to_string(format!("/proc/{pid}/stat")) else { continue };
        let (Some(open), Some(close)) = (stat.find('('), stat.rfind(')')) else { continue };
        let comm = stat[open + 1..close].to_string();
        let rest: Vec<&str> = stat[close + 1..].split_whitespace().collect();
        // rest[0] = Status, rest[1] = PPID, rest[2] = Prozessgruppe
        if rest.len() > 2 && rest[0] != "Z" && rest[2].parse::<u32>().ok() == Some(pgid) {
            out.push((pid, comm));
        }
    }
    out
}

/// Beendet ein laufendes Spiel samt Unterprozessen.
pub fn kill_tree(pid: u32) {
    #[cfg(unix)]
    {
        let group = format!("-{pid}");
        let _ = Command::new("kill").args(["-TERM", "--", &group]).status();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(6));
            #[cfg(target_os = "linux")]
            let alive = !group_members(pid).is_empty();
            #[cfg(not(target_os = "linux"))]
            let alive = true;
            if alive {
                let _ = Command::new("kill").args(["-KILL", "--", &group]).status();
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
    cmd.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    cmd.spawn().map(|_| ()).map_err(|e| format!("Konnte nicht öffnen: {e}"))
}

/// Öffnet eine Datei, einen Ordner oder einen Link mit dem Standardprogramm.
#[tauri::command]
pub fn open_path(path: String) -> Result<(), String> {
    spawn_opener(&path)
}

/// Öffnet den Ordner, in dem eine Datei liegt.
#[tauri::command]
pub fn reveal_path(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    let dir = if p.is_dir() {
        p
    } else {
        p.parent().map(|x| x.to_path_buf()).unwrap_or(p)
    };
    spawn_opener(&dir.to_string_lossy())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    os: String,
    home: String,
    data_dir: String,
    is_app_image: bool,
    umu: Option<String>,
    mangohud: bool,
    gamemode: bool,
    gamescope: bool,
    winetricks: bool,
    steam_root: Option<String>,
    steam_runtime: bool,
    desktop_entries: bool,
}

#[tauri::command]
pub fn system_info(app: AppHandle) -> SystemInfo {
    let runtime = crate::proton::library_dirs().iter().any(|l| {
        l.join("steamapps/common/SteamLinuxRuntime_sniper/_v2-entry-point").exists()
    });
    SystemInfo {
        os: std::env::consts::OS.to_string(),
        home: home().to_string_lossy().to_string(),
        data_dir: crate::store::data_dir(&app)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default(),
        is_app_image: std::env::var_os("APPIMAGE").is_some(),
        umu: which("umu-run").map(|p| p.to_string_lossy().to_string()),
        mangohud: which("mangohud").is_some(),
        gamemode: which("gamemoderun").is_some(),
        gamescope: which("gamescope").is_some(),
        winetricks: which("winetricks").is_some(),
        steam_root: crate::proton::steam_root().map(|p| p.to_string_lossy().to_string()),
        steam_runtime: runtime,
        desktop_entries: cfg!(target_os = "linux"),
    }
}

/// Nur für die Update-Prüfung: holt JSON von der GitHub-API (über curl, ohne CORS-Probleme).
#[tauri::command]
pub fn http_get(url: String) -> Result<String, String> {
    if !url.starts_with("https://api.github.com/repos/elkarbeenus/") {
        return Err("Diese Adresse ist nicht erlaubt.".into());
    }
    let mut c = Command::new("curl");
    c.args([
        "-fsSL",
        "--max-time",
        "15",
        "-H",
        "Accept: application/vnd.github+json",
        "-H",
        "User-Agent: LakuenLauncher",
        url.as_str(),
    ]);
    sanitize_env(&mut c);
    let out = c.output().map_err(|e| format!("curl nicht verfügbar: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "Abruf fehlgeschlagen: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

#[tauri::command]
pub fn notify(app: AppHandle, title: String, body: String) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| e.to_string())
}

#[cfg(target_os = "linux")]
fn desktop_dir() -> PathBuf {
    let mut c = Command::new("xdg-user-dir");
    c.arg("DESKTOP");
    sanitize_env(&mut c);
    if let Ok(out) = c.output() {
        let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !s.is_empty() && Path::new(&s).is_dir() {
            return PathBuf::from(s);
        }
    }
    let h = home();
    for name in ["Desktop", "Schreibtisch"] {
        if h.join(name).is_dir() {
            return h.join(name);
        }
    }
    h.join("Desktop")
}

fn escape_desktop(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"").replace('`', "\\`").replace('$', "\\$")
}

/// Legt eine .desktop-Verknüpfung an, die das Spiel über den Launcher startet
/// (damit zählt auch dort die Spielzeit). Kann in Steam als Nicht-Steam-Spiel
/// hinzugefügt werden.
#[tauri::command]
pub fn create_desktop_entry(
    game_id: String,
    name: String,
    icon: Option<String>,
    on_desktop: bool,
) -> Result<String, String> {
    #[cfg(target_os = "linux")]
    {
        use std::os::unix::fs::PermissionsExt;
        let id = crate::store::safe_id(&game_id);
        let exe = std::env::var("APPIMAGE")
            .map(PathBuf::from)
            .or_else(|_| std::env::current_exe())
            .map_err(|e| e.to_string())?;
        let icon = icon.filter(|i| !i.is_empty()).unwrap_or_else(|| "applications-games".into());
        let clean_name = name.replace(['\n', '\r'], " ");
        let content = format!(
            "[Desktop Entry]\nType=Application\nVersion=1.0\nName={clean_name}\nComment=Gestartet über LakuenLauncher\nExec=\"{}\" --launch {id}\nIcon={icon}\nTerminal=false\nCategories=Game;\nStartupNotify=true\n",
            escape_desktop(&exe.to_string_lossy())
        );
        let apps = home().join(".local/share/applications");
        std::fs::create_dir_all(&apps).map_err(|e| e.to_string())?;
        let file = apps.join(format!("lakuenlauncher-{id}.desktop"));
        std::fs::write(&file, &content).map_err(|e| e.to_string())?;
        let _ = std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o755));
        if on_desktop {
            let d = desktop_dir();
            let _ = std::fs::create_dir_all(&d);
            let df = d.join(format!("lakuenlauncher-{id}.desktop"));
            std::fs::write(&df, &content).map_err(|e| e.to_string())?;
            let _ = std::fs::set_permissions(&df, std::fs::Permissions::from_mode(0o755));
        }
        Ok(file.to_string_lossy().to_string())
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (game_id, name, icon, on_desktop);
        Err("Verknüpfungen werden auf diesem System noch nicht unterstützt.".into())
    }
}

#[tauri::command]
pub fn remove_desktop_entry(game_id: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let id = crate::store::safe_id(&game_id);
        let name = format!("lakuenlauncher-{id}.desktop");
        let _ = std::fs::remove_file(home().join(".local/share/applications").join(&name));
        let _ = std::fs::remove_file(desktop_dir().join(&name));
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = game_id;
    }
    Ok(())
}
