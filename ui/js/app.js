// LakuenLauncher – Einstiegspunkt der Oberfläche.
import { call, listen, isTauri } from "./api.js";
import { state, hooks, loadAll, saveSettings, game, collections, fmtClock, VERSION } from "./store.js";
import { esc, icon, toast, showTip, hideTip } from "./ui.js";
import { applyTheme } from "./themes.js";
import { renderLibrary, renderLibraryContent } from "./library.js";
import { renderDetail } from "./detail.js";
import { renderStats, setRange } from "./stats.js";
import { renderSettings, settingsActions, onSettingToggle, loadExternalThemes } from "./settings.js";
import { openEditor, editorDropTarget, dropArtwork } from "./editor.js";
import { openPalette } from "./palette.js";
import { startTutorial } from "./tutorial.js";
import { checkUpdates, scheduleUpdateChecks } from "./updates.js";
import * as A from "./actions.js";

const app = document.getElementById("app");

/* ---------- Darstellung ---------- */
function sidebar() {
  const cols = collections();
  const runningIds = Object.keys(state.running);
  const rg = runningIds.length ? game(runningIds[0]) : null;
  const nav = (view, ic, label, extra = "", tour = "") => `
    <button class="nav-item ${state.view === view || (view === "library" && state.view === "detail") ? "active" : ""}" data-action="nav" data-view="${view}" ${tour ? `data-tour="${tour}"` : ""} title="${label}">
      ${icon(ic)}<span class="txt">${label}</span>${extra}</button>`;
  return `
  <aside class="sidebar">
    <div class="brand"><img src="assets/logo.svg" alt=""><div class="brand-text"><div class="brand-name">LakuenLauncher</div><div class="brand-sub">Spiele und Apps</div></div></div>
    ${nav("library", "library", "Bibliothek", `<span class="count">${state.games.filter((g) => !g.hidden).length}</span>`)}
    ${nav("stats", "stats", "Statistik", "", "nav-stats")}
    ${nav("settings", "settings", "Einstellungen", state.update && state.settings.dismissedVersion !== state.update.version ? '<span class="dot" style="margin-left:auto;background:var(--accent)" title="Update verfügbar"></span>' : "", "nav-settings")}
    ${cols.length ? `<div class="nav-label">Sammlungen</div>` : ""}
    <div class="collections">
      ${cols.map(([c, n]) => `<button class="nav-item ${state.view === "library" && state.filter === "col:" + c ? "active" : ""}" data-action="collection" data-col="${esc(c)}"><span class="dot"></span><span class="txt">${esc(c)}</span><span class="count">${n}</span></button>`).join("")}
    </div>
    ${rg ? `
    <div class="now-playing" title="${esc(rg.name)} läuft">
      <span class="pulse"></span>
      <div class="np-text"><div class="np-name">${esc(rg.name)}</div><div class="np-time"><span data-since="${state.running[rg.id]}">${fmtClock(Date.now() - state.running[rg.id])}</span>${runningIds.length > 1 ? ` · +${runningIds.length - 1}` : ""}</div></div>
      <button class="btn icon small ghost" data-action="stop" data-id="${rg.id}" aria-label="${esc(rg.name)} beenden" title="Beenden">${icon("stop")}</button>
    </div>` : ""}
    <div class="side-foot"><span>v${esc(state.sys.version || VERSION)}</span><button class="btn ghost icon small" data-action="palette" title="Schnellsuche (Strg+K)" aria-label="Schnellsuche">${icon("search")}</button></div>
  </aside>`;
}

function mainView() {
  switch (state.view) {
    case "detail": return renderDetail();
    case "stats": return renderStats();
    case "settings": return renderSettings();
    default: return renderLibrary();
  }
}

let lastView = null;
function render() {
  const main = app.querySelector(".main");
  const scroll = main && lastView === viewKey() ? main.scrollTop : 0;
  const active = document.activeElement;
  const focusId = active && active.id;
  const selStart = active && active.selectionStart;
  app.innerHTML = `<div class="app">${sidebar()}<main class="main" id="main">${mainView()}</main></div>`;
  const newMain = app.querySelector(".main");
  newMain.scrollTop = scroll;
  lastView = viewKey();
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) { el.focus(); try { el.setSelectionRange(selStart, selStart); } catch { /* kein Textfeld */ } }
  }
}
function viewKey() { return state.view + ":" + (state.detailId || ""); }

