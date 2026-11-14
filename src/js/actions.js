// Aktionen rund um Spiele: Starten/Stoppen, Hinzufügen, Scannen, Verknüpfungen, Entfernen.
import { invoke, listen, pickFiles, isTauri } from './api.js';
import {
  state, notify, gameById, addGame, updateGame, removeGame, reloadSessions, save, guessKind, guessName, setSetting,
} from './store.js';
import { toast, openModal, confirmDialog, promptDialog, contextMenu, esc, icon, fmtDuration, uid, fmtSize } from './ui.js';

let nav = () => {};
let editGame = () => {};
export function wireActions({ navigate, openEditor }) { nav = navigate; editGame = openEditor; }

// ---------- Proton ----------
export async function refreshProtons() {
  try { state.protons = (await invoke('list_proton')) || []; } catch (e) { state.protons = []; }
  return state.protons;
}

export function newestStable() {
  const stable = state.protons.filter((p) => !p.experimental);
  return stable.sort((a, b) => cmpVer(b.version, a.version))[0] || state.protons[0] || null;
}
function cmpVer(a = [], b = []) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d) return d;
  }
  return 0;
}

export function resolveProton(choice) {
  if (!choice || choice === 'auto-latest') return newestStable();
  if (choice === 'auto-experimental') return state.protons.find((p) => p.experimental) || newestStable();
  return state.protons.find((p) => p.path === choice) || { name: choice.split('/').pop(), path: choice };
}

export function protonLabel(choice) {
  if (choice === 'auto-latest') return 'Neueste Version';
  if (choice === 'auto-experimental') return 'Proton Experimental';
  return state.protons.find((p) => p.path === choice)?.name || choice?.split('/').pop() || '–';
}

export function runnerLabel(r) {
  return { auto: 'Automatisch', umu: 'umu-launcher', slr: 'Proton + Steam Runtime', proton: 'Proton direkt' }[r] || r;
}

export function resolveRequest(g) {
  const s = state.settings;
  const choice = g.proton && g.proton !== 'default' ? g.proton : s.defaultProton;
  const proton = g.kind === 'exe' ? resolveProton(choice) : null;
  const runner = g.runner && g.runner !== 'default' ? g.runner : s.defaultRunner;
  const prefix = g.prefix || (s.prefixBase ? s.prefixBase.replace(/\/+$/, '') + '/' + g.id : '');
  return {
    gameId: g.id, name: g.name, path: g.path, kind: g.kind, args: g.args || '', workdir: g.workdir || null,
    env: g.env || {}, runner: runner || 'auto', protonPath: proton?.path || null, prefixPath: prefix || null,
    mangohud: g.mangohud ?? s.mangohud, gamemode: g.gamemode ?? s.gamemode, fsr: !!g.fsr,
    framegen: Number(g.framegen ?? s.framegen ?? 0) || 0, framegenPerf: !!g.framegenPerf,
    wrapper: g.wrapper || null, preScript: g.preScript || null, postScript: g.postScript || null,
    minimizeOnLaunch: !!s.minimizeOnLaunch, restoreOnExit: !!s.restoreOnExit,
  };
}

// ---------- Starten / Stoppen ----------
export async function launch(g) {
  if (typeof g === 'string') g = gameById(g);
  if (!g) return;
  if (state.running[g.id]) { toast('Läuft bereits', g.name); return; }
  if (!g.path) { toast('Keine Datei hinterlegt', 'Bitte im Editor eine Datei wählen.', { type: 'err' }); return; }
  if (g.kind === 'exe' && state.sys?.os === 'linux' && !state.protons.length && !state.sys?.umu) {
    toast('Kein Proton gefunden', 'Installiere Proton über Steam oder GE-Proton (z. B. mit ProtonUp-Qt).', { type: 'err', timeout: 8000 });
    return;
  }
  state.running[g.id] = { gameId: g.id, started: Date.now(), starting: true };
  updateGame(g.id, { lastLaunch: Date.now() });
  notify('running');
  try {
    await invoke('launch_game', { req: resolveRequest(g) });
    toast('Wird gestartet …', g.name, { timeout: 2500 });
  } catch (e) {
    delete state.running[g.id];
    notify('running');
    toast('Start fehlgeschlagen', String(e), { type: 'err', timeout: 8000 });
  }
}

