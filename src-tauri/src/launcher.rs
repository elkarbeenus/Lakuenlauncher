//! Starten und Beenden von Spielen sowie Messen der Spielzeit.
//!
//! Gezählt wird nur, was über den Launcher gestartet wurde: Der Prozess wird in einer
//! eigenen Prozessgruppe gestartet und so lange beobachtet, bis kein Prozess dieser
//! Gruppe mehr läuft (wichtig für Proton, das Unterprozesse startet).

use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;

use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter, State};

use crate::storage::{now_ms, safe_name};
use crate::{platform, proton, storage, AppState};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunningGame {
    pub id: String,
    pub pid: u32,
    pub started: u64,
}

#[derive(Deserialize, Clone, Default)]
#[serde(default)]
pub struct EnvVar {
    pub key: String,
    pub value: String,
}

/// Alles, was zum Start eines Spiels nötig ist (kommt aus der Oberfläche).
#[derive(Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct LaunchRequest {
    pub id: String,
    pub name: String,
    pub path: String,
    /// "appimage" | "exe" | "native"
    pub kind: String,
    pub args: String,
    pub env: Vec<EnvVar>,
    pub working_dir: Option<String>,
    /// Name der Proton-Version, "default" oder leer = Einstellung verwenden
    pub proton: Option<String>,
    pub prefix: Option<String>,
    pub mangohud: bool,
    pub gamemode: bool,
    pub fsr: bool,
    pub pre_launch: String,
    pub post_exit: String,
    pub use_umu: bool,
    /// Standard aus den Einstellungen: "auto-experimental" | "auto-latest" | Name
    pub default_proton: String,
}

struct Plan {
    program: String,
    args: Vec<String>,
    env: Vec<(String, String)>,
    cwd: PathBuf,
    info: Vec<String>,
}

/// Zerlegt Startoptionen wie eine Shell (Anführungszeichen, Backslash).
pub fn split_args(input: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut in_single = false;
    let mut in_double = false;
    let mut has = false;
    let mut chars = input.chars();
    while let Some(c) = chars.next() {
        match c {
            '\'' if !in_double => {
                in_single = !in_single;
                has = true;
            }
            '"' if !in_single => {
                in_double = !in_double;
                has = true;
            }
            '\\' if !in_single => {
                if let Some(n) = chars.next() {
                    cur.push(n);
                    has = true;
                }
            }
            c if c.is_whitespace() && !in_single && !in_double => {
                if has {
                    out.push(std::mem::take(&mut cur));
                    has = false;
                }
            }
            c => {
                cur.push(c);
                has = true;
            }
        }
    }
    if has {
        out.push(cur);
    }
    out
}

fn prefix_dir(req: &LaunchRequest, data_dir: &Path) -> PathBuf {
    match req.prefix.as_deref().map(str::trim) {
        Some(p) if !p.is_empty() => PathBuf::from(p),
        _ => data_dir.join("prefixes").join(safe_name(&req.id)),
    }
}

fn proton_choice(req: &LaunchRequest) -> String {
    match req.proton.as_deref() {
        Some(p) if !p.is_empty() && p != "default" => p.to_string(),
        _ => req.default_proton.clone(),
    }
}

#[cfg(not(windows))]
fn resolve_proton(req: &LaunchRequest) -> Result<proton::ProtonVersion, String> {
    let versions = proton::detect();
    proton::resolve(&proton_choice(req), &versions).ok_or_else(|| {
        "Keine Proton-Version gefunden. Installiere in Steam z. B. „Proton Experimental“ \
         (Bibliothek → Tools) und versuche es erneut."
            .to_string()
    })
}

