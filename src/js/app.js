// LakuenLauncher – erstellt von Dominic Lesina x Claude
import { invoke, appVersion, onDragDrop, isTauri, fileSrc, listen } from './api.js';
import { state, loadAll, subscribe, gameById, lastPlayed, visibleGames } from './store.js';
import { icon, esc, h, toast, closeTopModal, hasModal, closeContext, fmtClock, blurred } from './ui.js';
import { applyTheme } from './themes.js';
import {
  wireActions, refreshProtons, initRunEvents, addFromPaths, pickAndAdd, scanDialog, scanWatchFolders,
  newCollection, collectionMenu, launch, randomGame,
} from './actions.js';
import { openEditor, isEditorOpen, handleEditorDrop } from './editor.js';
import { askDropArtwork } from './artwork.js';
import { wireLibrary, renderLibraryTop, renderLibraryContent, renderDetailTop, renderDetail } from './library.js';
import { wireStats, renderStatsTop, renderStats } from './stats.js';
import { wireSettings, renderSettingsTop, renderSettings } from './settings.js';
import { wireExtras, openPalette, closePalette, isPaletteOpen, startTour, isTourOpen, initGamepad } from './extras.js';
import { autoCheck, installUpdate, restartNow, prettyVersion } from './updates.js';

const app = document.getElementById('app');
let sidebarEl, topEl, contentEl;

function navigate(v) {
  const prev = state.view;
  state.view = { ...prev, tab: 'overview', ...v };
  if (v.name === 'library' && v.filter === undefined) state.view.filter = prev.name === 'library' ? prev.filter : (prev.filter || 'all');
  closeContext();
  render(true);
}
window.addEventListener('lakuen:nav', (e) => navigate(e.detail));

function shell() {
  app.innerHTML = `
    <aside class="sidebar"></aside>
    <main class="main"><header class="topbar"></header><section class="content"></section></main>
    <div class="drop-zone" id="drop"><div><div style="color:var(--accent)">${icon('download', 56)}</div><h2>Loslassen zum Hinzufügen</h2><p class="hint" id="drop-hint">AppImages, .exe-Dateien – oder Bilder für das Artwork</p></div></div>`;
  sidebarEl = app.querySelector('.sidebar');
  topEl = app.querySelector('.topbar');
  contentEl = app.querySelector('.content');
}