export async function stop(g) {
  if (typeof g === 'string') g = gameById(g);
  if (!g) return;
  try { await invoke('stop_game', { gameId: g.id }); toast('Wird beendet …', g.name, { timeout: 2500 }); }
  catch (e) { toast('Beenden nicht möglich', String(e), { type: 'err' }); }
}

export async function initRunEvents() {
  try {
    const list = await invoke('list_running');
    (list || []).forEach((r) => { state.running[r.gameId] = { ...r, starting: r.pid === 0 }; });
  } catch (_) {}
  await listen('game-started', (p) => {
    state.running[p.gameId] = { gameId: p.gameId, started: p.started, runner: p.runner, starting: false };
    (p.notes || []).forEach((n) => toast('Hinweis', n, { timeout: 7000 }));
    notify('running');
  });
  await listen('game-exited', async (p) => {
    delete state.running[p.gameId];
    await reloadSessions();
    notify('all');
    const g = gameById(p.gameId);
    if (state.settings.notifySessions && g) {
      if (p.secs < 5) {
        toast(`${g.name} wurde sofort beendet`, 'Im Protokoll siehst du, was passiert ist.', {
          type: 'err', timeout: 9000, actions: [{ label: 'Protokoll öffnen', primary: true, onClick: () => nav({ name: 'game', gameId: g.id, tab: 'log' }) }],
        });
      } else {
        toast('Sitzung beendet', `${g.name} · ${fmtDuration(p.secs)} gespielt`, { type: 'ok' });
      }
    }
  });
  await listen('game-error', (p) => {
    delete state.running[p.gameId];
    notify('running');
    const g = gameById(p.gameId);
    toast(`${g?.name || 'Spiel'} konnte nicht starten`, p.error, {
      type: 'err', timeout: 10000, actions: g ? [{ label: 'Einstellungen', onClick: () => editGame(g.id, 'launch') }] : [],
    });
  });
}

// ---------- Hinzufügen ----------
const FILTERS = [
  { name: 'Spiele & Apps', extensions: ['AppImage', 'appimage', 'exe', 'EXE', 'sh', 'x86_64', 'bat', 'msi'] },
  { name: 'Alle Dateien', extensions: ['*'] },
];

export async function pickAndAdd() {
  if (!isTauri) { toast('Demo-Modus', 'Dateiauswahl gibt es nur in der App.'); return; }
  const paths = await pickFiles({ multiple: true, filters: FILTERS, title: 'Spiele oder Apps hinzufügen' });
  if (paths?.length) addFromPaths(paths);
}

const IMG_RE = /\.(png|jpe?g|webp|gif|svg|avif|bmp)$/i;
export function addFromPaths(paths) {
  const files = paths.filter((p) => !IMG_RE.test(p));
  if (!files.length) return [];
  const added = [];
  for (const path of files) {
    if (state.library.games.some((g) => g.path === path)) { toast('Schon in der Bibliothek', guessName(path)); continue; }
    added.push(addGame({ path, name: guessName(path), kind: guessKind(path) }));
  }
  if (added.length === 1) {
    toast('Hinzugefügt', `${added[0].name} – jetzt Name & Artwork anpassen?`, {
      type: 'ok', timeout: 7000, actions: [{ label: 'Bearbeiten', primary: true, onClick: () => editGame(added[0].id, 'art') }],
    });
    editGame(added[0].id, 'general');
  } else if (added.length > 1) {
    toast(`${added.length} Einträge hinzugefügt`, 'Über Rechtsklick → Bearbeiten kannst du sie anpassen.', { type: 'ok' });
  }
  return added;
}

export function addMenu(x, y) {
  contextMenu(x, y, [
    { icon: 'file', label: 'Datei(en) auswählen …', onClick: pickAndAdd },
    { icon: 'scan', label: 'Ordner durchsuchen …', onClick: () => scanDialog() },
    { icon: 'folder', label: 'Beobachtete Ordner verwalten', onClick: () => nav({ name: 'settings', settingsSection: 'library' }) },
  ]);
}

