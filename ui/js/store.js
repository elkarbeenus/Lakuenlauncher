// Zustand der App, Laden/Speichern und kleine Helfer.
import { call } from "./api.js";

export const VERSION = "0.1.0";
export const REPO = "elkarbeenus/Lakuenlauncher";

export const DEFAULT_SETTINGS = {
  theme: "nachtgarten",
  accent: null,
  cardSize: 176,
  view: "grid",
  sort: "recent",
  reduceMotion: false,
  defaultProton: "auto-experimental",
  useUmu: true,
  minimizeOnLaunch: false,
  confirmStop: true,
  checkUpdates: true,
  notifyUpdates: true,
  lastUpdateCheck: 0,
  dismissedVersion: null,
  tutorialDone: false,
  showStage: true,
  scanFolder: "",
};

export const state = {
  games: [],
  settings: { ...DEFAULT_SETTINGS },
  sessions: [],
  running: {}, // id -> Startzeit (ms)
  proton: [],
  tools: {},
  sys: {},
  dataDir: "",
  externalThemes: [],
  view: "library",
  detailId: null,
  filter: "all",
  query: "",
  update: null, // { version, url, notes }
};

async function loadJson(name, fallback) {
  try {
    const text = await call("load_data", { name });
    return text ? JSON.parse(text) : fallback;
  } catch (e) {
    console.error("Laden fehlgeschlagen:", name, e);
    return fallback;
  }
}

export async function loadAll() {
  const [lib, settings, sessions] = await Promise.all([
    loadJson("library", { version: 1, games: [] }),
    loadJson("settings", {}),
    loadJson("sessions", []),
  ]);
  state.games = (lib.games || []).map(normalizeGame);
  state.settings = { ...DEFAULT_SETTINGS, ...settings };
  state.sessions = Array.isArray(sessions) ? sessions : [];
  const [proton, tools, sys, dataDir, running] = await Promise.all([
    call("list_proton").catch(() => []),
    call("detect_tools").catch(() => ({})),
    call("system_info").catch(() => ({})),
    call("data_dir").catch(() => ""),
    call("running_games").catch(() => []),
  ]);
  Object.assign(state, { proton, tools, sys, dataDir });
  for (const r of running || []) state.running[r.id] = r.started;
}

export function normalizeGame(g) {
  return {
    id: g.id || uid(),
    name: g.name || "Unbenannt",
    path: g.path || "",
    kind: g.kind || "native",
    addedAt: g.addedAt || Date.now(),
    favorite: !!g.favorite,
    hidden: !!g.hidden,
    collections: Array.isArray(g.collections) ? g.collections : [],
    notes: g.notes || "",
    artwork: { cover: "", hero: "", logo: "", icon: "", ...(g.artwork || {}) },
    launch: {
      args: "", env: [], workingDir: "", proton: "default", prefix: "",
      mangohud: false, gamemode: false, fsr: false, preLaunch: "", postExit: "",
      useUmu: null,
      ...(g.launch || {}),
    },
  };
}

let libTimer = null;
export function saveLibrary() {
  clearTimeout(libTimer);
  libTimer = setTimeout(() => {
    call("save_data", { name: "library", content: JSON.stringify({ version: 1, games: state.games }, null, 1) })
      .catch((e) => console.error(e));
  }, 250);
}
let setTimer = null;
export function saveSettings() {
  clearTimeout(setTimer);
  setTimer = setTimeout(() => {
    call("save_data", { name: "settings", content: JSON.stringify(state.settings, null, 1) }).catch((e) => console.error(e));
  }, 250);
}
export async function saveSessions() {
  await call("save_data", { name: "sessions", content: JSON.stringify(state.sessions) });
}
export async function reloadSessions() {
  state.sessions = await loadJson("sessions", state.sessions);
}

export function game(id) {
  return state.games.find((g) => g.id === id);
}

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Summen pro Spiel: Sekunden, Anzahl Sitzungen, zuletzt gespielt. */
export function totals() {
  const map = {};
  for (const s of state.sessions) {
    const t = (map[s.gameId] ||= { seconds: 0, count: 0, last: 0 });
    t.seconds += s.seconds || 0;
    t.count += 1;
    if (s.end > t.last) t.last = s.end;
  }
  return map;
}

export function collections() {
  const set = new Map();
  for (const g of state.games) for (const c of g.collections) set.set(c, (set.get(c) || 0) + 1);
  return [...set.entries()].sort((a, b) => a[0].localeCompare(b[0], "de"));
}

/* ---------- Formatierung ---------- */
export function fmtDuration(sec, short = false) {
  sec = Math.round(sec || 0);
  if (sec < 60) return sec > 0 ? (short ? "< 1 Min." : "unter 1 Minute") : "–";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h === 0) return `${m} Min.`;
  if (h >= 100 || short) return `${h.toLocaleString("de-DE")} Std.` + (short || m === 0 ? "" : ` ${m} Min.`);
  return `${h} Std.` + (m ? ` ${m} Min.` : "");
}
export function fmtHours(sec) {
  const h = (sec || 0) / 3600;
  if (h < 1) return `${Math.round((sec || 0) / 60)} Min.`;
  return `${h.toLocaleString("de-DE", { maximumFractionDigits: h < 10 ? 1 : 0 })} Std.`;
}
export function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(ss)}` : `${m}:${pad(ss)}`;
}
export function fmtRelative(ms) {
  if (!ms) return "noch nie";
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const diff = Math.floor((d0.getTime() - new Date(ms).setHours(0, 0, 0, 0)) / 86400000);
  if (diff <= 0) return "heute";
  if (diff === 1) return "gestern";
  if (diff < 7) return `vor ${diff} Tagen`;
  if (diff < 30) return `vor ${Math.round(diff / 7)} Wo.`;
  return new Date(ms).toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" });
}
export function fmtDate(ms, withTime = false) {
  if (!ms) return "–";
  const opts = { day: "2-digit", month: "2-digit", year: "numeric" };
  if (withTime) Object.assign(opts, { hour: "2-digit", minute: "2-digit" });
  return new Date(ms).toLocaleString("de-DE", opts);
}
export function kindLabel(kind) {
  return kind === "exe" ? "Windows (Proton)" : kind === "appimage" ? "AppImage" : "Linux-Programm";
}
export function kindShort(kind) {
  return kind === "exe" ? "Windows" : kind === "appimage" ? "AppImage" : "Linux";
}

/** Vergleicht Versionsnummern wie 0.1.0 und 0.1.12. */
export function newerVersion(a, b) {
  const pa = String(a).replace(/^v/, "").split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  const pb = String(b).replace(/^v/, "").split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

/** Wird von app.js gesetzt – zeichnet die Oberfläche neu. */
export const hooks = { render: () => {}, renderContent: () => {} };
export function rerender() { hooks.render(); }
