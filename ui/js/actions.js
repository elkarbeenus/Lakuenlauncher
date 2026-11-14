// Aktionen rund um Spiele: hinzufügen, starten, beenden, entfernen, Artwork, Werkzeuge.
import { call, openDialog, appWindow } from "./api.js";
import {
  state, game, uid, normalizeGame, saveLibrary, saveSessions, rerender, reloadSessions, fmtDuration,
} from "./store.js";
import { toast, confirmDialog, openModal, esc, icon } from "./ui.js";

let editorOpener = () => {};
export function setEditorOpener(fn) { editorOpener = fn; }

const basename = (p) => String(p).split(/[\\/]/).pop();

export async function addFiles(paths, { edit = true } = {}) {
  const added = [];
  for (const p of paths) {
    if (state.games.some((g) => g.path === p)) {
      toast("Schon in der Bibliothek", basename(p));
      continue;
    }
    let info;
    try {
      info = await call("inspect_file", { path: p });
    } catch (e) {
      toast("Konnte nicht hinzugefügt werden", String(e), "error");
      continue;
    }
    const g = normalizeGame({ id: uid(), name: info.name, path: p, kind: info.kind, addedAt: Date.now() });
    state.games.push(g);
    added.push(g);
  }
  if (added.length) {
    saveLibrary();
    rerender();
    if (added.length === 1) {
      toast(`„${added[0].name}“ hinzugefügt`, "", "ok", 2600);
      if (edit) editorOpener(added[0].id, "general", true);
    } else {
      toast(`${added.length} Einträge hinzugefügt`, "Namen und Artwork kannst du jederzeit über „Bearbeiten“ ändern.", "ok");
    }
  }
  return added;
}

export async function pickFiles() {
  const res = await openDialog({
    multiple: true,
    title: "Spiele oder Apps auswählen",
    filters: [
      { name: "Spiele und Apps", extensions: ["AppImage", "appimage", "APPIMAGE", "exe", "EXE", "sh", "x86_64"] },
      { name: "Alle Dateien", extensions: ["*"] },
    ],
  });
  if (!res) return;
  await addFiles(Array.isArray(res) ? res : [res]);
}

export async function scanFolder(dir) {
  if (!dir) {
    dir = await openDialog({ directory: true, multiple: false, title: "Ordner durchsuchen", defaultPath: state.settings.scanFolder || undefined });
    if (!dir) return;
  }
  state.settings.scanFolder = dir;
  let found = [];
  try {
    found = await call("scan_folder", { path: dir });
  } catch (e) {
    toast("Ordner konnte nicht durchsucht werden", String(e), "error");
    return;
  }
  const known = new Set(state.games.map((g) => g.path));
  const fresh = found.filter((f) => !known.has(f.path));
  if (!fresh.length) {
    toast("Nichts Neues gefunden", found.length ? "Alle gefundenen Dateien sind schon in deiner Bibliothek." : "In diesem Ordner liegen keine AppImages oder .exe-Dateien.");
    return;
  }
  const m = openModal(
    `<div class="modal-head"><h2>${fresh.length} ${fresh.length === 1 ? "Datei" : "Dateien"} gefunden</h2><button class="btn ghost icon" data-close aria-label="Schließen">${icon("close")}</button></div>
     <div class="modal-body">
       <p class="muted" style="margin:0 0 12px">Wähle aus, was in die Bibliothek soll. Namen kannst du danach anpassen.</p>
       <div class="row" style="margin-bottom:10px"><button class="btn small" data-all>Alle auswählen</button><button class="btn small ghost" data-none>Keine</button></div>
       <div class="scan-list">${fresh.map((f, i) => `
         <label class="scan-item"><input type="checkbox" data-i="${i}" ${f.kind === "appimage" || i < 60 ? "checked" : ""}>
           <div style="min-width:0"><div>${esc(f.name)}</div><div class="p">${esc(f.path)}</div></div>
           <span class="kind-tag">${f.kind === "exe" ? "Windows" : "AppImage"}</span></label>`).join("")}
       </div>
     </div>
     <div class="modal-foot"><button class="btn ghost" data-close>Abbrechen</button><button class="btn primary" data-add>Hinzufügen</button></div>`,
    { cls: "wide" },
  );
  const boxes = () => [...m.el.querySelectorAll("input[type=checkbox]")];
  m.el.querySelector("[data-all]").onclick = () => boxes().forEach((b) => (b.checked = true));
  m.el.querySelector("[data-none]").onclick = () => boxes().forEach((b) => (b.checked = false));
  m.el.querySelector("[data-add]").onclick = async () => {
    const chosen = boxes().filter((b) => b.checked).map((b) => fresh[+b.dataset.i]);
    m.close();
    for (const f of chosen) {
      state.games.push(normalizeGame({ id: uid(), name: f.name, path: f.path, kind: f.kind, addedAt: Date.now() }));
    }
    if (chosen.length) {
      saveLibrary();
      rerender();
      toast(`${chosen.length} Einträge hinzugefügt`, "", "ok");
    }
  };
}