// ---------- Ordner-Scan ----------
export async function scanDialog(folder = null, presetHits = null) {
  if (!folder && !presetHits) {
    if (!isTauri) { folder = '/home/deck/Games'; }
    else {
      const res = await pickFiles({ directory: true, title: 'Ordner mit Spielen wählen' });
      if (!res?.length) return;
      folder = res[0];
    }
  }
  let hits = presetHits;
  if (!hits) {
    try { hits = await invoke('scan_folder', { path: folder, maxDepth: 4 }); }
    catch (e) { toast('Scan fehlgeschlagen', String(e), { type: 'err' }); return; }
  }
  hits = hits || [];
  const known = new Set(state.library.games.map((g) => g.path));
  const rows = hits.map((h) => ({ ...h, dup: known.has(h.path), on: !known.has(h.path) && !state.settings.scanIgnored.includes(h.path) }));
  const body = document.createElement('div');
  const render = () => {
    const sel = rows.filter((r) => r.on && !r.dup).length;
    body.innerHTML = rows.length ? `
      <p class="hint" style="margin:0 0 12px">${folder ? `Gefunden in <b>${esc(folder)}</b>. ` : ''}Hake an, was in die Bibliothek soll – die Namen kannst du direkt anpassen.</p>
      <div class="toolbar" style="margin-bottom:10px"><button class="btn small" data-all>Alle</button><button class="btn small" data-none>Keine</button><span class="spacer"></span><span class="chip accent">${sel} ausgewählt</span></div>
      <div class="scan-list">${rows.map((r, i) => `
        <div class="scan-row ${r.dup ? 'dup' : ''}">
          <input type="checkbox" data-i="${i}" ${r.on && !r.dup ? 'checked' : ''} ${r.dup ? 'disabled' : ''}>
          <div style="min-width:0"><input type="text" class="input" data-n="${i}" value="${esc(r.name)}"><div class="p" title="${esc(r.path)}">${esc(r.path)}</div></div>
          <span class="chip">${r.dup ? 'Schon da' : r.kind === 'exe' ? 'Windows' : 'AppImage'}</span>
        </div>`).join('')}</div>` : `<div class="empty" style="padding:30px"><h2>Nichts gefunden</h2><p>In diesem Ordner liegen keine AppImages oder .exe-Dateien.</p></div>`;
    m.foot.querySelector('[data-add]').disabled = !sel;
    m.foot.querySelector('[data-add]').textContent = sel ? `${sel} hinzufügen` : 'Hinzufügen';
  };
  const m = openModal({
    title: `${icon('scan', 20)} Gefundene Spiele & Apps`, body, cls: 'wide',
    footer: `<div class="left">${folder ? '<label class="hint" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="sc-watch"> Ordner beobachten (beim Start nach neuen Dateien suchen)</label>' : ''}</div><button class="btn" data-c>Abbrechen</button><button class="btn primary" data-add>Hinzufügen</button>`,
  });
  body.addEventListener('change', (e) => {
    if (e.target.dataset.i !== undefined) { rows[+e.target.dataset.i].on = e.target.checked; render(); }
  });
  body.addEventListener('input', (e) => { if (e.target.dataset.n !== undefined) rows[+e.target.dataset.n].name = e.target.value; });
  body.addEventListener('click', (e) => {
    if (e.target.closest('[data-all]')) { rows.forEach((r) => { r.on = !r.dup; }); render(); }
    if (e.target.closest('[data-none]')) { rows.forEach((r) => { r.on = false; }); render(); }
  });
  m.foot.querySelector('[data-c]').onclick = m.close;
  m.foot.querySelector('[data-add]').onclick = () => {
    const chosen = rows.filter((r) => r.on && !r.dup);
    chosen.forEach((r) => addGame({ path: r.path, name: r.name.trim() || guessName(r.path), kind: r.kind }));
    // Nicht gewählte merken, damit sie nicht immer wieder vorgeschlagen werden
    const ignored = rows.filter((r) => !r.on && !r.dup).map((r) => r.path);
    if (ignored.length) setSetting('scanIgnored', [...new Set([...state.settings.scanIgnored, ...ignored])]);
    const watch = m.foot.querySelector('#sc-watch')?.checked;
    if (watch && folder && !state.settings.watchFolders.includes(folder)) setSetting('watchFolders', [...state.settings.watchFolders, folder]);
    state.scanFound = [];
    notify('library');
    m.close();
    toast(`${chosen.length} hinzugefügt`, 'Viel Spaß!', { type: 'ok' });
  };
  render();
}

