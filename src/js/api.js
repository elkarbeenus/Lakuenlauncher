// Verbindung zum Rust-Backend. Ohne Tauri (z. B. Vorschau im Browser) läuft ein Demo-Modus.

const T = window.__TAURI__;
export const isTauri = !!(T && T.core);

export function invoke(cmd, args = {}) {
  if (isTauri) return T.core.invoke(cmd, args);
  return mock(cmd, args);
}

export function fileSrc(path) {
  if (!path) return '';
  if (/^(https?:|data:|blob:|assets\/)/.test(path)) return path;
  if (isTauri) return T.core.convertFileSrc(path);
  return path;
}

export async function listen(event, cb) {
  if (isTauri) return T.event.listen(event, (e) => cb(e.payload));
  mockListeners[event] = mockListeners[event] || [];
  mockListeners[event].push(cb);
  return () => {};
}

export async function onDragDrop(cb) {
  if (!isTauri) return;
  // Tauri 2: Datei-Drops liefern Pfade über eigene Events
  await T.event.listen('tauri://drag-enter', (e) => cb({ type: 'enter', paths: e.payload?.paths || [] }));
  await T.event.listen('tauri://drag-over', () => cb({ type: 'over' }));
  await T.event.listen('tauri://drag-leave', () => cb({ type: 'leave' }));
  await T.event.listen('tauri://drag-drop', (e) => cb({ type: 'drop', paths: e.payload?.paths || [], position: e.payload?.position }));
}

export async function pickFiles({ multiple = false, filters, directory = false, title } = {}) {
  if (!isTauri) return null;
  const options = { multiple, directory, filters, title };
  const res = T.dialog ? await T.dialog.open(options) : await T.core.invoke('plugin:dialog|open', { options });
  if (res == null) return null;
  return Array.isArray(res) ? res : [res];
}

export async function saveFile({ defaultPath, filters, title } = {}) {
  if (!isTauri) return null;
  const options = { defaultPath, filters, title };
  return T.dialog ? T.dialog.save(options) : T.core.invoke('plugin:dialog|save', { options });
}

export async function appVersion() {
  if (!isTauri) return '0.1.0';
  try { if (T.app) return await T.app.getVersion(); } catch (_) {}
  try { return await T.core.invoke('plugin:app|version'); } catch (_) {}
  return '0.1.0';
}

// ---------------- Demo-Modus (nur Browser-Vorschau) ----------------
const mockListeners = {};
const mem = { library: null, settings: null, sessions: null };
const running = {};

function demoData() {
  const names = [
    ['Sternenstaub Odyssee', 'exe'], ['Neon Drift 2088', 'exe'], ['Pixel Gärtner', 'appimage'],
    ['Kirschblüten Tales', 'exe'], ['Void Runner', 'appimage'], ['Mondlicht Chroniken', 'exe'],
    ['Kraken Kart', 'exe'], ['Lumen', 'appimage'], ['Eisenwald', 'exe'], ['Retro Arcade', 'native'],
  ];
  const now = Date.now();
  const games = names.map(([name, kind], i) => ({
    id: 'demo' + i, name, kind, path: `/home/deck/Games/${name.replace(/ /g, '')}/${kind === 'exe' ? 'game.exe' : name.replace(/ /g, '') + '.AppImage'}`,
    args: '', workdir: '', env: {}, runner: 'default', proton: 'default', prefix: '', mangohud: null, gamemode: null,
    fsr: false, wrapper: '', preScript: '', postScript: '', art: {}, favorite: i % 3 === 0, hidden: false,
    collections: i < 4 ? ['c1'] : [], notes: '', addedAt: now - i * 86400000 * 3,
  }));
  const sessions = [];
  for (let d = 0; d < 160; d++) {
    const n = Math.random() < 0.55 ? Math.floor(Math.random() * 3) + 1 : 0;
    for (let k = 0; k < n; k++) {
      const g = games[Math.floor(Math.pow(Math.random(), 1.8) * games.length)];
      const start = now - d * 86400000 - Math.random() * 40000000;
      const secs = Math.floor(600 + Math.random() * 9000);
      sessions.push({ gameId: g.id, start, end: start + secs * 1000, secs });
    }
  }
  return { library: { version: 1, games, collections: [{ id: 'c1', name: 'Lieblings-RPGs' }] }, sessions };
}

async function mock(cmd, a) {
  if (!mem.library) {
    const d = demoData();
    mem.library = d.library;
    mem.sessions = d.sessions;
  }
  switch (cmd) {
    case 'store_load': return structuredClone(mem[a.name] ?? null);
    case 'store_save': mem[a.name] = structuredClone(a.data); return null;
    case 'list_proton': return [
      { name: 'Proton - Experimental', path: '/home/deck/.steam/steam/steamapps/common/Proton - Experimental', source: 'Steam', experimental: true, version: [], runtime: '/sniper' },
      { name: 'GE-Proton10-25', path: '/home/deck/.steam/steam/compatibilitytools.d/GE-Proton10-25', source: 'Eigene', experimental: false, version: [10, 25], runtime: '/sniper' },
      { name: 'Proton 10.0', path: '/home/deck/.steam/steam/steamapps/common/Proton 10.0', source: 'Steam', experimental: false, version: [10, 0], runtime: '/sniper' },
    ];
    case 'system_info': return { os: 'linux', home: '/home/deck', dataDir: '/home/deck/.local/share/de.lakuen.launcher', isAppImage: true, umu: null, mangohud: true, gamemode: true, gamescope: true, winetricks: false, steamRoot: '/home/deck/.local/share/Steam', steamRuntime: true, desktopEntries: true };
    case 'list_running': return Object.values(running);
    case 'take_pending_launch': return null;
    case 'launch_game': {
      const id = a.req.gameId; const started = Date.now();
      running[id] = { gameId: id, pid: 1234, started };
      setTimeout(() => emit('game-started', { gameId: id, started, runner: 'umu', notes: [] }), 400);
      return null;
    }
    case 'stop_game': {
      const r = running[a.gameId]; delete running[a.gameId];
      if (r) {
        const secs = Math.round((Date.now() - r.started) / 1000);
        mem.sessions.push({ gameId: a.gameId, start: r.started, end: Date.now(), secs });
        setTimeout(() => emit('game-exited', { gameId: a.gameId, secs, code: 0 }), 300);
      }
      return null;
    }
    case 'read_log': return '=== LakuenLauncher – Startprotokoll ===\nDemo-Modus: Hier erscheint die Ausgabe des Spiels.\n';
    case 'get_data_dir': return '/home/deck/.local/share/de.lakuen.launcher';
    case 'get_prefix_path': return '/home/deck/.local/share/de.lakuen.launcher/prefixes/' + a.gameId + '/pfx';
    case 'scan_folder': return [
      { path: '/home/deck/Games/Hollow/hollow.exe', name: 'Hollow', kind: 'exe', size: 1 },
      { path: '/home/deck/Apps/Krita-5.2.AppImage', name: 'Krita', kind: 'appimage', size: 1 },
    ];
    case 'path_exists': return true;
    case 'file_info': return { exists: true, isFile: true, size: 0, modified: 0 };
    case 'list_backups': return [];
    default: return null;
  }
}

function emit(ev, payload) { (mockListeners[ev] || []).forEach((cb) => cb(payload)); }
