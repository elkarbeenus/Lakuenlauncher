// Befehlspalette (Strg+K), Tutorial (einmalig + über Einstellungen) und Controller-Steuerung.
import { state, setSetting, gameStats, lastPlayed } from './store.js';
import { icon, esc, h, coverHTML, fmtDuration, kindLabel, hasModal, closeTopModal } from './ui.js';
import { launch, stop, pickAndAdd, scanDialog, randomGame, toggleFavorite } from './actions.js';
import { allThemes, applyTheme } from './themes.js';
import { checkUpdates } from './updates.js';

let nav = () => {};
export function wireExtras({ navigate }) { nav = navigate; }

// ---------------- Befehlspalette ----------------
let paletteEl = null;
export function openPalette() {
  if (paletteEl) { closePalette(); return; }
  const back = h(`<div class="modal-back palette-back"><div class="palette">
    <div class="pin">${icon('search', 20)}<input placeholder="Spiel starten, Seite öffnen, Befehl ausführen …" autofocus></div>
    <div class="res"></div>
    <div class="foot"><span><kbd>↑</kbd><kbd>↓</kbd> Auswählen</span><span><kbd>Enter</kbd> Ausführen</span><span><kbd>Umschalt</kbd>+<kbd>Enter</kbd> Details</span><span><kbd>Esc</kbd> Schließen</span></div>
  </div></div>`);
  paletteEl = back;
  document.getElementById('overlay-root').append(back);
  const inp = back.querySelector('input');
  const res = back.querySelector('.res');
  let items = [];
  let sel = 0;

  const actions = [
    { label: 'Spiel oder App hinzufügen', sub: 'Strg+N', icon: 'plus', run: pickAndAdd },
    { label: 'Ordner nach Spielen durchsuchen', sub: 'Strg+Umschalt+N', icon: 'scan', run: () => scanDialog() },
    { label: 'Bibliothek', sub: 'Strg+1', icon: 'grid', run: () => nav({ name: 'library', filter: 'all' }) },
    { label: 'Favoriten', icon: 'star', run: () => nav({ name: 'library', filter: 'favorites' }) },
    { label: 'Statistik', sub: 'Strg+2', icon: 'chart', run: () => nav({ name: 'stats' }) },
    { label: 'Einstellungen', sub: 'Strg+,', icon: 'settings', run: () => nav({ name: 'settings' }) },
    { label: 'Zufälliges Spiel', sub: 'Strg+R', icon: 'random', run: randomGame },
    { label: 'Nach Updates suchen', icon: 'download', run: () => checkUpdates({ manual: true }) },
    { label: 'Tutorial zeigen', icon: 'sparkle', run: () => { nav({ name: 'library', filter: 'all' }); setTimeout(() => startTour(true), 250); } },
    ...allThemes().map((t) => ({ label: `Theme: ${t.name}`, sub: t.mode === 'light' ? 'Hell' : 'Dunkel', icon: 'palette', run: () => { setSetting('theme', t.id); applyTheme(); } })),
  ];

  const draw = () => {
    const q = inp.value.trim().toLowerCase();
    const gamesList = state.library.games
      .filter((g) => !q || g.name.toLowerCase().includes(q))
      .sort((a, b) => (q ? a.name.toLowerCase().indexOf(q) - b.name.toLowerCase().indexOf(q) : 0) || lastPlayed(b) - lastPlayed(a))
      .slice(0, q ? 8 : 5);
    const acts = actions.filter((a) => !q || a.label.toLowerCase().includes(q)).slice(0, q ? 8 : 6);
    items = [
      ...gamesList.map((g) => ({ type: 'game', g, run: () => (state.running[g.id] ? stop(g) : launch(g)), alt: () => nav({ name: 'game', gameId: g.id }) })),
      ...acts.map((a) => ({ type: 'act', ...a })),
    ];
    sel = Math.min(sel, Math.max(0, items.length - 1));
    let html = '';
    if (gamesList.length) html += `<div class="grp">${q ? 'Spiele' : 'Zuletzt gespielt'}</div>`;
    items.forEach((it, i) => {
      if (it.type === 'act' && (i === 0 || items[i - 1].type === 'game')) html += '<div class="grp">Befehle</div>';
      if (it.type === 'game') {
        const st = gameStats(it.g.id);
        html += `<div class="it ${i === sel ? 'sel' : ''}" data-i="${i}"><div class="ic">${coverHTML(it.g, { kind: 'icon' })}</div><div class="t"><b>${esc(it.g.name)}</b><small>${kindLabel(it.g.kind)} · ${fmtDuration(st.secs)}</small></div>${state.running[it.g.id] ? '<span class="chip ok">Läuft · Beenden</span>' : `<span class="chip">${icon('play', 11)} Spielen</span>`}</div>`;
      } else {
        html += `<div class="it ${i === sel ? 'sel' : ''}" data-i="${i}"><div class="ic">${icon(it.icon, 18)}</div><div class="t"><b>${esc(it.label)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</div></div>`;
      }
    });
    res.innerHTML = html || '<div class="grp">Keine Treffer</div>';
    res.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
  };
  const run = (alt) => {
    const it = items[sel];
    if (!it) return;
    closePalette();
    if (alt && it.alt) it.alt(); else it.run();
  };
  inp.addEventListener('input', () => { sel = 0; draw(); });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % Math.max(1, items.length); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + items.length) % Math.max(1, items.length); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(e.shiftKey); }
    else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
  });
  res.addEventListener('mousemove', (e) => { const it = e.target.closest('[data-i]'); if (it && +it.dataset.i !== sel) { sel = +it.dataset.i; res.querySelectorAll('.it').forEach((x) => x.classList.toggle('sel', +x.dataset.i === sel)); } });
  res.addEventListener('click', (e) => { const it = e.target.closest('[data-i]'); if (it) { sel = +it.dataset.i; run(false); } });
  back.addEventListener('mousedown', (e) => { if (e.target === back) closePalette(); });
  draw();
  setTimeout(() => inp.focus(), 20);
}
export function closePalette() { paletteEl?.remove(); paletteEl = null; }
export function isPaletteOpen() { return !!paletteEl; }