/** Beobachtete Ordner beim Start prüfen. */
export async function scanWatchFolders(silent = true) {
  const found = [];
  const known = new Set(state.library.games.map((g) => g.path));
  for (const f of state.settings.watchFolders) {
    try {
      const hits = await invoke('scan_folder', { path: f, maxDepth: 4 });
      (hits || []).forEach((h) => { if (!known.has(h.path) && !state.settings.scanIgnored.includes(h.path)) found.push(h); });
    } catch (_) {}
  }
  state.scanFound = found;
  notify('scan');
  if (found.length) {
    toast(`${found.length} neue ${found.length === 1 ? 'Datei' : 'Dateien'} gefunden`, 'In deinen beobachteten Ordnern ist etwas Neues aufgetaucht.', {
      timeout: 9000, actions: [{ label: 'Ansehen', primary: true, onClick: () => scanDialog(null, found) }],
    });
  } else if (!silent) toast('Keine neuen Dateien', 'Alles ist schon in der Bibliothek.');
}

// ---------- Weitere Aktionen ----------
export function toggleFavorite(g) {
  updateGame(g.id, { favorite: !g.favorite });
}

export async function deleteGame(g) {
  const res = await confirmDialog('Aus der Bibliothek entfernen?', `<b>${esc(g.name)}</b> wird aus dem Launcher entfernt. Die Spieldatei selbst bleibt unangetastet.`, {
    ok: 'Entfernen', danger: true, extra: g.kind === 'exe' ? 'Auch den Wine-Prefix (Spielstände im Prefix!) löschen' : 'Auch die Spielzeit-Statistik löschen',
  });
  if (!res) return;
  if (g.kind === 'exe' && res.extra) {
    try { await invoke('delete_prefix', { gameId: g.id, custom: g.prefix || null }); } catch (e) { toast('Prefix nicht gelöscht', String(e), { type: 'err' }); }
  }
  if (g.kind !== 'exe' && res.extra) {
    state.sessions = state.sessions.filter((s) => s.gameId !== g.id);
    save('sessions');
  }
  try { await invoke('delete_game_data', { gameId: g.id, deletePrefix: false }); } catch (_) {}
  try { await invoke('remove_desktop_entry', { gameId: g.id }); } catch (_) {}
  removeGame(g.id);
  if (state.view.gameId === g.id) nav({ name: 'library' });
  toast('Entfernt', g.name);
}

export async function createShortcut(g, onDesktop = false) {
  try {
    const icon = g.art?.icon || g.art?.cover || null;
    await invoke('create_desktop_entry', { gameId: g.id, name: g.name, icon, onDesktop });
    toast('Verknüpfung erstellt', onDesktop ? 'Im Startmenü und auf dem Desktop. Tipp: In Steam über „Ein Nicht-Steam-Spiel hinzufügen“ einbinden.' : 'Im Startmenü. Tipp: In Steam über „Ein Nicht-Steam-Spiel hinzufügen“ einbinden.', { type: 'ok', timeout: 8000 });
  } catch (e) { toast('Verknüpfung fehlgeschlagen', String(e), { type: 'err' }); }
}

export async function addToCollection(g) {
  const cols = state.library.collections;
  const body = document.createElement('div');
  const draw = () => {
    body.innerHTML = `${cols.length ? cols.map((c) => `<label class="toggle-line"><div><b>${esc(c.name)}</b></div><span class="switch"><input type="checkbox" data-c="${c.id}" ${g.collections.includes(c.id) ? 'checked' : ''}><span></span></span></label>`).join('') : '<p class="hint">Noch keine Sammlungen.</p>'}
      <button class="btn small" data-new style="margin-top:12px">${icon('plus', 14)} Neue Sammlung</button>`;
  };
  draw();
  const m = openModal({ title: 'Sammlungen', body, cls: 'narrow', footer: '<button class="btn primary" data-ok>Fertig</button>' });
  body.addEventListener('change', (e) => {
    const id = e.target.dataset.c; if (!id) return;
    const set = new Set(g.collections);
    e.target.checked ? set.add(id) : set.delete(id);
    updateGame(g.id, { collections: [...set] });
  });
  body.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-new]')) return;
    const name = await promptDialog('Neue Sammlung', { placeholder: 'z. B. Koop-Abende', ok: 'Anlegen' });
    if (!name) return;
    const c = { id: uid(), name };
    state.library.collections.push(c);
    updateGame(g.id, { collections: [...g.collections, c.id] });
    draw();
  });
  m.foot.querySelector('[data-ok]').onclick = m.close;
}

