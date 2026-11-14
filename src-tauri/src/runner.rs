//! Startet Spiele (AppImage, native Programme, .exe über Proton/umu) und
//! misst die Spielzeit – nur für Starts über den Launcher.

use crate::{platform, proton, store, AppState};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunningGame {
    pub game_id: String,
    pub pid: u32,
    pub started: u64,
}

#[derive(Deserialize, Clone, Default, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct LaunchRequest {
    pub game_id: String,
    pub name: String,
    pub path: String,
    /// "appimage" | "exe" | "native"
    pub kind: String,
    pub args: String,
    pub workdir: Option<String>,
    pub env: HashMap<String, String>,
    /// "auto" | "umu" | "slr" | "proton"
    pub runner: String,
    pub proton_path: Option<String>,
    pub prefix_path: Option<String>,
    pub mangohud: bool,
    pub gamemode: bool,
    pub fsr: bool,
    /// Frame Generation über lsfg-vk: 0 = aus, 2 = x2, 3 = x3, 4 = x4
    pub framegen: u32,
    pub framegen_perf: bool,
    pub wrapper: Option<String>,
    pub pre_script: Option<String>,
    pub post_script: Option<String>,
    pub minimize_on_launch: bool,
    pub restore_on_exit: bool,
}

struct Plan {
    program: String,
    args: Vec<String>,
    env: Vec<(String, String)>,
    workdir: PathBuf,
    runner: String,
    notes: Vec<String>,
}