function renderContent() {
  const box = document.getElementById("lib-content");
  if (box) box.innerHTML = renderLibraryContent();
  else render();
}
hooks.render = render;
hooks.renderContent = renderContent;

function navigate(view, detailId = null) {
  state.view = view;
  state.detailId = detailId;
  render();
  app.querySelector(".main").scrollTop = 0;
}

/* ---------- Aktionen ---------- */
const actions = {
  nav: (el) => { if (el.dataset.view === "library") state.filter = state.filter.startsWith("col:") ? "all" : state.filter; navigate(el.dataset.view); },
  collection: (el) => { state.filter = "col:" + el.dataset.col; navigate("library"); },
  open: (el) => navigate("detail", el.dataset.id),
  back: () => navigate("library"),
  play: (el) => A.launch(el.dataset.id),
  stop: (el) => A.stop(el.dataset.id),
  add: () => A.pickFiles(),
  scan: () => A.scanFolder(),
  edit: (el) => openEditor(el.dataset.id),
  fav: (el) => A.toggleFavorite(el.dataset.id),
  remove: (el) => A.removeGame(el.dataset.id),
  "reset-time": (el) => A.resetPlaytime(el.dataset.id),
  log: (el) => A.showLog(el.dataset.id),
  shortcut: (el) => A.createShortcut(el.dataset.id),
  winecfg: (el) => A.prefixTool(el.dataset.id, "winecfg"),
  winetricks: (el) => A.prefixTool(el.dataset.id, "winetricks"),
  "open-folder": (el) => A.openPath(game(el.dataset.id)?.path || ""),
  "open-prefix": (el) => { const g = game(el.dataset.id); if (g) A.openPath(A.prefixPath(g) + "/pfx/drive_c").catch?.(() => {}); },
  filter: (el) => { state.filter = el.dataset.filter; render(); },
  "clear-filter": () => { state.filter = "all"; state.query = ""; render(); },
  view: (el) => { state.settings.view = el.dataset.v; saveSettings(); render(); },
  "stats-range": (el) => { setRange(el.dataset.r); render(); },
  palette: () => openPalette(paletteActions),
  tutorial: () => startTutorial(() => navigate("library")),
  ...settingsActions,
};

const paletteActions = {
  open: (id) => navigate("detail", id),
  play: (id) => A.launch(id),
  add: () => A.pickFiles(),
  scan: () => A.scanFolder(),
  nav: (v) => navigate(v),
  updateCheck: () => checkUpdates({ manual: true }),
  tutorial: () => startTutorial(() => navigate("library")),
};

A.setEditorOpener(openEditor);

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (!el || !app.contains(el)) return;
  if (el.tagName === "A") e.preventDefault();
  const fn = actions[el.dataset.action];
  if (fn) { e.stopPropagation(); fn(el, e); }
});

document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.dataset.setting) return onSettingToggle(el);
  if (el.dataset.change) {
    state.settings[el.dataset.change] = el.value;
    saveSettings();
    render();
  }
});

document.addEventListener("input", (e) => {
  const el = e.target;
  if (el.id === "lib-search") {
    state.query = el.value;
    renderContent();
    return;
  }
  if (el.dataset.input === "cardSize") {
    state.settings.cardSize = +el.value;
    applyTheme();
    saveSettings();
    const label = el.parentElement.querySelector(".num");
    if (label) label.textContent = el.value + " px";
  } else if (el.dataset.input === "accent") {
    state.settings.accent = el.value;
    applyTheme();
    saveSettings();
  }
});

// Tooltips für Diagramme
document.addEventListener("mousemove", (e) => {
  const t = e.target.closest?.("[data-tip]");
  if (!t) return hideTip();
  const r = t.getBoundingClientRect();
  showTip(r.left + r.width / 2, r.top + Math.min(20, r.height / 3), t.getAttribute("data-tip"));
});
document.addEventListener("scroll", hideTip, true);

