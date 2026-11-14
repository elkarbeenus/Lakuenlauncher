// Zentraler Zustand + Speicherung (alles lokal als JSON über das Backend).
import { invoke } from './api.js';
import { uid } from './ui.js';

export const DEFAULT_SETTINGS = {
  theme: 'sakura-night',
  accent: null,
  customThemes: [],
  cardSize: 170,
  showPlaytime: true,
  reduceMotion: false,
  effects: true,
  petals: false,
  ambient: true,
  sort: 'recent',
  view: 'grid',
  showHidden: false,
  defaultProton: 'auto-latest',
  defaultRunner: 'auto',
  mangohud: false,
  gamemode: false,
  prefixBase: '',
  minimizeOnLaunch: false,
  restoreOnExit: true,
  notifySessions: true,
  watchFolders: [],
  scanOnStart: true,
  scanIgnored: [],
  updateCheck: true,
  lastUpdateCheck: 0,
  skippedVersion: '',
  tutorialDone: false,
  gamepad: true,
  confirmDelete: true,
};

export const state = {
  library: { version: 1, games: [], collections: [] },
  settings: { ...DEFAULT_SETTINGS },
  sessions: [],
  running: {},
  protons: [],
  sys: null,
  version: '0.1.0',
  view: { name: 'library', filter: 'all', gameId: null, tab: 'overview', settingsSection: 'appearance' },
  search: '',
  update: null,
  scanFound: [],
};

const subs = new Set();
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
export function notify(what = 'all') { subs.forEach((fn) => fn(what)); }

const timers = {};
export function save(name) {
  clearTimeout(timers[name]);
  timers[name] = setTimeout(() => {
    invoke('store_save', { name, data: state[name] }).catch((e) => console.error('Speichern fehlgeschlagen', name, e));
  }, 250);
}
export function saveNow(name) {
  clearTimeout(timers[name]);
  return invoke('store_save', { name, data: state[name] });
}

export async function loadAll() {
  const [lib, settings, sessions] = await Promise.all([
    invoke('store_load', { name: 'library' }),
    invoke('store_load', { name: 'settings' }),
    invoke('store_load', { name: 'sessions' }),
  ]);
  if (lib && Array.isArray(lib.games)) state.library = { version: 1, collections: [], ...lib };
  state.library.games = state.library.games.map(normalizeGame);
  state.settings = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  state.sessions = Array.isArray(sessions) ? sessions : [];
  invalidateStats();
}

export async function reloadSessions() {
  const s = await invoke('store_load', { name: 'sessions' });
  state.sessions = Array.isArray(s) ? s : [];
  invalidateStats();
}

export function normalizeGame(g) {
  return {
    id: g.id || uid(),
    name: g.name || 'Unbenannt',
    path: g.path || '',
    kind: g.kind || guessKind(g.path || ''),
    args: g.args || '',
    workdir: g.workdir || '',
    env: g.env || {},
    runner: g.runner || 'default',
    proton: g.proton || 'default',
    prefix: g.prefix || '',
    mangohud: g.mangohud ?? null,
    gamemode: g.gamemode ?? null,
    fsr: !!g.fsr,
    wrapper: g.wrapper || '',
    preScript: g.preScript || '',
    postScript: g.postScript || '',
    art: g.art || {},
    favorite: !!g.favorite,
    hidden: !!g.hidden,
    collections: g.collections || [],
    notes: g.notes || '',
    addedAt: g.addedAt || Date.now(),
    lastLaunch: g.lastLaunch || 0,
  };
}

export function guessKind(path) {
  const p = path.toLowerCase();
  if (p.endsWith('.exe') || p.endsWith('.msi') || p.endsWith('.bat')) return 'exe';
  if (p.endsWith('.appimage')) return 'appimage';
  return 'native';
}