#[cfg(not(windows))]
fn plan_exe(
    req: &LaunchRequest,
    data_dir: &Path,
    env: &mut Vec<(String, String)>,
    info: &mut Vec<String>,
) -> Result<(String, Vec<String>), String> {
    let pv = resolve_proton(req)?;
    let prefix = prefix_dir(req, data_dir);
    fs::create_dir_all(&prefix).map_err(|e| format!("Prefix-Ordner nicht anlegbar: {e}"))?;
    info.push(format!("Proton: {} ({})", pv.name, pv.path));
    info.push(format!("Prefix: {}", prefix.display()));

    if req.use_umu {
        if let Some(umu) = proton::which("umu-run") {
            env.push(("WINEPREFIX".into(), prefix.join("pfx").to_string_lossy().to_string()));
            env.push(("PROTONPATH".into(), pv.path.clone()));
            env.push(("GAMEID".into(), "umu-default".into()));
            info.push("Start über umu-launcher".into());
            return Ok((umu.to_string_lossy().to_string(), vec![req.path.clone()]));
        }
        info.push("umu-launcher nicht gefunden – starte direkt über Proton".into());
    }

    let steam = proton::steam_root().unwrap_or_else(|| proton::home().join(".steam/steam"));
    env.push(("STEAM_COMPAT_DATA_PATH".into(), prefix.to_string_lossy().to_string()));
    env.push((
        "STEAM_COMPAT_CLIENT_INSTALL_PATH".into(),
        steam.to_string_lossy().to_string(),
    ));
    let script = Path::new(&pv.path).join("proton");
    platform::ensure_executable(&script);
    Ok((
        script.to_string_lossy().to_string(),
        vec!["waitforexitandrun".into(), req.path.clone()],
    ))
}

#[cfg(windows)]
fn plan_exe(
    req: &LaunchRequest,
    _data_dir: &Path,
    _env: &mut Vec<(String, String)>,
    info: &mut Vec<String>,
) -> Result<(String, Vec<String>), String> {
    info.push("Start nativ unter Windows".into());
    Ok((req.path.clone(), vec![]))
}

fn plan_launch(req: &LaunchRequest, data_dir: &Path) -> Result<Plan, String> {
    let game = PathBuf::from(&req.path);
    let cwd = match req.working_dir.as_deref().map(str::trim) {
        Some(d) if !d.is_empty() => PathBuf::from(d),
        _ => game
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(proton::home),
    };

    // Steam-Syntax: "VAR=1 wrapper %command% -arg"
    let tokens = split_args(&req.args);
    let (pre, user_args) = match tokens.iter().position(|t| t == "%command%") {
        Some(pos) => (tokens[..pos].to_vec(), tokens[pos + 1..].to_vec()),
        None => (Vec::new(), tokens),
    };
    let mut env: Vec<(String, String)> = Vec::new();
    let mut wrappers: Vec<String> = Vec::new();
    for t in pre {
        if let Some((k, v)) = t.split_once('=') {
            if !k.is_empty() && k.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
                env.push((k.to_string(), v.to_string()));
                continue;
            }
        }
        wrappers.push(t);
    }

    let mut info = Vec::new();
    let (program, mut args) = if req.kind == "exe" {
        plan_exe(req, data_dir, &mut env, &mut info)?
    } else {
        platform::ensure_executable(&game);
        (req.path.clone(), Vec::new())
    };
    args.extend(user_args);

    if req.fsr {
        env.push(("WINE_FULLSCREEN_FSR".into(), "1".into()));
    }
    if req.mangohud {
        if proton::which("mangohud").is_some() {
            wrappers.insert(0, "mangohud".into());
        } else {
            env.push(("MANGOHUD".into(), "1".into()));
        }
    }
    if req.gamemode && proton::which("gamemoderun").is_some() {
        wrappers.insert(0, "gamemoderun".into());
    }
    for e in &req.env {
        let key = e.key.trim();
        if !key.is_empty() {
            env.push((key.to_string(), e.value.clone()));
        }
    }

    let (program, args) = if wrappers.is_empty() {
        (program, args)
    } else {
        let mut all = wrappers;
        all.push(program);
        all.extend(args);
        let first = all.remove(0);
        (first, all)
    };

    Ok(Plan { program, args, env, cwd, info })
}

fn run_hook(label: &str, script: &str, cwd: &Path, log: &mut File) {
    let _ = writeln!(log, "--- {label}: {script}");
    #[cfg(not(windows))]
    let mut cmd = {
        let mut c = Command::new("sh");
        c.arg("-c").arg(script);
        c
    };
    #[cfg(windows)]
    let mut cmd = {
        let mut c = Command::new("cmd");
        c.arg("/C").arg(script);
        c
    };
    if cwd.is_dir() {
        cmd.current_dir(cwd);
    }
    platform::sanitize_env(&mut cmd);
    match cmd.output() {
        Ok(out) => {
            let _ = log.write_all(&out.stdout);
            let _ = log.write_all(&out.stderr);
            let _ = writeln!(log, "--- {label} beendet ({:?})", out.status.code());
        }
        Err(e) => {
            let _ = writeln!(log, "--- {label} fehlgeschlagen: {e}");
        }
    }
}