// ---------------- Tutorial ----------------
const STEPS = [
  { welcome: true, title: 'Willkommen bei LakuenLauncher', text: 'Dein Paradies für Spiele und Apps: AppImages und Windows-Spiele an einem Ort – mit eigenem Artwork und Spielzeit-Statistik. Alles bleibt lokal bei dir. Die Tour dauert eine Minute.' },
  { sel: '[data-tour="add"]', title: 'Spiele hinzufügen', text: 'Hier fügst du AppImages oder .exe-Dateien hinzu – oder lässt einen ganzen Ordner durchsuchen. Noch schneller: Dateien einfach ins Fenster ziehen.' },
  { sel: '[data-tour="grid"], .empty', title: 'Deine Bibliothek', text: 'Klick öffnet die Details, Doppelklick oder der Play-Knopf startet sofort. Mit Rechtsklick erreichst du Bearbeiten, Artwork, Favoriten, Sammlungen und mehr.' },
  { sel: '[data-tour="add"]', title: 'Eigenes Artwork & Namen', text: 'Wie bei Nicht-Steam-Spielen in Steam: Vergib eigene Namen und lege Cover, Banner, Logo und Icon fest. Bilder kannst du direkt in den Editor ziehen.' },
  { sel: '[data-nav="stats"]', title: 'Spielzeit & Statistik', text: 'Jede Sitzung, die du über den Launcher startest, wird gezählt: Gesamtzeit, Verlauf, Aktivitätskalender, Lieblingsspiele und deine Serie.' },
  { sel: '[data-tour="search-btn"]', title: 'Schnellsuche mit Strg+K', text: 'Spielnamen tippen, Enter drücken, los geht’s. Auch Seiten, Themes und Befehle findest du hier.' },
  { sel: '[data-nav="settings"]', title: 'Einstellungen & Updates', text: 'Wähle ein Theme (dunkel, hell oder eigenes), stelle die Proton-Version ein und lass dich benachrichtigen, wenn ein neues Release erscheint. Diese Tour findest du dort jederzeit wieder.' },
  { welcome: true, final: true, title: 'Bereit zum Spielen! 🌸', text: 'Windows-Spiele starten automatisch mit der neuesten Proton-Version (oder Experimental). Viel Spaß – erstellt von Dominic Lesina x Claude.' },
];