function renderSidebar() {
  const v = state.view;
  const f = v.filter || 'all';
  const count = (fn) => state.library.games.filter((g) => !g.hidden && fn(g)).length;
  const runningIds = Object.keys(state.running);
  const rg = runningIds.length ? gameById(runningIds[0]) : null;
  const item = (key, label, ic, active, extra = '') => `<button class="nav-item ${active ? 'active' : ''}" data-nav="${key}">${icon(ic, 18)}<span>${label}</span>${extra}</button>`;
  sidebarEl.innerHTML = `
    <div class="brand"><img src="assets/logo.svg" alt=""><div><div class="name">Lakuen<span>Launcher</span></div><div class="sub">Spiele & Apps</div></div></div>
    <button class="search-btn" data-tour="search-btn" id="sb-search">${icon('search', 16)} Suchen … <kbd>Strg K</kbd></button>
    <div class="nav-scroll">
      ${item('library', 'Bibliothek', 'grid', v.name === 'library' && f === 'all', `<span class="count">${count(() => true)}</span>`)}
      ${item('favorites', 'Favoriten', 'star', v.name === 'library' && f === 'favorites', `<span class="count">${count((g) => g.favorite) || ''}</span>`)}
      ${item('recent', 'Zuletzt gespielt', 'clock', v.name === 'library' && f === 'recent')}
      ${item('stats', 'Statistik', 'chart', v.name === 'stats')}
      <div class="nav-label">Sammlungen <button id="sb-newcol" title="Neue Sammlung">${icon('plus', 15)}</button></div>
      ${state.library.collections.length ? state.library.collections.map((c) => `<button class="nav-item ${f === 'col:' + c.id && v.name === 'library' ? 'active' : ''}" data-col="${c.id}">${icon('layers', 17)}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.name)}</span><span class="count">${count((g) => g.collections.includes(c.id)) || ''}</span></button>`).join('')
        : '<div class="hint" style="padding:2px 12px 6px">Eigene Gruppen wie „Koop“ oder „Retro“.</div>'}
    </div>
    <div class="sidebar-foot">
      <div class="running-pill ${rg ? 'on' : ''}" id="sb-running">${rg ? `<span class="dot"></span><div style="min-width:0"><div class="t">Läuft · <span data-live="${rg.id}">${fmtClock((Date.now() - state.running[rg.id].started) / 1000)}</span></div><div class="n">${esc(rg.name)}</div></div>` : ''}</div>
      ${item('settings', 'Einstellungen', 'settings', v.name === 'settings', state.update ? '<span class="count" style="color:var(--accent)">●</span>' : '')}
      ${state.update ? `<button class="update-pill" id="sb-upd">${icon(state.updateProgress?.ready ? 'refresh' : 'download', 16)}<div><b>${state.updateProgress?.ready ? 'Neu starten' : state.updateProgress?.running ? `Update lädt … ${state.updateProgress.total ? Math.round((state.updateProgress.done || 0) / state.updateProgress.total * 100) : 0}%` : 'Update verfügbar'}</b><span>v${esc(state.update.version)} · 1 Klick</span></div></button>` : ''}
      <div class="version-tag"><span>${esc(prettyVersion(state.version))}</span><span>Dominic Lesina x Claude</span></div>
    </div>`;
  sidebarEl.querySelectorAll('[data-nav]').forEach((b) => b.onclick = () => {
    const k = b.dataset.nav;
    if (k === 'stats') navigate({ name: 'stats' });
    else if (k === 'settings') navigate({ name: 'settings' });
    else navigate({ name: 'library', filter: k === 'library' ? 'all' : k });
  });
  sidebarEl.querySelectorAll('[data-col]').forEach((b) => {
    b.onclick = () => navigate({ name: 'library', filter: 'col:' + b.dataset.col });
    b.oncontextmenu = (e) => { e.preventDefault(); const c = state.library.collections.find((x) => x.id === b.dataset.col); if (c) collectionMenu(e.clientX, e.clientY, c); };
  });
  sidebarEl.querySelector('#sb-search').onclick = openPalette;
  sidebarEl.querySelector('#sb-newcol').onclick = newCollection;
  sidebarEl.querySelector('#sb-running').onclick = () => rg && navigate({ name: 'game', gameId: rg.id });
  sidebarEl.querySelector('#sb-upd')?.addEventListener('click', () => {
    if (state.updateProgress?.ready) return restartNow();
    navigate({ name: 'settings', settingsSection: 'updates' });
    installUpdate();
  });
}

function render(scrollTop = false) {
  // Einblend-Animationen nur bei echter Navigation, nicht bei jedem Aktualisieren
  contentEl.classList.toggle('static', !scrollTop);
  renderSidebar();
  topEl.style.display = '';
  const v = state.view.name;
  if (v === 'library') { renderLibraryTop(topEl); renderLibraryContent(contentEl); }
  else if (v === 'game') { renderDetailTop(topEl); renderDetail(contentEl); }
  else if (v === 'stats') { renderStatsTop(topEl); renderStats(contentEl); }
  else if (v === 'settings') { renderSettingsTop(topEl); renderSettings(contentEl); }
  if (scrollTop) contentEl.scrollTop = 0;
  updateAmbient();
}

function updateAmbient() {
  const el = document.querySelector('#ambient .ambient-img');
  if (!el) return;
  let g = null;
  if (state.settings.ambient) {
    if (state.view.name === 'game') g = gameById(state.view.gameId);
    else g = [...state.library.games].filter((x) => lastPlayed(x) && (x.art?.hero || x.art?.cover)).sort((a, b) => lastPlayed(b) - lastPlayed(a))[0];
  }
  const src = g ? fileSrc(g.art?.hero || g.art?.cover) : null;
  if (!src || state.settings.lite) { el.classList.remove('on'); el.dataset.src = ''; return; }
  if (el.dataset.src === src) return; // nichts geändert -> nicht neu zeichnen
  el.dataset.src = src;
  blurred(src).then((url) => {
    if (el.dataset.src !== src || !url) return;
    if (url === 'CSS') { el.style.backgroundImage = `url('${src}')`; el.style.filter = 'blur(60px)'; }
    else { el.style.backgroundImage = `url('${url}')`; el.style.filter = ''; }
    el.classList.add('on');
  });
}