#[tauri::command]
pub fn launch_game(
    app: AppHandle,
    state: State<'_, AppState>,
    req: LaunchRequest,
) -> Result<u64, String> {
    if state
        .running
        .lock()
        .map_err(|e| e.to_string())?
        .contains_key(&req.id)
    {
        return Err("Das Spiel läuft bereits.".into());
    }
    if !Path::new(&req.path).exists() {
        return Err(format!(
            "Datei nicht gefunden: {}. Wurde sie verschoben? Pfad unter „Bearbeiten“ anpassen.",
            req.path
        ));
    }

    let log_path = state
        .data_dir
        .join("logs")
        .join(format!("{}.log", safe_name(&req.id)));
    let mut log = File::create(&log_path).map_err(|e| format!("Log nicht anlegbar: {e}"))?;
    let plan = plan_launch(&req, &state.data_dir)?;

    let _ = writeln!(log, "=== LakuenLauncher {} – {} ===", env!("CARGO_PKG_VERSION"), req.name);
    for line in &plan.info {
        let _ = writeln!(log, "{line}");
    }
    let _ = writeln!(log, "Befehl: {} {}", plan.program, plan.args.join(" "));
    let _ = writeln!(log, "Arbeitsordner: {}", plan.cwd.display());
    for (k, v) in &plan.env {
        let _ = writeln!(log, "Umgebung: {k}={v}");
    }
    let _ = writeln!(log);

    if !req.pre_launch.trim().is_empty() {
        run_hook("Skript vor dem Start", &req.pre_launch, &plan.cwd, &mut log);
    }

    let mut cmd = Command::new(&plan.program);
    cmd.args(&plan.args).stdin(Stdio::null());
    if plan.cwd.is_dir() {
        cmd.current_dir(&plan.cwd);
    }
    platform::sanitize_env(&mut cmd);
    for (k, v) in &plan.env {
        cmd.env(k, v);
    }
    let out = log.try_clone().map_err(|e| e.to_string())?;
    let err = log.try_clone().map_err(|e| e.to_string())?;
    cmd.stdout(Stdio::from(out)).stderr(Stdio::from(err));
    platform::detach_group(&mut cmd);

    let child = cmd.spawn().map_err(|e| {
        let _ = writeln!(log, "Start fehlgeschlagen: {e}");
        format!("Start fehlgeschlagen: {e}")
    })?;
    let pid = child.id();
    let started = now_ms();

    state
        .running
        .lock()
        .map_err(|e| e.to_string())?
        .insert(req.id.clone(), RunningGame { id: req.id.clone(), pid, started });
    let _ = app.emit("game-started", json!({ "id": req.id, "started": started }));

    let running = state.running.clone();
    let lock = state.sessions_lock.clone();
    let data_dir = state.data_dir.clone();
    let cwd = plan.cwd;
    thread::spawn(move || {
        monitor(app, child, req, pid, started, running, lock, data_dir, log, cwd);
    });
    Ok(started)
}

#[allow(clippy::too_many_arguments)]
fn monitor(
    app: AppHandle,
    mut child: Child,
    req: LaunchRequest,
    pid: u32,
    started: u64,
    running: Arc<Mutex<HashMap<String, RunningGame>>>,
    lock: Arc<Mutex<()>>,
    data_dir: PathBuf,
    mut log: File,
    cwd: PathBuf,
) {
    let code = child.wait().ok().and_then(|s| s.code());
    // Restliche Prozesse der Gruppe abwarten (Proton/Wine, Launcher, die sich abspalten)
    platform::wait_for_group(pid);
    let ended = now_ms();
    if let Ok(mut r) = running.lock() {
        r.remove(&req.id);
    }
    let seconds = ended.saturating_sub(started) / 1000;
    let _ = writeln!(log, "\n=== Beendet nach {seconds} s, Exit-Code: {code:?} ===");

    // Sehr kurze Starts (Fehlstarts) zählen nicht als Spielzeit
    if seconds >= 3 {
        let session = json!({
            "gameId": req.id,
            "start": started,
            "end": ended,
            "seconds": seconds,
        });
        if let Err(e) = storage::append_session(&data_dir, &lock, session) {
            let _ = writeln!(log, "Spielzeit konnte nicht gespeichert werden: {e}");
        }
    }
    if !req.post_exit.trim().is_empty() {
        run_hook("Skript nach dem Beenden", &req.post_exit, &cwd, &mut log);
    }
    let _ = app.emit(
        "game-exited",
        json!({
            "id": req.id,
            "started": started,
            "ended": ended,
            "seconds": seconds,
            "exitCode": code,
        }),
    );
}