export function launchRequest(g) {
  const s = state.settings;
  return {
    ...g.launch,
    id: g.id,
    name: g.name,
    path: g.path,
    kind: g.kind,
    workingDir: g.launch.workingDir || null,
    prefix: g.launch.prefix || null,
    proton: g.launch.proton || "default",
    useUmu: g.launch.useUmu === null || g.launch.useUmu === undefined ? !!s.useUmu : !!g.launch.useUmu,
    defaultProton: s.defaultProton,
  };
}

export async function launch(id) {
  const g = game(id);
  if (!g || state.running[id]) return;
  try {
    const started = await call("launch_game", { req: launchRequest(g) });
    state.running[id] = started;
    rerender();
    toast(`${g.name} startet`, g.kind === "exe" ? "Beim ersten Start richtet Proton den Prefix ein – das kann etwas dauern." : "", "ok", 3500);
    if (state.settings.minimizeOnLaunch) setTimeout(() => appWindow.minimize(), 600);
  } catch (e) {
    toast("Start fehlgeschlagen", String(e), "error", 9000, { label: "Protokoll", run: () => showLog(id) });
  }
}

export async function stop(id) {
  const g = game(id);
  if (!g) return;
  if (state.settings.confirmStop) {
    const ok = await confirmDialog(`${g.name} beenden?`, "Nicht gespeicherter Fortschritt im Spiel geht verloren.", "Beenden", true);
    if (!ok) return;
  }
  try {
    await call("stop_game", { id });
  } catch (e) {
    toast("Beenden fehlgeschlagen", String(e), "error");
  }
}

export async function onGameExited(p) {
  delete state.running[p.id];
  await reloadSessions();
  rerender();
  const g = game(p.id);
  if (!g) return;
  if (p.seconds < 6 && p.exitCode !== 0) {
    toast(`${g.name} wurde sofort beendet`, "Im Startprotokoll steht, woran es lag.", "error", 10000, { label: "Protokoll", run: () => showLog(p.id) });
  } else if (p.seconds >= 3) {
    toast(`Sitzung beendet: ${g.name}`, `Gespielt: ${fmtDuration(p.seconds)}`, "ok", 5000);
  }
  if (state.settings.minimizeOnLaunch && !Object.keys(state.running).length) appWindow.restore();
}

export function toggleFavorite(id) {
  const g = game(id);
  if (!g) return;
  g.favorite = !g.favorite;
  saveLibrary();
  rerender();
}

export async function removeGame(id) {
  const g = game(id);
  if (!g) return;
  const ok = await confirmDialog(
    `„${g.name}“ entfernen?`,
    "Der Eintrag, sein Artwork und die gemessene Spielzeit werden aus dem Launcher gelöscht. Die Spieldatei selbst und ein evtl. vorhandener Wine-Prefix bleiben auf deinem Gerät.",
    "Entfernen",
    true,
  );
  if (!ok) return;
  for (const path of Object.values(g.artwork)) if (path) call("remove_artwork", { path }).catch(() => {});
  call("remove_shortcut", { id }).catch(() => {});
  state.games = state.games.filter((x) => x.id !== id);
  state.sessions = state.sessions.filter((s) => s.gameId !== id);
  saveLibrary();
  await saveSessions();
  if (state.detailId === id) { state.view = "library"; state.detailId = null; }
  rerender();
  toast("Entfernt", g.name, "ok", 2500);
}

export async function resetPlaytime(id) {
  const g = game(id);
  if (!g) return;
  const ok = await confirmDialog(`Spielzeit von „${g.name}“ zurücksetzen?`, "Alle gemessenen Sitzungen dieses Eintrags werden gelöscht.", "Zurücksetzen", true);
  if (!ok) return;
  state.sessions = state.sessions.filter((s) => s.gameId !== id);
  await saveSessions();
  rerender();
}

