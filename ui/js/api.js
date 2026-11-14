// Verbindung zum Rust-Backend. Läuft die Oberfläche ohne Tauri (z. B. im Browser
// zur Vorschau), springt eine Attrappe mit Beispieldaten ein.

const T = window.__TAURI__;
export const isTauri = !!(T && T.core);

export async function call(cmd, args = {}) {
  if (isTauri) return T.core.invoke(cmd, args);
  return mock(cmd, args);
}

export function fileSrc(path) {
  if (!path) return "";
  if (/^(data:|https?:|blob:)/.test(path)) return path;
  return isTauri ? T.core.convertFileSrc(path) : path;
}

const mockListeners = {};
export function listen(event, cb) {
  if (isTauri) return T.event.listen(event, (e) => cb(e.payload));
  (mockListeners[event] ||= []).push(cb);
}
function mockEmit(event, payload) {
  (mockListeners[event] || []).forEach((cb) => cb(payload));
}

export async function openDialog(options) {
  if (isTauri) return T.core.invoke("plugin:dialog|open", { options });
  return null;
}
export async function saveDialog(options) {
  if (isTauri) return T.core.invoke("plugin:dialog|save", { options });
  return null;
}
export async function notify(title, body) {
  if (!isTauri) return;
  try {
    await T.core.invoke("plugin:notification|notify", { options: { title, body } });
  } catch (e) {
    console.warn("Benachrichtigung fehlgeschlagen", e);
  }
}
export const appWindow = {
  async minimize() {
    if (isTauri) try { await T.window.getCurrentWindow().minimize(); } catch (e) { console.warn(e); }
  },
  async restore() {
    if (!isTauri) return;
    try {
      const w = T.window.getCurrentWindow();
      await w.unminimize();
      await w.setFocus();
    } catch (e) { console.warn(e); }
  },
};

/* ------------------------------------------------------------------ */
/* Attrappe für die Browser-Vorschau                                    */
/* ------------------------------------------------------------------ */
const mem = {};
function mockSeed() {
  if (mem.seeded) return;
  mem.seeded = true;
  const names = [
    ["Sternenmeer Odyssee", "exe"], ["Pixel Garden", "appimage"], ["Nachtfalter", "exe"],
    ["Eiswüste Protokoll", "exe"], ["Lumen Drift", "appimage"], ["Kirschblüten Dojo", "exe"],
    ["Rostige Zahnräder", "exe"], ["Kraken & Kompass", "appimage"], ["Neon Kurier", "exe"],
  ];
  const now = Date.now();
  const games = names.map(([name, kind], i) => ({
    id: "demo-" + i, name, kind,
    path: kind === "exe" ? `/home/deck/Games/${name}/game.exe` : `/home/deck/Apps/${name.replace(/ /g, "_")}-x86_64.AppImage`,
    addedAt: now - (30 - i) * 86400000, favorite: i === 0 || i === 4, collections: i % 3 === 0 ? ["Abenteuer"] : i % 3 === 1 ? ["Indie"] : ["Abenteuer", "Koop"],
    artwork: {}, launch: {},
  }));
  const sessions = [];
  for (let d = 0; d < 140; d++) {
    if (Math.random() < 0.38) continue;
    const n = 1 + Math.floor(Math.random() * 2);
    for (let k = 0; k < n; k++) {
      const g = games[Math.floor(Math.pow(Math.random(), 1.7) * games.length)];
      const start = now - d * 86400000 - Math.floor(Math.random() * 6) * 3600000 - 3600000 * 2;
      const seconds = 600 + Math.floor(Math.random() * 9000);
      sessions.push({ gameId: g.id, start, end: start + seconds * 1000, seconds });
    }
  }
  mem.library = JSON.stringify({ version: 1, games });
  mem.sessions = JSON.stringify(sessions);
}

async function mock(cmd, args) {
  mockSeed();
  switch (cmd) {
    case "load_data": return mem[args.name] ?? null;
    case "save_data": mem[args.name] = args.content; return null;
    case "data_dir": return "/home/deck/.local/share/de.lesina.lakuenlauncher";
    case "list_proton": return [
      { name: "Proton - Experimental", path: "/home/deck/.steam/steam/steamapps/common/Proton - Experimental", kind: "experimental" },
      { name: "Proton 10.0", path: "/home/deck/.steam/steam/steamapps/common/Proton 10.0", kind: "official" },
      { name: "Proton 9.0", path: "/home/deck/.steam/steam/steamapps/common/Proton 9.0 (Beta)", kind: "official" },
      { name: "GE-Proton10-4", path: "/home/deck/.steam/steam/compatibilitytools.d/GE-Proton10-4", kind: "ge" },
    ];
    case "detect_tools": return { umu: true, mangohud: true, gamemode: false, winetricks: true, steam_root: "/home/deck/.steam/steam" };
    case "system_info": return { os: "linux", version: "0.1.0", appimage: false, steamOs: true };
    case "running_games": return [];
    case "take_pending_launch": return null;
    case "list_themes": return [];
    case "read_log": return "=== LakuenLauncher 0.1.0 – Demo ===\nProton: Proton - Experimental\nStart über umu-launcher\n";
    case "inspect_file": return { path: args.path, name: "Neues Spiel", kind: "exe", size: 1 };
    case "scan_folder": return [];
    case "launch_game": {
      const started = Date.now();
      setTimeout(() => mockEmit("game-started", { id: args.req.id, started }), 50);
      setTimeout(() => {
        const ended = Date.now();
        const seconds = Math.round((ended - started) / 1000);
        const list = JSON.parse(mem.sessions || "[]");
        list.push({ gameId: args.req.id, start: started, end: ended, seconds });
        mem.sessions = JSON.stringify(list);
        mockEmit("game-exited", { id: args.req.id, started, ended, seconds, exitCode: 0 });
      }, 6000);
      return started;
    }
    default: return null;
  }
}