/* ---------- Tastatur ---------- */
function gridMove(key) {
  const cards = [...document.querySelectorAll(".grid .card, .list .list-row")];
  const idx = cards.indexOf(document.activeElement);
  if (idx < 0) return false;
  let target = idx;
  if (key === "ArrowRight") target = idx + 1;
  else if (key === "ArrowLeft") target = idx - 1;
  else {
    const top = cards[idx].offsetTop;
    const perRow = cards.filter((c) => c.offsetTop === top).length || 1;
    target = key === "ArrowDown" ? idx + perRow : idx - perRow;
  }
  if (cards[target]) { cards[target].focus(); cards[target].scrollIntoView({ block: "nearest" }); }
  return true;
}

document.addEventListener("keydown", (e) => {
  const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  const modalOpen = document.getElementById("modal-root").children.length > 0 || document.querySelector(".tour-layer");
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key.toLowerCase() === "k") { e.preventDefault(); if (!document.querySelector(".tour-layer")) openPalette(paletteActions); return; }
  if (modalOpen) return;
  if (ctrl && e.key.toLowerCase() === "n") { e.preventDefault(); A.pickFiles(); return; }
  if (ctrl && e.key === ",") { e.preventDefault(); navigate("settings"); return; }
  if (ctrl && e.key.toLowerCase() === "f") {
    e.preventDefault();
    if (state.view !== "library") navigate("library");
    document.getElementById("lib-search")?.focus();
    return;
  }
  if (e.key === "Escape") {
    if (inField && e.target.id === "lib-search" && state.query) { state.query = ""; e.target.value = ""; renderContent(); return; }
    if (state.view === "detail") navigate("library");
    return;
  }
  if (inField) return;
  if (e.key.startsWith("Arrow") && gridMove(e.key)) { e.preventDefault(); return; }
  if (e.key === "Enter" && e.target.dataset?.action === "open") { e.preventDefault(); navigate("detail", e.target.dataset.id); }
});

/* ---------- Drag & Drop ---------- */
function setupDragDrop() {
  if (!isTauri) return;
  const overlay = document.getElementById("drop-overlay");
  listen("tauri://drag-enter", () => {
    if (!document.querySelector(".art-slot")) overlay.classList.remove("hidden");
  });
  listen("tauri://drag-leave", () => overlay.classList.add("hidden"));
  listen("tauri://drag-drop", async (p) => {
    overlay.classList.add("hidden");
    const paths = p.paths || [];
    if (!paths.length) return;
    // Bild auf ein Artwork-Feld im Bearbeiten-Dialog gezogen?
    const dpr = window.devicePixelRatio || 1;
    const pos = p.position || { x: 0, y: 0 };
    const kind = editorDropTarget(pos.x / dpr, pos.y / dpr) || editorDropTarget(pos.x, pos.y);
    if (kind) return dropArtwork(kind, paths[0]);
    const images = paths.filter((x) => /\.(png|jpe?g|webp|gif|avif|svg)$/i.test(x));
    const rest = paths.filter((x) => !images.includes(x));
    if (images.length && !rest.length) {
      toast("Bilder bitte im Bearbeiten-Dialog ablegen", "Öffne ein Spiel, wähle „Bearbeiten → Artwork“ und zieh das Bild auf das gewünschte Feld.");
      return;
    }
    A.addFiles(rest);
  });
}

/* ---------- Laufzeit-Anzeigen ---------- */
setInterval(() => {
  document.querySelectorAll("[data-since]").forEach((el) => {
    el.textContent = fmtClock(Date.now() - Number(el.dataset.since));
  });
}, 1000);

/* ---------- Start ---------- */
async function init() {
  await loadAll();
  await loadExternalThemes();
  applyTheme();
  render();

  listen("game-started", (p) => { state.running[p.id] = p.started; render(); });
  listen("game-exited", (p) => A.onGameExited(p));
  listen("launch-request", (id) => { if (game(id)) A.launch(id); });
  setupDragDrop();
  scheduleUpdateChecks();

  const pending = await call("take_pending_launch").catch(() => null);
  if (pending && game(pending)) A.launch(pending);

  if (!state.settings.tutorialDone) setTimeout(() => startTutorial(() => navigate("library")), 500);
}

window.addEventListener("error", (e) => console.error(e.error || e.message));
init().catch((e) => {
  console.error(e);
  app.innerHTML = `<div style="padding:40px"><h2>LakuenLauncher konnte nicht starten</h2><pre>${esc(String(e && e.stack || e))}</pre></div>`;
});