export async function pickArtwork(id, kind) {
  const res = await openDialog({
    multiple: false,
    title: "Bild auswählen",
    filters: [{ name: "Bilder", extensions: ["png", "jpg", "jpeg", "webp", "gif", "avif", "svg", "PNG", "JPG", "JPEG", "WEBP"] }],
  });
  if (!res) return null;
  return importArtwork(id, kind, Array.isArray(res) ? res[0] : res);
}

export async function importArtwork(id, kind, source) {
  try {
    return await call("import_artwork", { gameId: id, kind, source });
  } catch (e) {
    toast("Bild konnte nicht übernommen werden", String(e), "error");
    return null;
  }
}

export async function showLog(id) {
  const g = game(id);
  const text = await call("read_log", { id }).catch(() => "");
  const m = openModal(
    `<div class="modal-head"><h2>Startprotokoll${g ? ": " + esc(g.name) : ""}</h2><button class="btn ghost icon" data-close aria-label="Schließen">${icon("close")}</button></div>
     <div class="modal-body"><pre class="log">${text ? esc(text) : "Noch kein Protokoll vorhanden – es entsteht beim ersten Start."}</pre></div>
     <div class="modal-foot"><button class="btn" data-copy>${icon("copy")} Kopieren</button><button class="btn" data-folder>${icon("folder")} Protokoll-Ordner</button><button class="btn primary" data-close>Schließen</button></div>`,
    { cls: "wide" },
  );
  const pre = m.el.querySelector(".log");
  pre.scrollTop = pre.scrollHeight;
  m.el.querySelector("[data-copy]").onclick = async () => {
    try { await navigator.clipboard.writeText(text); toast("Kopiert", "", "ok", 1800); } catch { toast("Kopieren nicht möglich", "", "error"); }
  };
  m.el.querySelector("[data-folder]").onclick = () => openPath(state.dataDir + "/logs");
}

export async function openPath(path) {
  try { await call("open_path", { path }); } catch (e) { toast("Konnte nicht geöffnet werden", String(e), "error"); }
}
export async function openUrl(url) {
  try { await call("open_url", { url }); } catch (e) { toast("Link konnte nicht geöffnet werden", String(e), "error"); }
}

export function prefixPath(g) {
  return g.launch.prefix || `${state.dataDir}/prefixes/${g.id.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

export async function prefixTool(id, tool) {
  const g = game(id);
  if (!g) return;
  try {
    await call("run_prefix_tool", { req: launchRequest(g), tool });
    toast(tool === "winecfg" ? "winecfg startet" : "winetricks startet", "Das Fenster öffnet sich gleich.", "ok", 3000);
  } catch (e) {
    toast(`${tool} konnte nicht gestartet werden`, String(e), "error", 8000);
  }
}

export async function createShortcut(id) {
  const g = game(id);
  if (!g) return;
  const m = openModal(
    `<div class="modal-head"><h2>Verknüpfung anlegen</h2><button class="btn ghost icon" data-close aria-label="Schließen">${icon("close")}</button></div>
     <div class="modal-body">
       <p style="margin:0 0 10px">„${esc(g.name)}“ erscheint dann im Anwendungsmenü und startet über den Launcher – die Spielzeit wird also mitgezählt.</p>
       <p class="muted" style="margin:0">Tipp für den Gaming-Modus: In Steam „Spiel hinzufügen → Nicht-Steam-Spiel hinzufügen“ wählen und den Eintrag aus der Liste nehmen.</p>
     </div>
     <div class="modal-foot"><button class="btn ghost" data-close>Abbrechen</button><button class="btn" data-menu>Nur Anwendungsmenü</button><button class="btn primary" data-desktop>Menü und Desktop</button></div>`,
    { cls: "narrow" },
  );
  const run = async (onDesktop) => {
    m.close();
    try {
      await call("create_shortcut", { id: g.id, name: g.name, icon: g.artwork.icon || g.artwork.cover || null, onDesktop });
      toast("Verknüpfung angelegt", onDesktop ? "Im Anwendungsmenü und auf dem Desktop." : "Im Anwendungsmenü.", "ok");
    } catch (e) {
      toast("Verknüpfung fehlgeschlagen", String(e), "error");
    }
  };
  m.el.querySelector("[data-menu]").onclick = () => run(false);
  m.el.querySelector("[data-desktop]").onclick = () => run(true);
}