/// Teilt Startargumente wie eine Shell (Anführungszeichen werden beachtet).
pub fn split_args(s: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut has = false;
    let (mut in_s, mut in_d) = (false, false);
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '\'' if !in_d => {
                in_s = !in_s;
                has = true;
            }
            '"' if !in_s => {
                in_d = !in_d;
                has = true;
            }
            '\\' if !in_s => match chars.peek() {
                Some(n) if n.is_whitespace() || *n == '"' || *n == '\'' || *n == '\\' => {
                    cur.push(*n);
                    chars.next();
                    has = true;
                }
                _ => {
                    cur.push('\\');
                    has = true;
                }
            },
            c if c.is_whitespace() && !in_s && !in_d => {
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

fn s(p: &Path) -> String {
    p.to_string_lossy().to_string()
}

fn prefix_root(app: &AppHandle, game_id: &str, custom: &Option<String>) -> Result<PathBuf, String> {
    match custom.as_ref().map(|c| c.trim()).filter(|c| !c.is_empty()) {
        Some(c) => Ok(PathBuf::from(c)),
        None => Ok(store::sub_dir(app, "prefixes")?.join(store::safe_id(game_id))),
    }
}

/// Der eigentliche Wine-Prefix (Ordner mit drive_c).
fn wine_prefix(root: &Path) -> PathBuf {
    let pfx = root.join("pfx");
    if pfx.join("drive_c").exists() {
        pfx
    } else {
        root.to_path_buf()
    }
}

fn steam_client_path(app: &AppHandle) -> PathBuf {
    proton::steam_root().unwrap_or_else(|| {
        // Proton erwartet den Pfad, auch wenn Steam fehlt.
        let p = store::data_dir(app)
            .map(|d| d.join("steam-platzhalter"))
            .unwrap_or_else(|_| PathBuf::from("/tmp/lakuen-steam"));
        let _ = fs::create_dir_all(&p);
        p
    })
}

fn build_plan(app: &AppHandle, req: &LaunchRequest, is_tool: bool) -> Result<Plan, String> {
    let target = PathBuf::from(&req.path);
    if !is_tool && !target.exists() {
        return Err(format!("Datei nicht gefunden: {}", req.path));
    }
    let workdir = req
        .workdir
        .as_ref()
        .map(|w| w.trim().to_string())
        .filter(|w| !w.is_empty())
        .map(PathBuf::from)
        .or_else(|| {
            if is_tool {
                None
            } else {
                target.parent().map(|p| p.to_path_buf())
            }
        })
        .filter(|p| p.is_dir())
        .unwrap_or_else(platform::home);

    let user_args = split_args(&req.args);
    let mut env: Vec<(String, String)> = Vec::new();
    let mut notes: Vec<String> = Vec::new();
    let mut program = String::new();
    let mut args: Vec<String> = Vec::new();
    let mut runner = if req.runner.is_empty() { "auto".to_string() } else { req.runner.clone() };

    let use_wine = req.kind == "exe" && cfg!(target_os = "linux");
    if !use_wine {
        platform::ensure_executable(&target);
        program = req.path.clone();
        args = user_args;
        runner = "native".into();
    } else {
        let root = prefix_root(app, &req.game_id, &req.prefix_path)?;
        fs::create_dir_all(&root).map_err(|e| format!("Prefix-Ordner: {e}"))?;
        let proton_dir: Option<PathBuf> = req
            .proton_path
            .as_ref()
            .filter(|p| !p.trim().is_empty())
            .map(PathBuf::from)
            .filter(|p| p.join("proton").is_file())
            .or_else(|| proton::newest().map(|p| PathBuf::from(p.path)));
        let umu = platform::which("umu-run");

        if runner == "auto" {
            runner = if umu.is_some() {
                "umu".into()
            } else if proton_dir.as_ref().and_then(|p| proton::runtime_for(p)).is_some() {
                "slr".into()
            } else {
                "proton".into()
            };
        }

        let chosen = runner.clone();
        match chosen.as_str() {
            "umu" => {
                let umu = umu.ok_or("umu-run wurde nicht gefunden. Installiere umu-launcher oder wähle in den Einstellungen \"Proton direkt\".")?;
                program = s(&umu);
                args.push(req.path.clone());
                args.extend(user_args);
                env.push(("WINEPREFIX".into(), s(&root)));
                let gid = req.env.get("GAMEID").cloned().unwrap_or_else(|| "umu-default".into());
                env.push(("GAMEID".into(), gid));
                env.push(("STORE".into(), "none".into()));
                env.push(("PROTON_VERB".into(), "waitforexitandrun".into()));
                if let Some(p) = &proton_dir {
                    env.push(("PROTONPATH".into(), s(p)));
                }
            }
            "slr" | "proton" => {
                let pdir = proton_dir.ok_or(
                    "Keine Proton-Version gefunden. Installiere Proton über Steam (z. B. \"Proton Experimental\") oder GE-Proton mit ProtonUp-Qt.",
                )?;
                let script = pdir.join("proton");
                env.push(("STEAM_COMPAT_DATA_PATH".into(), s(&root)));
                env.push(("STEAM_COMPAT_CLIENT_INSTALL_PATH".into(), s(&steam_client_path(app))));
                env.push(("STEAM_COMPAT_INSTALL_PATH".into(), s(&workdir)));
                env.push(("SteamAppId".into(), "0".into()));
                env.push(("SteamGameId".into(), "0".into()));
                let mut inner = vec![s(&script), "waitforexitandrun".into(), req.path.clone()];
                inner.extend(user_args);
                let rt = if runner == "slr" { proton::runtime_for(&pdir) } else { None };
                if let Some(rt) = rt {
                    program = s(&rt.join("_v2-entry-point"));
                    args = vec!["--verb=waitforexitandrun".into(), "--".into()];
                    args.extend(inner);
                    env.push(("STEAM_COMPAT_TOOL_PATHS".into(), format!("{}:{}", s(&pdir), s(&rt))));
                } else {
                    if runner == "slr" {
                        notes.push("Steam Linux Runtime nicht gefunden – starte Proton direkt.".into());
                    }
                    runner = "proton".into();
                    program = inner.remove(0);
                    args = inner;
                }
            }
            other => return Err(format!("Unbekannte Startmethode: {other}")),
        }
    }

    if req.fsr {
        env.push(("WINE_FULLSCREEN_FSR".into(), "1".into()));
    }
    if req.framegen >= 2 {
        // lsfg-vk (Lossless Scaling Frame Generation für Linux) per Umgebungsvariablen
        let mult = req.framegen.min(4).to_string();
        env.push(("LSFG_LEGACY".into(), "1".into()));
        env.push(("ENABLE_LSFG".into(), "1".into()));
        env.push(("LSFG_MULTIPLIER".into(), mult));
        if req.framegen_perf {
            env.push(("LSFG_PERF_MODE".into(), "1".into()));
        }
        notes.push(format!(
            "Frame Generation x{} über lsfg-vk aktiv (benötigt lsfg-vk und Lossless Scaling aus Steam).",
            req.framegen.min(4)
        ));
    }

    let mut wrap: Vec<String> = Vec::new();
    if let Some(w) = req.wrapper.as_ref().filter(|w| !w.trim().is_empty()) {
        wrap.extend(split_args(w));
    }
    if req.gamemode {
        match platform::which("gamemoderun") {
            Some(g) => wrap.push(s(&g)),
            None => notes.push("GameMode (gamemoderun) ist nicht installiert – übersprungen.".into()),
        }
    }
    if req.mangohud {
        match platform::which("mangohud") {
            Some(m) => wrap.push(s(&m)),
            None => notes.push("MangoHud ist nicht installiert – übersprungen.".into()),
        }
    }
    if !wrap.is_empty() {
        let first = wrap.remove(0);
        let mut new_args = wrap;
        new_args.push(program);
        new_args.extend(args);
        program = first;
        args = new_args;
    }

    for (k, v) in &req.env {
        if k.trim().is_empty() {
            continue;
        }
        if runner == "umu" && k == "GAMEID" {
            continue;
        }
        env.push((k.trim().to_string(), v.clone()));
    }

    Ok(Plan { program, args, env, workdir, runner, notes })
}

fn write_header(log: &mut File, req: &LaunchRequest, plan: &Plan) {
    let _ = writeln!(log, "=== LakuenLauncher – Startprotokoll ===");
    let _ = writeln!(log, "Spiel:        {}", req.name);
    let _ = writeln!(log, "Datei:        {}", req.path);
    let _ = writeln!(log, "Startmethode: {}", plan.runner);
    let _ = writeln!(log, "Ordner:       {}", plan.workdir.display());
    let _ = writeln!(log, "Befehl:       {} {}", plan.program, plan.args.join(" "));
    for (k, v) in &plan.env {
        let _ = writeln!(log, "Variable:     {k}={v}");
    }
    for n in &plan.notes {
        let _ = writeln!(log, "Hinweis:      {n}");
    }
    let _ = writeln!(log, "=======================================\n");
}

#[cfg(target_os = "linux")]
fn wait_for_group(pgid: u32) {
    // Proton/Wine starten Unterprozesse – erst wenn keiner mehr läuft, ist das Spiel zu.
    loop {
        let alive = platform::group_members(pgid)
            .into_iter()
            .any(|(_, name)| name != "wineserver");
        if !alive {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(1500));
    }
}

fn run_game(app: &AppHandle, req: &LaunchRequest) -> Result<(), String> {
    let state = app.state::<AppState>();
    let logs = store::sub_dir(app, "logs")?;
    let log_path = logs.join(format!("{}.log", store::safe_id(&req.game_id)));
    let mut log = File::create(&log_path).map_err(|e| e.to_string())?;

    let plan = build_plan(app, req, false)?;
    write_header(&mut log, req, &plan);

    if let Some(pre) = req.pre_script.as_ref().filter(|p| !p.trim().is_empty()) {
        let _ = writeln!(log, "[Vorher-Skript] {pre}");
        let st = platform::shell(pre).current_dir(&plan.workdir).status();
        let _ = writeln!(log, "[Vorher-Skript] beendet: {st:?}\n");
    }

    let out = log.try_clone().map_err(|e| e.to_string())?;
    let err = log.try_clone().map_err(|e| e.to_string())?;
    let mut cmd = Command::new(&plan.program);
    platform::sanitize_env(&mut cmd);
    cmd.args(&plan.args)
        .current_dir(&plan.workdir)
        .stdin(Stdio::null())
        .stdout(Stdio::from(out))
        .stderr(Stdio::from(err));
    for (k, v) in &plan.env {
        cmd.env(k, v);
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    let mut child = cmd.spawn().map_err(|e| format!("Start fehlgeschlagen: {e}"))?;
    let pid = child.id();
    let started = store::now_ms();
    if let Ok(mut r) = state.running.lock() {
        r.insert(
            req.game_id.clone(),
            RunningGame { game_id: req.game_id.clone(), pid, started },
        );
    }
    let _ = app.emit(
        "game-started",
        json!({ "gameId": req.game_id, "pid": pid, "started": started, "runner": plan.runner, "notes": plan.notes }),
    );
    if req.minimize_on_launch {
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.minimize();
        }
    }

    let status = child.wait();
    #[cfg(target_os = "linux")]
    wait_for_group(pid);
    let ended = store::now_ms();
    if let Ok(mut r) = state.running.lock() {
        r.remove(&req.game_id);
    }
    let secs = ended.saturating_sub(started) / 1000;
    let code = status.as_ref().ok().and_then(|s| s.code());
    let _ = writeln!(log, "\n[LakuenLauncher] Beendet nach {secs} s, Exit-Code: {code:?}");

    if secs >= 3 {
        if let Err(e) = store::append_session(
            app,
            json!({ "gameId": req.game_id, "start": started, "end": ended, "secs": secs }),
        ) {
            let _ = writeln!(log, "[LakuenLauncher] Spielzeit konnte nicht gespeichert werden: {e}");
        }
    }

    if let Some(post) = req.post_script.as_ref().filter(|p| !p.trim().is_empty()) {
        let _ = writeln!(log, "[Nachher-Skript] {post}");
        let _ = platform::shell(post).current_dir(&plan.workdir).status();
    }

    let _ = app.emit(
        "game-exited",
        json!({ "gameId": req.game_id, "secs": secs, "code": code, "start": started, "end": ended }),
    );
    if req.restore_on_exit {
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.unminimize();
            let _ = w.set_focus();
        }
    }
    Ok(())
}

#[tauri::command]
pub fn launch_game(app: AppHandle, state: State<'_, AppState>, req: LaunchRequest) -> Result<(), String> {
    {
        let mut r = state.running.lock().map_err(|e| e.to_string())?;
        if r.contains_key(&req.game_id) {
            return Err("Das Spiel läuft bereits.".into());
        }
        // Platzhalter, damit Doppelklicks nicht doppelt starten
        r.insert(
            req.game_id.clone(),
            RunningGame { game_id: req.game_id.clone(), pid: 0, started: store::now_ms() },
        );
    }
    let app2 = app.clone();
    std::thread::spawn(move || {
        if let Err(e) = run_game(&app2, &req) {
            let st = app2.state::<AppState>();
            if let Ok(mut r) = st.running.lock() {
                r.remove(&req.game_id);
            }
            let _ = app2.emit("game-error", json!({ "gameId": req.game_id, "error": e }));
        }
    });
    Ok(())
}

#[tauri::command]
pub fn stop_game(state: State<'_, AppState>, game_id: String) -> Result<(), String> {
    let pid = state
        .running
        .lock()
        .map_err(|e| e.to_string())?
        .get(&game_id)
        .map(|r| r.pid)
        .ok_or("Das Spiel läuft nicht.")?;
    if pid == 0 {
        return Err("Das Spiel startet gerade noch.".into());
    }
    platform::kill_tree(pid);
    Ok(())
}

#[tauri::command]
pub fn list_running(state: State<'_, AppState>) -> Vec<RunningGame> {
    state
        .running
        .lock()
        .map(|r| r.values().cloned().collect())
        .unwrap_or_default()
}

/// winecfg, winetricks, regedit, Explorer … im Prefix des Spiels.
#[tauri::command]
pub fn run_prefix_tool(app: AppHandle, req: LaunchRequest, tool: String) -> Result<(), String> {
    if !cfg!(target_os = "linux") {
        return Err("Prefix-Werkzeuge gibt es nur unter Linux.".into());
    }
    let allowed = ["winecfg", "winetricks", "regedit", "explorer", "control", "taskmgr", "cmd"];
    if !allowed.contains(&tool.as_str()) {
        return Err("Unbekanntes Werkzeug".into());
    }
    let mut base = req.clone();
    base.mangohud = false;
    base.gamemode = false;
    base.fsr = false;
    base.framegen = 0;
    base.wrapper = None;
    base.args = String::new();
    base.kind = "exe".into();
    base.workdir = None;

    let logs = store::sub_dir(&app, "logs")?;
    let log = File::create(logs.join(format!("{}-tool.log", store::safe_id(&req.game_id))))
        .map_err(|e| e.to_string())?;

    let mut cmd;
    if tool == "winetricks" {
        let root = prefix_root(&app, &req.game_id, &req.prefix_path)?;
        fs::create_dir_all(&root).map_err(|e| e.to_string())?;
        if let Some(umu) = platform::which("umu-run").filter(|_| req.runner != "proton" && req.runner != "slr") {
            cmd = Command::new(umu);
            platform::sanitize_env(&mut cmd);
            cmd.arg("winetricks").arg("--gui");
            cmd.env("WINEPREFIX", &root).env("GAMEID", "umu-default");
            if let Some(p) = req.proton_path.as_ref().filter(|p| !p.is_empty()) {
                cmd.env("PROTONPATH", p);
            }
        } else {
            let wt = platform::which("winetricks").ok_or(
                "winetricks ist nicht installiert. Tipp: umu-launcher installieren oder protontricks (Flatpak) nutzen.",
            )?;
            let pdir = req
                .proton_path
                .as_ref()
                .filter(|p| !p.is_empty())
                .map(PathBuf::from)
                .or_else(|| proton::newest().map(|p| PathBuf::from(p.path)))
                .ok_or("Keine Proton-Version gefunden.")?;
            let bin = ["files/bin", "dist/bin"]
                .iter()
                .map(|b| pdir.join(b))
                .find(|b| b.join("wine").exists())
                .ok_or("In dieser Proton-Version wurde kein wine gefunden.")?;
            let pfx = wine_prefix(&root);
            if !pfx.join("drive_c").exists() {
                return Err("Der Prefix existiert noch nicht. Starte das Spiel (oder winecfg) einmal, damit er angelegt wird.".into());
            }
            cmd = Command::new(wt);
            platform::sanitize_env(&mut cmd);
            cmd.arg("--gui")
                .env("WINEPREFIX", &pfx)
                .env("WINE", bin.join("wine"))
                .env("WINESERVER", bin.join("wineserver"));
        }
    } else {
        base.path = tool.clone();
        let plan = build_plan(&app, &base, true)?;
        cmd = Command::new(&plan.program);
        platform::sanitize_env(&mut cmd);
        cmd.args(&plan.args).current_dir(&plan.workdir);
        for (k, v) in &plan.env {
            cmd.env(k, v);
        }
    }
    let out = log.try_clone().map_err(|e| e.to_string())?;
    cmd.stdin(Stdio::null()).stdout(Stdio::from(out)).stderr(Stdio::from(log));
    let mut child = cmd.spawn().map_err(|e| format!("Start fehlgeschlagen: {e}"))?;
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

#[tauri::command]
pub fn get_prefix_path(app: AppHandle, game_id: String, custom: Option<String>) -> Result<String, String> {
    let root = prefix_root(&app, &game_id, &custom)?;
    Ok(s(&wine_prefix(&root)))
}

#[tauri::command]
pub fn delete_prefix(app: AppHandle, game_id: String, custom: Option<String>) -> Result<(), String> {
    let root = prefix_root(&app, &game_id, &custom)?;
    if custom.as_ref().map(|c| !c.trim().is_empty()).unwrap_or(false) {
        // Eigene Prefix-Ordner nur löschen, wenn sie wirklich wie ein Prefix aussehen
        if !wine_prefix(&root).join("drive_c").exists() {
            return Err("Ordner sieht nicht wie ein Wine-Prefix aus – nichts gelöscht.".into());
        }
    }
    if root.exists() {
        fs::remove_dir_all(&root).map_err(|e| e.to_string())?;
    }
    Ok(())
}