let tourEl = null;
export function startTour(force = false) {
  if (tourEl) return;
  if (!force && state.settings.tutorialDone) return;
  let i = 0;
  tourEl = h(`<div class="tour-back"><div class="tour-hole none"></div><div class="tour-card"></div></div>`);
  document.body.append(tourEl);
  const hole = tourEl.querySelector('.tour-hole');
  const card = tourEl.querySelector('.tour-card');
  const finish = () => { tourEl?.remove(); tourEl = null; setSetting('tutorialDone', true); window.removeEventListener('keydown', keys, true); window.removeEventListener('resize', place); };
  const keys = (e) => {
    if (!tourEl) return;
    if (e.key === 'Escape') { e.stopPropagation(); finish(); }
    if (e.key === 'ArrowRight' || e.key === 'Enter') { e.stopPropagation(); e.preventDefault(); next(); }
    if (e.key === 'ArrowLeft') { e.stopPropagation(); prev(); }
  };
  const next = () => { if (i < STEPS.length - 1) { i++; draw(); } else finish(); };
  const prev = () => { if (i > 0) { i--; draw(); } };
  function place() {
    const st = STEPS[i];
    const target = st.sel ? document.querySelector(st.sel) : null;
    if (!target || st.welcome) {
      hole.classList.add('none');
      card.style.left = `calc(50% - 190px)`;
      card.style.top = `calc(50% - ${card.offsetHeight / 2}px)`;
      return;
    }
    hole.classList.remove('none');
    const r = target.getBoundingClientRect();
    const pad = 8;
    const hr = { left: r.left - pad, top: r.top - pad, width: Math.min(r.width + pad * 2, innerWidth - 20), height: Math.min(r.height + pad * 2, innerHeight * 0.5) };
    Object.assign(hole.style, { left: hr.left + 'px', top: hr.top + 'px', width: hr.width + 'px', height: hr.height + 'px' });
    let left = hr.left + hr.width + 18;
    let top = hr.top;
    if (left + 380 > innerWidth - 10) { left = Math.max(10, hr.left + hr.width - 380); top = hr.top + hr.height + 16; }
    if (top + card.offsetHeight > innerHeight - 10) top = Math.max(10, hr.top - card.offsetHeight - 16);
    card.style.left = left + 'px';
    card.style.top = top + 'px';
  }
  function draw() {
    const st = STEPS[i];
    card.innerHTML = `<div class="${st.welcome ? 'tour-welcome' : ''}">
      ${st.welcome ? '<img src="assets/logo.svg" alt="">' : ''}
      <div class="step">${st.welcome && !st.final ? 'Kurze Einführung' : `Schritt ${i + 1} von ${STEPS.length}`}</div>
      <h3>${esc(st.title)}</h3><p>${esc(st.text)}</p></div>
      <div class="dots">${STEPS.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
      <div class="acts">${!st.final ? '<button class="btn ghost small" data-skip>Überspringen</button>' : ''}<span class="sp"></span>
        ${i > 0 && !st.final ? `<button class="btn small" data-prev>${icon('left', 14)}</button>` : ''}
        <button class="btn primary small" data-next>${st.final ? 'Los geht’s' : i === 0 ? 'Tour starten' : 'Weiter'} ${!st.final ? icon('right', 14) : ''}</button></div>`;
    card.querySelector('[data-next]').onclick = next;
    card.querySelector('[data-prev]')?.addEventListener('click', prev);
    card.querySelector('[data-skip]')?.addEventListener('click', finish);
    requestAnimationFrame(place);
  }
  window.addEventListener('keydown', keys, true);
  window.addEventListener('resize', place);
  draw();
}
export function isTourOpen() { return !!tourEl; }

// ---------------- Controller ----------------
let gpFrame = null;
const prevButtons = {};
let lastMove = 0;