#[tauri::command]
pub fn stop_game(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let pid = state
        .running
        .lock()
        .map_err(|e| e.to_string())?
        .get(&id)
        .map(|g| g.pid)
        .ok_or_else(|| "Das Spiel läuft nicht.".to_string())?;
    platform::terminate_group(pid);
    Ok(())
}

#[tauri::command]
pub fn running_games(state: State<'_, AppState>) -> Vec<RunningGame> {
    state
        .running
        .lock()
        .map(|r| r.values().cloned().collect())
        .unwrap_or_default()
}

/// Liefert das Startprotokoll (die letzten 256 KB).
#[tauri::command]
pub fn read_log(state: State<'_, AppState>, id: String) -> Result<String, String> {
    let path = state.data_dir.join("logs").join(format!("{}.log", safe_name(&id)));
    let mut file = match File::open(&path) {
        Ok(f) => f,
        Err(_) => return Ok(String::new()),
    };
    let len = file.metadata().map(|m| m.len()).unwrap_or(0);
    let limit: u64 = 256 * 1024;
    if len > limit {
        let _ = file.seek(SeekFrom::Start(len - limit));
    }
    let mut buf = Vec::new();
    file.read_to_end(&mut buf).map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&buf).to_string())
}

#[tauri::command]
pub fn take_pending_launch(state: State<'_, AppState>) -> Option<String> {
    state.pending_launch.lock().ok().and_then(|mut p| p.take())
}

/// Startet winecfg oder winetricks für den Prefix eines Spiels.
#[cfg(not(windows))]
#[tauri::command]
pub fn run_prefix_tool(
    state: State<'_, AppState>,
    req: LaunchRequest,
    tool: String,
) -> Result<(), String> {
    let pv = resolve_proton(&req)?;
    let prefix = prefix_dir(&req, &state.data_dir);
    fs::create_dir_all(&prefix).map_err(|e| e.to_string())?;
    let pfx = prefix.join("pfx");
    let umu = if req.use_umu { proton::which("umu-run") } else { None };

    let mut cmd = match (tool.as_str(), umu) {
        ("winecfg", Some(umu)) | ("winetricks", Some(umu)) => {
            let mut c = Command::new(umu);
            c.arg(&tool);
            c.env("WINEPREFIX", &pfx)
                .env("PROTONPATH", &pv.path)
                .env("GAMEID", "umu-default");
            c
        }
        ("winecfg", None) => {
            let mut c = Command::new(Path::new(&pv.path).join("proton"));
            c.args(["run", "winecfg"]);
            c.env("STEAM_COMPAT_DATA_PATH", &prefix).env(
                "STEAM_COMPAT_CLIENT_INSTALL_PATH",
                proton::steam_root().unwrap_or_else(|| proton::home().join(".steam/steam")),
            );
            c
        }
        ("winetricks", None) => {
            let wt = proton::which("winetricks").ok_or_else(|| {
                "winetricks wurde nicht gefunden. Installiere umu-launcher oder winetricks.".to_string()
            })?;
            let base = Path::new(&pv.path);
            let bin = if base.join("files/bin/wine").is_file() {
                base.join("files/bin")
            } else {
                base.join("dist/bin")
            };
            fs::create_dir_all(&pfx).map_err(|e| e.to_string())?;
            let mut c = Command::new(wt);
            c.env("WINEPREFIX", &pfx)
                .env("WINE", bin.join("wine"))
                .env("WINESERVER", bin.join("wineserver"));
            c
        }
        _ => return Err(format!("Unbekanntes Werkzeug: {tool}")),
    };
    platform::sanitize_env(&mut cmd);
    cmd.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    let mut child = cmd.spawn().map_err(|e| format!("Start fehlgeschlagen: {e}"))?;
    thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

#[cfg(windows)]
#[tauri::command]
pub fn run_prefix_tool(
    _state: State<'_, AppState>,
    _req: LaunchRequest,
    _tool: String,
) -> Result<(), String> {
    Err("Unter Windows werden keine Wine-Prefixe benötigt.".into())
}