export function guessName(path) {
  const parts = path.split(/[\\/]/).filter(Boolean);
  let file = parts.pop() || 'Spiel';
  const generic = ['bin', 'binaries', 'win64', 'win32', 'x64', 'x86', 'game', 'release', 'shipping', 'build'];
  if (/\.exe$/i.test(file)) {
    for (let i = parts.length - 1; i >= 0; i--) {
      if (!generic.includes(parts[i].toLowerCase())) { file = parts[i]; break; }
    }
  }
  const words = file.replace(/\.(appimage|exe|sh|x86_64)$/i, '').split(/[_\-. ]+/).filter((w, i) => {
    const lw = w.toLowerCase();
    if (!w || ['x86', '64', 'x86_64', 'amd64', 'appimage', 'linux', 'win64', 'shipping', 'x64'].includes(lw)) return false;
    if (i > 0 && /^v?\d+$/.test(lw)) return false;
    return true;
  });
  const name = words.join(' ').trim() || file;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export const games = () => state.library.games;
export const gameById = (id) => state.library.games.find((g) => g.id === id);

export function addGame(partial) {
  const g = normalizeGame({ ...partial, id: uid(), addedAt: Date.now() });
  state.library.games.push(g);
  save('library');
  notify('library');
  return g;
}

export function updateGame(id, patch) {
  const g = gameById(id);
  if (!g) return;
  Object.assign(g, patch);
  save('library');
  notify('library');
}

export function removeGame(id) {
  state.library.games = state.library.games.filter((g) => g.id !== id);
  save('library');
  notify('library');
}

export function setSetting(key, value) {
  state.settings[key] = value;
  save('settings');
  notify('settings');
}

// ---------- Statistik (aus den Sitzungen berechnet) ----------
let statsCache = null;
export function invalidateStats() { statsCache = null; }

export function stats() {
  if (statsCache) return statsCache;
  const byGame = {};
  let total = 0;
  for (const s of state.sessions) {
    const b = (byGame[s.gameId] ||= { secs: 0, count: 0, last: 0, longest: 0 });
    b.secs += s.secs || 0;
    b.count += 1;
    b.last = Math.max(b.last, s.end || s.start || 0);
    b.longest = Math.max(b.longest, s.secs || 0);
    total += s.secs || 0;
  }
  statsCache = { byGame, total };
  return statsCache;
}

export function gameStats(id) {
  return stats().byGame[id] || { secs: 0, count: 0, last: 0, longest: 0 };
}

export function lastPlayed(g) {
  return Math.max(gameStats(g.id).last, g.lastLaunch || 0);
}

/** Sekunden pro Kalendertag (lokale Zeit); Sitzungen über Mitternacht werden aufgeteilt. */
export function secondsByDay(filterId = null) {
  const map = new Map();
  for (const s of state.sessions) {
    if (filterId && s.gameId !== filterId) continue;
    let start = s.start, end = s.end || s.start + (s.secs || 0) * 1000;
    while (start < end) {
      const d = new Date(start);
      const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
      const chunk = Math.min(end, next) - start;
      const key = dayKey(d);
      map.set(key, (map.get(key) || 0) + chunk / 1000);
      start = Math.min(end, next);
    }
  }
  return map;
}

export function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function visibleGames() {
  const { filter } = state.view;
  const q = state.search.trim().toLowerCase();
  let list = state.library.games.filter((g) => state.settings.showHidden || !g.hidden || filter === 'hidden');
  if (filter === 'favorites') list = list.filter((g) => g.favorite);
  else if (filter === 'recent') list = list.filter((g) => lastPlayed(g) > 0);
  else if (filter === 'exe' || filter === 'appimage' || filter === 'native') list = list.filter((g) => g.kind === filter);
  else if (filter === 'hidden') list = list.filter((g) => g.hidden);
  else if (filter?.startsWith('col:')) list = list.filter((g) => g.collections.includes(filter.slice(4)));
  if (q) list = list.filter((g) => g.name.toLowerCase().includes(q) || g.path.toLowerCase().includes(q));
  const sort = filter === 'recent' ? 'recent' : state.settings.sort;
  const by = {
    recent: (a, b) => lastPlayed(b) - lastPlayed(a) || a.name.localeCompare(b.name, 'de'),
    name: (a, b) => a.name.localeCompare(b.name, 'de'),
    playtime: (a, b) => gameStats(b.id).secs - gameStats(a.id).secs || a.name.localeCompare(b.name, 'de'),
    added: (a, b) => b.addedAt - a.addedAt,
  }[sort] || ((a, b) => a.name.localeCompare(b.name, 'de'));
  return [...list].sort((a, b) => (b.favorite && sort === 'name' ? 0 : 0) || by(a, b));
}