export async function newCollection() {
  const name = await promptDialog('Neue Sammlung', { placeholder: 'z. B. Koop-Abende', ok: 'Anlegen' });
  if (!name) return;
  const c = { id: uid(), name };
  state.library.collections.push(c);
  save('library');
  notify('library');
  nav({ name: 'library', filter: 'col:' + c.id });
}

export async function collectionMenu(x, y, c) {
  contextMenu(x, y, [
    { icon: 'edit', label: 'Umbenennen', onClick: async () => {
      const n = await promptDialog('Sammlung umbenennen', { value: c.name });
      if (n) { c.name = n; save('library'); notify('library'); }
    } },
    { icon: 'trash', label: 'Sammlung löschen', danger: true, onClick: async () => {
      if (!(await confirmDialog('Sammlung löschen?', `Die Spiele bleiben in der Bibliothek, nur die Sammlung „${esc(c.name)}“ verschwindet.`, { ok: 'Löschen', danger: true }))) return;
      state.library.collections = state.library.collections.filter((x) => x.id !== c.id);
      state.library.games.forEach((g) => { g.collections = g.collections.filter((id) => id !== c.id); });
      save('library'); notify('library');
      if (state.view.filter === 'col:' + c.id) nav({ name: 'library', filter: 'all' });
    } },
  ]);
}

export function gameMenu(x, y, g) {
  const running = !!state.running[g.id];
  contextMenu(x, y, [
    running ? { icon: 'stop', label: 'Beenden', onClick: () => stop(g) } : { icon: 'play', label: 'Spielen', onClick: () => launch(g) },
    { icon: 'info', label: 'Details', onClick: () => nav({ name: 'game', gameId: g.id }) },
    { icon: 'edit', label: 'Bearbeiten', onClick: () => editGame(g.id) },
    { icon: 'image', label: 'Artwork ändern', onClick: () => editGame(g.id, 'art') },
    { icon: 'sparkle', label: 'Artwork generieren', onClick: () => import('./artgen.js').then((m) => m.openGenerator(g.id)) },
    { icon: 'tag', label: 'Status …', onClick: () => statusDialog(g) },
    '-',
    { icon: g.favorite ? 'starFill' : 'star', label: g.favorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten', onClick: () => toggleFavorite(g) },
    { icon: 'layers', label: 'Sammlungen …', onClick: () => addToCollection(g) },
    { icon: g.hidden ? 'eye' : 'eyeOff', label: g.hidden ? 'Wieder anzeigen' : 'Ausblenden', onClick: () => updateGame(g.id, { hidden: !g.hidden }) },
    '-',
    { icon: 'folder', label: 'Dateiordner öffnen', onClick: () => invoke('reveal_path', { path: g.path }).catch((e) => toast('Fehler', String(e), { type: 'err' })) },
    state.sys?.desktopEntries ? { icon: 'link', label: 'Verknüpfung erstellen', onClick: () => createShortcut(g, true) } : null,
    '-',
    { icon: 'trash', label: 'Entfernen', danger: true, onClick: () => deleteGame(g) },
  ]);
}

export async function randomGame() {
  const list = state.library.games.filter((g) => !g.hidden);
  if (!list.length) return;
  const g = list[Math.floor(Math.random() * list.length)];
  nav({ name: 'game', gameId: g.id });
  toast('Zufallsauswahl 🎲', `Wie wäre es mit ${g.name}?`);
}

export { fmtSize };

export async function statusDialog(g) {
  const { STATUSES } = await import('./editor.js');
  const body = document.createElement('div');
  body.className = 'kind-pick';
  body.innerHTML = STATUSES.map(([v, l]) => `<button class="kind-opt ${g.status === v ? 'on' : ''}" data-s="${v}"><b>${l}</b></button>`).join('');
  const m = openModal({ title: `Status: ${esc(g.name)}`, body, cls: 'narrow', footer: null });
  body.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => { updateGame(g.id, { status: b.dataset.s }); m.close(); });
}