// Bei Datenänderungen gezielt neu zeichnen (Suchfeld behält den Fokus)
subscribe((what) => {
  if (what === 'update-progress') { window.__lakuenUpdateBox?.(); renderSidebar(); return; }
  if (what === 'settings') { applyTheme(); }
  const active = document.activeElement;
  const searching = active?.id === 'lib-search';
  if (searching && (what === 'library' || what === 'running')) { renderSidebar(); renderLibraryContent(contentEl); return; }
  if (state.view.name === 'settings' && what === 'settings') { renderSidebar(); return; }
  if (isEditorOpen() && what === 'library') { renderSidebar(); if (state.view.name !== 'settings') { const st = contentEl.scrollTop; render(); contentEl.scrollTop = st; } return; }
  const st = contentEl.scrollTop;
  render();
  contentEl.scrollTop = st;
});

// Live-Timer für laufende Spiele – läuft nur, wenn wirklich ein Spiel läuft und das Fenster sichtbar ist
let liveTimer = null;
function tickLive() {
  document.querySelectorAll('[data-live]').forEach((el) => {
    const r = state.running[el.dataset.live];
    if (r) el.textContent = fmtClock((Date.now() - r.started) / 1000);
  });
}
function updateLiveTimer() {
  const need = Object.keys(state.running).length > 0 && !document.hidden;
  if (need && !liveTimer) liveTimer = setInterval(tickLive, 1000);
  if (!need && liveTimer) { clearInterval(liveTimer); liveTimer = null; }
}
subscribe(updateLiveTimer);

// Ruhemodus: im Hintergrund / minimiert alle Animationen anhalten
function setIdle(idle) {
  document.body.classList.toggle('idle', idle);
  updateLiveTimer();
  if (!idle) tickLive();
}
document.addEventListener('visibilitychange', () => setIdle(document.hidden));
window.addEventListener('blur', () => setIdle(true));
window.addEventListener('focus', () => setIdle(false));