export function initGamepad() {
  window.addEventListener('gamepadconnected', () => { if (!gpFrame) loop(); });
  if (navigator.getGamepads && [...navigator.getGamepads()].some(Boolean)) loop();
}

function loop() {
  gpFrame = requestAnimationFrame(loop);
  if (!state.settings.gamepad || !navigator.getGamepads) return;
  const pads = [...navigator.getGamepads()].filter(Boolean);
  if (!pads.length) return;
  const p = pads[0];
  const pressed = (i) => p.buttons[i]?.pressed;
  const edge = (i) => { const now = !!pressed(i); const was = prevButtons[i]; prevButtons[i] = now; return now && !was; };
  const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
  const dir = pressed(14) || ax < -0.6 ? 'left' : pressed(15) || ax > 0.6 ? 'right' : pressed(12) || ay < -0.6 ? 'up' : pressed(13) || ay > 0.6 ? 'down' : null;
  const t = performance.now();
  if (dir && t - lastMove > 170) { lastMove = t; moveFocus(dir); }
  if (!dir) lastMove = 0;
  if (edge(0)) activate('a');
  if (edge(1)) back();
  if (edge(3)) activate('y');
  if (edge(2)) activate('x');
  if (edge(4)) cycleFilter(-1);
  if (edge(5)) cycleFilter(1);
  if (edge(9)) nav({ name: 'settings' });
}

function focusables() {
  return [...document.querySelectorAll('.card, .list-row')];
}

function current() {
  return document.querySelector('.gp-focus') || (document.activeElement?.matches?.('.card, .list-row') ? document.activeElement : null);
}

function moveFocus(dir) {
  if (state.view.name === 'game') {
    if (dir === 'left' || dir === 'up') return;
  }
  const list = focusables();
  if (!list.length) return;
  let cur = current();
  if (!cur) { setFocus(list[0]); return; }
  const r = cur.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let best = null, bestD = Infinity;
  for (const el of list) {
    if (el === cur) continue;
    const b = el.getBoundingClientRect();
    const x = b.left + b.width / 2, y = b.top + b.height / 2;
    const dx = x - cx, dy = y - cy;
    const ok = dir === 'left' ? dx < -5 && Math.abs(dy) < r.height / 2
      : dir === 'right' ? dx > 5 && Math.abs(dy) < r.height / 2
      : dir === 'up' ? dy < -5 : dy > 5;
    if (!ok) continue;
    const d = dir === 'up' || dir === 'down' ? Math.abs(dy) * 1 + Math.abs(dx) * 2 : Math.abs(dx);
    if (d < bestD) { bestD = d; best = el; }
  }
  if (best) setFocus(best);
}

function setFocus(el) {
  document.querySelectorAll('.gp-focus').forEach((x) => x.classList.remove('gp-focus'));
  el.classList.add('gp-focus');
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function activate(btn) {
  if (state.view.name === 'game') {
    const g = state.library.games.find((x) => x.id === state.view.gameId);
    if (!g) return;
    if (btn === 'a') state.running[g.id] ? stop(g) : launch(g);
    if (btn === 'x') toggleFavorite(g);
    return;
  }
  const cur = current();
  if (!cur) { const l = focusables(); if (l[0]) setFocus(l[0]); return; }
  const id = cur.dataset.id;
  const g = state.library.games.find((x) => x.id === id);
  if (!g) return;
  if (btn === 'a') state.running[id] ? stop(g) : launch(g);
  if (btn === 'y') nav({ name: 'game', gameId: id });
  if (btn === 'x') toggleFavorite(g);
}

function back() {
  if (isTourOpen()) return;
  if (isPaletteOpen()) { closePalette(); return; }
  if (hasModal()) { closeTopModal(); return; }
  if (state.view.name !== 'library') nav({ name: 'library' });
}

function cycleFilter(d) {
  const order = ['all', 'favorites', 'recent', 'exe', 'appimage', 'native'];
  const i = Math.max(0, order.indexOf(state.view.filter || 'all'));
  nav({ name: 'library', filter: order[(i + d + order.length) % order.length] });
}