// ---------- Tastatur ----------
window.addEventListener('keydown', (e) => {
  if (isTourOpen()) return;
  const ctrl = e.ctrlKey || e.metaKey;
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
  if (ctrl && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
  if (e.key === 'Escape') {
    if (isPaletteOpen()) { closePalette(); return; }
    if (hasModal()) { closeTopModal(); return; }
    if (document.activeElement?.id === 'lib-search' && state.search) { state.search = ''; render(); return; }
    if (state.view.name !== 'library') { navigate({ name: 'library' }); return; }
  }
  if (hasModal() || isPaletteOpen()) return;
  if (ctrl && e.key.toLowerCase() === 'f') { e.preventDefault(); if (state.view.name !== 'library') navigate({ name: 'library' }); setTimeout(() => document.getElementById('lib-search')?.focus(), 30); return; }
  if (ctrl && e.shiftKey && e.key.toLowerCase() === 'n') { e.preventDefault(); scanDialog(); return; }
  if (ctrl && e.key.toLowerCase() === 'n') { e.preventDefault(); pickAndAdd(); return; }
  if (ctrl && e.key === '1') { e.preventDefault(); navigate({ name: 'library', filter: 'all' }); return; }
  if (ctrl && e.key === '2') { e.preventDefault(); navigate({ name: 'stats' }); return; }
  if (ctrl && e.key === ',') { e.preventDefault(); navigate({ name: 'settings' }); return; }
  if (ctrl && e.key.toLowerCase() === 'r') { e.preventDefault(); randomGame(); return; }
  if (!typing && !ctrl && state.view.name === 'library' && e.key.length === 1 && /\S/.test(e.key)) {
    // Einfach lostippen = suchen
    const inp = document.getElementById('lib-search');
    if (inp && !document.activeElement?.closest?.('.card, .list-row')) { inp.focus(); }
  }
});

// Rechtsklick außerhalb von Karten: Browser-Menü unterdrücken (fühlt sich nativer an)
window.addEventListener('contextmenu', (e) => {
  if (!e.target.closest('input, textarea, .log-view, .changelog')) e.preventDefault();
});

// ---------- Drag & Drop ----------
const IMG = /\.(png|jpe?g|webp|gif|svg|avif|bmp)$/i;

/** Element unter der Drop-Position finden (Tauri liefert physische Pixel) */
function cardAt(pos) {
  if (!pos) return null;
  const tries = [[pos.x / devicePixelRatio, pos.y / devicePixelRatio], [pos.x, pos.y]];
  for (const [x, y] of tries) {
    const el = document.elementFromPoint(x, y);
    const card = el?.closest?.('[data-id], [data-continue]');
    if (card) return card;
  }
  return null;
}

async function initDrop() {
  const zone = document.getElementById('drop');
  const hint = document.getElementById('drop-hint');
  let images = false;
  let target = null;
  const setTarget = (el) => {
    if (target === el) return;
    target?.classList.remove('drop-target');
    target = el;
    target?.classList.add('drop-target');
    if (images && !isEditorOpen()) {
      const g = el ? gameById(el.dataset.id || el.dataset.continue) : (state.view.name === 'game' ? gameById(state.view.gameId) : null);
      hint.textContent = g ? `Loslassen: Artwork für „${g.name}“` : 'Bild auf ein Spiel ziehen, um es als Artwork zu verwenden';
    }
  };
  await onDragDrop(async (ev) => {
    if (ev.type === 'enter') {
      images = ev.paths.length > 0 && ev.paths.every((p) => IMG.test(p));
      zone.classList.toggle('mini', images);
      hint.textContent = isEditorOpen() && images ? 'Bild wird als Artwork übernommen'
        : images ? 'Bild auf ein Spiel ziehen, um es als Artwork zu verwenden'
        : 'AppImages und .exe-Dateien werden zur Bibliothek hinzugefügt';
      zone.classList.add('on');
    } else if (ev.type === 'over') {
      if (images && !isEditorOpen()) setTarget(cardAt(ev.position));
    } else if (ev.type === 'leave') {
      zone.classList.remove('on');
      setTarget(null);
    } else if (ev.type === 'drop') {
      zone.classList.remove('on');
      const card = images ? (target || cardAt(ev.position)) : null;
      setTarget(null);
      if (!ev.paths?.length) return;
      if (await handleEditorDrop(ev.paths, ev.position)) return;
      const imgs = ev.paths.filter((p) => IMG.test(p));
      const files = ev.paths.filter((p) => !IMG.test(p));
      if (files.length) {
        // Ordner? → Scan anbieten
        const info = await invoke('file_info', { path: files[0] }).catch(() => null);
        if (info && info.exists && !info.isFile) { scanDialog(files[0]); return; }
        addFromPaths(files);
        return;
      }
      const gameId = card ? (card.dataset.id || card.dataset.continue) : (state.view.name === 'game' ? state.view.gameId : null);
      if (imgs.length && gameId) askDropArtwork(gameId, imgs[0]);
      else if (imgs.length) toast('Auf ein Spiel ziehen', 'Lass das Bild direkt über einer Spielkarte los – dann wird es dessen Artwork.');
    }
  });
}

// ---------- Start ----------
async function boot() {
  wireActions({ navigate, openEditor });
  wireLibrary({ navigate });
  wireStats({ navigate });
  wireSettings({ navigate, tour: startTour });
  wireExtras({ navigate });
  try {
    state.version = await appVersion();
    await loadAll();
  } catch (e) {
    console.error(e);
    toast('Daten konnten nicht geladen werden', String(e), { type: 'err' });
  }
  applyTheme();
  try { state.sys = await invoke('system_info'); } catch (_) { state.sys = { os: 'linux' }; }
  await refreshProtons();
  shell();
  render();
  await initRunEvents();
  await initDrop();
  initGamepad();
  if (!isTauri) toast('Demo-Modus', 'Vorschau im Browser mit Beispieldaten – Starten geht nur in der App.', { timeout: 6000 });

  // Verknüpfung gestartet, während der Launcher schon offen ist
  await listen('launch-request', (id) => { if (gameById(id)) { navigate({ name: 'game', gameId: id }); launch(id); } });

  // Desktop-Verknüpfung: --launch <id>
  try {
    const pending = await invoke('take_pending_launch');
    if (pending && gameById(pending)) { navigate({ name: 'game', gameId: pending }); launch(pending); }
  } catch (_) {}

  if (!state.settings.tutorialDone) setTimeout(() => startTour(), 600);
  if (state.settings.scanOnStart && state.settings.watchFolders.length) setTimeout(() => scanWatchFolders(true), 1500);
  autoCheck();
}

boot();
