// Bibliothek (Raster/Liste, Weiterspielen-Banner) und Spiel-Detailseite.
import { invoke, fileSrc } from './api.js';
import { state, visibleGames, gameStats, lastPlayed, setSetting, secondsByDay, dayKey, gameById, updateGame } from './store.js';
import { icon, esc, coverHTML, heroBg, genGradient, applyBlur, fmtDuration, fmtRelative, fmtDate, fmtHours, fmtClock, kindLabel, toast, h, confirmDialog } from './ui.js';
import { launch, stop, gameMenu, addMenu, pickAndAdd, scanDialog, toggleFavorite, createShortcut, deleteGame, protonLabel, runnerLabel, resolveProton } from './actions.js';
import { openEditor } from './editor.js';
import { barChart } from './stats.js';

let nav = () => {};
export function wireLibrary({ navigate }) { nav = navigate; }

const FILTER_TITLES = { all: 'Bibliothek', favorites: 'Favoriten', recent: 'Zuletzt gespielt', exe: 'Windows-Spiele', appimage: 'AppImages', native: 'Linux-Programme', hidden: 'Ausgeblendet' };

export function libraryTitle() {
  const f = state.view.filter || 'all';
  if (f.startsWith('col:')) return state.library.collections.find((c) => c.id === f.slice(4))?.name || 'Sammlung';
  return FILTER_TITLES[f] || 'Bibliothek';
}

export function renderLibraryTop(top) {
  const s = state.settings;
  top.innerHTML = `
    <h1>${esc(libraryTitle())} <small>${visibleGames().length}</small></h1>
    <div class="spacer"></div>
    <div class="search-field" data-tour="search">${icon('search', 16)}<input class="input" id="lib-search" type="search" placeholder="Suchen …  (Strg+F)" value="${esc(state.search)}"></div>
    <select class="input" id="lib-sort" style="width:auto" title="Sortierung">
      ${[['recent', 'Zuletzt gespielt'], ['name', 'Name A–Z'], ['playtime', 'Meiste Spielzeit'], ['added', 'Neu hinzugefügt']].map(([v, l]) => `<option value="${v}" ${s.sort === v ? 'selected' : ''}>${l}</option>`).join('')}
    </select>
    <div class="seg"><button data-view="grid" class="${s.view === 'grid' ? 'on' : ''}" title="Raster">${icon('grid', 16)}</button><button data-view="list" class="${s.view === 'list' ? 'on' : ''}" title="Liste">${icon('list', 16)}</button></div>
    <button class="btn primary" id="lib-add" data-tour="add">${icon('plus', 17)} Hinzufügen</button>`;
  const inp = top.querySelector('#lib-search');
  let tmr;
  inp.addEventListener('input', () => {
    clearTimeout(tmr);
    tmr = setTimeout(() => {
      state.search = inp.value;
      const c = document.querySelector('.content');
      c.classList.add('static');
      renderLibraryContent(c);
      top.querySelector('h1 small').textContent = visibleGames().length;
    }, 90);
  });
  top.querySelector('#lib-sort').onchange = (e) => setSetting('sort', e.target.value);
  top.querySelectorAll('[data-view]').forEach((b) => b.onclick = () => setSetting('view', b.dataset.view));
  top.querySelector('#lib-add').onclick = (e) => { const r = e.currentTarget.getBoundingClientRect(); addMenu(r.right - 230, r.bottom + 6); };
}

function continueBanner() {
  if (state.view.filter !== 'all' || state.search) return '';
  const g = [...state.library.games].filter((x) => !x.hidden && lastPlayed(x)).sort((a, b) => lastPlayed(b) - lastPlayed(a))[0];
  if (!g) return '';
  const bg = heroBg(g);
  const st = gameStats(g.id);
  const running = state.running[g.id];
  return `<div class="continue" data-continue="${g.id}">
    <div class="bg" ${bg?.blur ? `data-blur-src="${esc(bg.url)}"` : ''} style="background-image:${bg && !bg.blur ? `url('${esc(bg.url)}')` : genGradient(g.name)}"></div>
    <div class="inner">
      <div class="eyebrow">${running ? '<span class="dot"></span> Läuft gerade' : `${icon('clock', 14)} Weiterspielen`}</div>
      ${g.art?.logo ? `<img class="logo-img" src="${esc(fileSrc(g.art.logo))}" alt="${esc(g.name)}">` : `<div class="title">${esc(g.name)}</div>`}
      <div class="meta"><span>${icon('clock', 14)} ${fmtDuration(st.secs)}</span><span>Zuletzt: ${fmtRelative(lastPlayed(g))}</span><span>${kindLabel(g.kind)}</span></div>
      <div class="row">
        ${running ? `<button class="btn big stop" data-stop="${g.id}">${icon('stop', 18)} Beenden · <span data-live="${g.id}">${fmtClock((Date.now() - running.started) / 1000)}</span></button>`
          : `<button class="btn big primary play" data-play="${g.id}">${icon('play', 18)} Spielen</button>`}
        <button class="btn" data-detail="${g.id}" style="background:rgba(10,8,16,.45);color:#fff;border-color:rgba(255,255,255,.2)">${icon('info', 16)} Details</button>
      </div>
    </div></div>`;
}

function cardHTML(g, i) {
  const st = gameStats(g.id);
  const running = state.running[g.id];
  return `<div class="card" tabindex="0" data-id="${g.id}" style="animation-delay:${Math.min(i, 24) * 22}ms">
    <div class="cover">${coverHTML(g)}<div class="shine"></div>
      <div class="badges">
        ${running ? '<span class="badge run"><span class="dot" style="width:7px;height:7px;background:#04241a"></span>Läuft</span>' : ''}
        ${g.hidden ? `<span class="badge">${icon('eyeOff', 11)}</span>` : ''}
        ${g.favorite ? `<span class="fav">${icon('starFill', 18)}</span>` : ''}
      </div>
      <div class="play-overlay"><button class="play-circle" data-play="${g.id}" title="Spielen">${running ? icon('stop', 22) : icon('play', 24)}</button></div>
    </div>
    <div class="info"><div class="name" title="${esc(g.name)}">${esc(g.name)}</div>
      <div class="sub">${state.settings.showPlaytime ? `<span>${st.secs ? fmtDuration(st.secs) : 'Neu'}</span>` : ''}<span>${kindLabel(g.kind)}</span></div></div>
  </div>`;
}

function rowHTML(g, i) {
  const st = gameStats(g.id);
  const running = state.running[g.id];
  return `<div class="list-row" tabindex="0" data-id="${g.id}" style="animation-delay:${Math.min(i, 30) * 15}ms">
    <div class="thumb">${coverHTML(g, { kind: 'icon' })}</div>
    <div class="n">${g.favorite ? `<span style="color:#ffd166">${icon('starFill', 13)}</span> ` : ''}${esc(g.name)}<small>${esc(g.path)}</small></div>
    <div class="c">${kindLabel(g.kind)}</div>
    <div class="c hide-s">${fmtDuration(st.secs)}</div>
    <div class="c hide-s">${fmtRelative(lastPlayed(g))}</div>
    <div>${running ? `<button class="btn small stop" data-play="${g.id}">${icon('stop', 13)} Beenden</button>` : `<button class="btn small primary" data-play="${g.id}">${icon('play', 13)} Spielen</button>`}</div>
  </div>`;
}

export function renderLibraryContent(host) {
  // Frischer Container pro Render, damit Event-Listener nicht doppelt hängen
  host.innerHTML = '';
  const content = document.createElement('div');
  host.append(content);
  const list = visibleGames();
  const total = state.library.games.length;
  if (!total) {
    content.innerHTML = `<div class="empty">
      <div class="big-icon">${icon('gamepad', 48)}</div>
      <h2>Willkommen in deiner Bibliothek</h2>
      <p>Füge AppImages oder Windows-Spiele (.exe) hinzu – per Knopf, durch Ordner-Scan oder einfach per Drag & Drop ins Fenster.</p>
      <div class="actions"><button class="btn primary big" id="e-add">${icon('plus', 18)} Datei hinzufügen</button><button class="btn big" id="e-scan">${icon('scan', 18)} Ordner durchsuchen</button></div>
    </div>`;
    content.querySelector('#e-add').onclick = pickAndAdd;
    content.querySelector('#e-scan').onclick = () => scanDialog();
    return;
  }
  const chips = [['all', 'Alle'], ['favorites', 'Favoriten'], ['exe', 'Windows'], ['appimage', 'AppImage'], ['native', 'Linux']];
  if (state.library.games.some((g) => g.hidden)) chips.push(['hidden', 'Ausgeblendet']);
  const f = state.view.filter || 'all';
  const showChips = !f.startsWith('col:') && f !== 'recent';
  content.innerHTML = `${continueBanner()}
    ${state.scanFound.length ? `<div class="panel" style="display:flex;align-items:center;gap:14px;margin-bottom:18px;padding:14px 18px">${icon('sparkle', 20)}<div style="flex:1"><b>${state.scanFound.length} neue Dateien</b> in deinen beobachteten Ordnern gefunden.</div><button class="btn small primary" id="scan-show">Ansehen</button></div>` : ''}
    ${showChips ? `<div class="toolbar"><div class="filter-chips">${chips.map(([k, l]) => `<button data-f="${k}" class="${f === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>` : ''}
    ${list.length ? (state.settings.view === 'list'
      ? `<div class="list">${list.map(rowHTML).join('')}</div>`
      : `<div class="grid" data-tour="grid">${list.map(cardHTML).join('')}</div>`)
      : `<div class="empty" style="padding:50px"><h2>Nichts gefunden</h2><p>${state.search ? `Keine Treffer für „${esc(state.search)}“.` : 'Hier ist noch nichts.'}</p></div>`}`;
  applyBlur(content);
  content.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => nav({ name: 'library', filter: b.dataset.f }));
  content.querySelector('#scan-show')?.addEventListener('click', () => scanDialog(null, state.scanFound));
  bindGameEvents(content);
}

function bindGameEvents(root) {
  root.addEventListener('click', (e) => {
    const play = e.target.closest('[data-play]');
    if (play) { e.stopPropagation(); const id = play.dataset.play; state.running[id] ? stop(id) : launch(id); return; }
    const st = e.target.closest('[data-stop]');
    if (st) { e.stopPropagation(); stop(st.dataset.stop); return; }
    const det = e.target.closest('[data-detail]');
    if (det) { e.stopPropagation(); nav({ name: 'game', gameId: det.dataset.detail }); return; }
    const card = e.target.closest('[data-id]');
    if (card) { nav({ name: 'game', gameId: card.dataset.id }); return; }
    const cont = e.target.closest('[data-continue]');
    if (cont) nav({ name: 'game', gameId: cont.dataset.continue });
  });
  root.addEventListener('dblclick', (e) => {
    const card = e.target.closest('[data-id]');
    if (card && !e.target.closest('[data-play]')) { const id = card.dataset.id; if (!state.running[id]) launch(id); }
  });
  root.addEventListener('contextmenu', (e) => {
    const card = e.target.closest('[data-id]') || e.target.closest('[data-continue]');
    if (!card) return;
    e.preventDefault();
    const g = gameById(card.dataset.id || card.dataset.continue);
    if (g) gameMenu(e.clientX, e.clientY, g);
  });
  root.addEventListener('keydown', (e) => {
    const card = e.target.closest('[data-id]');
    if (!card) return;
    if (e.key === 'Enter') { e.preventDefault(); nav({ name: 'game', gameId: card.dataset.id }); }
    if (e.key === ' ') { e.preventDefault(); const id = card.dataset.id; state.running[id] ? stop(id) : launch(id); }
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); const r = card.getBoundingClientRect(); gameMenu(r.left + 20, r.top + 40, gameById(card.dataset.id)); }
  });
}

// ---------------- Detailseite ----------------
export function renderDetailTop(top) {
  top.innerHTML = '';
  top.style.display = 'none';
}

export function renderDetail(content) {
  const g = gameById(state.view.gameId);
  if (!g) { nav({ name: 'library' }); return; }
  const st = gameStats(g.id);
  const running = state.running[g.id];
  const bg = heroBg(g);
  const tab = state.view.tab || 'overview';
  const sessions = state.sessions.filter((s) => s.gameId === g.id).sort((a, b) => b.start - a.start);
  const avg = st.count ? st.secs / st.count : 0;
  const isExe = g.kind === 'exe';
  const proton = isExe ? resolveProton(g.proton !== 'default' ? g.proton : state.settings.defaultProton) : null;
  content.innerHTML = `<div class="detail">
    <div class="hero">
      <div class="bg ${bg?.blur ? 'blur' : ''}" ${bg?.blur ? `data-blur-src="${esc(bg.url)}"` : ''} style="background-image:${bg && !bg.blur ? `url('${esc(bg.url)}')` : genGradient(g.name)}"></div>
      <div class="back"><button class="btn small" id="d-back">${icon('left', 15)} Bibliothek</button></div>
      <div class="head">
        <div class="poster">${coverHTML(g)}</div>
        <div class="titles">
          ${g.art?.logo ? `<img class="logo-img" src="${esc(fileSrc(g.art.logo))}" alt="${esc(g.name)}">` : `<h2>${esc(g.name)}</h2>`}
          <div class="chips">
            <span class="chip">${kindLabel(g.kind)}</span>
            ${isExe ? `<span class="chip">${icon('wine', 12)} ${esc(proton?.name || 'Kein Proton')}</span>` : ''}
            ${g.favorite ? `<span class="chip accent">${icon('starFill', 12)} Favorit</span>` : ''}
            ${g.collections.map((id) => state.library.collections.find((c) => c.id === id)).filter(Boolean).map((c) => `<span class="chip">${icon('layers', 12)} ${esc(c.name)}</span>`).join('')}
            ${running ? '<span class="chip ok"><span class="dot" style="width:7px;height:7px"></span> Läuft</span>' : ''}
          </div>
        </div>
      </div>
    </div>
    <div class="detail-actions">
      ${running ? `<button class="btn big stop play" id="d-stop">${icon('stop', 18)} Beenden · <span data-live="${g.id}">${fmtClock((Date.now() - running.started) / 1000)}</span></button>`
        : `<button class="btn big primary play" id="d-play">${icon('play', 18)} Spielen</button>`}
      <button class="btn icon" id="d-fav" title="Favorit">${icon(g.favorite ? 'starFill' : 'star', 18)}</button>
      <button class="btn" id="d-edit">${icon('edit', 16)} Bearbeiten</button>
      <button class="btn" id="d-art">${icon('image', 16)} Artwork</button>
      <span class="spacer"></span>
      <button class="btn ghost" id="d-folder">${icon('folder', 16)} Ordner</button>
      ${state.sys?.desktopEntries ? `<button class="btn ghost" id="d-link">${icon('link', 16)} Verknüpfung</button>` : ''}
      <button class="btn ghost icon" id="d-more" title="Mehr">${icon('down', 18)}</button>
    </div>
    <div class="detail-body">
      <div>
        <div class="stat-chips">
          <div class="stat"><div class="k">${icon('clock', 13)} Spielzeit</div><div class="v">${fmtHours(st.secs)}</div></div>
          <div class="stat"><div class="k">${icon('calendar', 13)} Zuletzt</div><div class="v" style="font-size:17px;padding-top:4px">${fmtRelative(lastPlayed(g))}</div></div>
          <div class="stat"><div class="k">${icon('play', 13)} Sitzungen</div><div class="v">${st.count}</div></div>
          <div class="stat"><div class="k">${icon('chart', 13)} Ø Sitzung</div><div class="v">${fmtHours(avg)}</div></div>
        </div>
        <div class="tabs">
          ${[['overview', 'Übersicht'], ['sessions', 'Sitzungen'], isExe ? ['tools', 'Prefix & Werkzeuge'] : null, ['log', 'Protokoll']].filter(Boolean).map(([k, l]) => `<button data-dt="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}
        </div>
        <div id="d-pane"></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="panel"><h3>${icon('info', 16)} Infos</h3>
          <div class="kv">
            <span class="k">Datei</span><span class="v">${esc(g.path)}</span>
            <span class="k">Art</span><span class="v">${kindLabel(g.kind)}</span>
            ${isExe ? `<span class="k">Proton</span><span class="v">${esc(protonLabel(g.proton !== 'default' ? g.proton : state.settings.defaultProton))}${proton && g.proton === 'default' ? ` (${esc(proton.name)})` : ''}</span>
            <span class="k">Methode</span><span class="v">${esc(runnerLabel(g.runner !== 'default' ? g.runner : state.settings.defaultRunner))}</span>` : ''}
            ${g.args ? `<span class="k">Argumente</span><span class="v">${esc(g.args)}</span>` : ''}
            <span class="k">Hinzugefügt</span><span class="v">${new Date(g.addedAt).toLocaleDateString('de-DE')}</span>
            <span class="k">Längste</span><span class="v">${fmtDuration(st.longest)}</span>
          </div>
        </div>
        ${g.notes ? `<div class="panel"><h3>${icon('edit', 16)} Notizen</h3><div style="white-space:pre-wrap;color:var(--text-dim);user-select:text">${esc(g.notes)}</div></div>` : ''}
      </div>
    </div></div>`;

  applyBlur(content);
  const pane = content.querySelector('#d-pane');
  const panes = {
    overview: () => {
      const days = secondsByDay(g.id);
      const data = [];
      for (let i = 29; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); data.push({ label: d.getDate() + '.', value: (days.get(dayKey(d)) || 0) / 3600, title: d.toLocaleDateString('de-DE') }); }
      pane.innerHTML = `<div class="panel"><h3>${icon('chart', 16)} Letzte 30 Tage</h3>${st.secs ? barChart(data, { unit: 'Std.' }) : '<p class="hint" style="margin:0">Noch keine Spielzeit. Starte das Spiel über den Launcher – dann wird hier jede Sitzung erfasst.</p>'}</div>
        ${sessions.length ? `<div class="panel" style="margin-top:16px"><h3>${icon('clock', 16)} Letzte Sitzungen</h3><div class="session-list">${sessions.slice(0, 5).map((s) => `<div class="s"><span>${fmtDate(s.start)}</span><span>${fmtDuration(s.secs)}</span></div>`).join('')}</div></div>` : ''}`;
    },
    sessions: () => {
      pane.innerHTML = `<div class="panel"><h3>${icon('clock', 16)} Alle Sitzungen <span class="r chip">${sessions.length}</span></h3>${sessions.length ? `<div class="session-list">${sessions.slice(0, 300).map((s, i) => `<div class="s"><span>${fmtDate(s.start)}</span><span style="display:flex;gap:10px;align-items:center">${fmtDuration(s.secs)}<button class="btn ghost icon small" data-del-s="${s.start}" title="Sitzung löschen">${icon('trash', 13)}</button></span></div>`).join('')}</div>` : '<p class="hint" style="margin:0">Noch keine Sitzungen.</p>'}</div>`;
      pane.querySelectorAll('[data-del-s]').forEach((b) => b.onclick = async () => {
        if (!(await confirmDialog('Sitzung löschen?', 'Diese Sitzung wird aus der Statistik entfernt.', { ok: 'Löschen', danger: true }))) return;
        const start = +b.dataset.delS;
        state.sessions = state.sessions.filter((s) => !(s.gameId === g.id && s.start === start));
        const { save, invalidateStats, notify } = await import('./store.js');
        invalidateStats(); save('sessions'); notify('all');
      });
    },
    tools: async () => {
      const req = { gameId: g.id, custom: g.prefix || null };
      let pfx = '';
      try { pfx = await invoke('get_prefix_path', req); } catch (_) {}
      pane.innerHTML = `<div class="panel"><h3>${icon('wine', 16)} Wine-Prefix</h3>
        <p class="hint" style="margin:0 0 12px">Jedes Windows-Spiel hat seinen eigenen Prefix (wie ein kleines Windows). Dort liegen oft auch Spielstände.</p>
        <div class="input-row" style="margin-bottom:14px"><input class="input" readonly value="${esc(pfx)}" style="font-family:var(--mono);font-size:12px"><button class="btn" id="t-open">${icon('folder', 16)} Öffnen</button></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${[['winecfg', 'Wine-Konfiguration', 'settings'], ['winetricks', 'Winetricks', 'sparkle'], ['regedit', 'Registry', 'file'], ['explorer', 'Explorer', 'folder'], ['control', 'Systemsteuerung', 'box']].map(([t, l, ic]) => `<button class="btn" data-tool="${t}">${icon(ic, 16)} ${l}</button>`).join('')}
        </div></div>
        <div class="panel" style="margin-top:16px"><h3 style="color:var(--danger)">${icon('trash', 16)} Gefahrenzone</h3>
        <p class="hint" style="margin:0 0 12px">Den Prefix zurücksetzen hilft bei kaputten Installationen. <b>Achtung:</b> Spielstände im Prefix gehen dabei verloren.</p>
        <button class="btn danger" id="t-del">Prefix löschen</button></div>`;
      pane.querySelector('#t-open').onclick = () => invoke('open_path', { path: pfx }).catch((e) => toast('Fehler', String(e), { type: 'err' }));
      const { resolveRequest } = await import('./actions.js');
      pane.querySelectorAll('[data-tool]').forEach((b) => b.onclick = () => invoke('run_prefix_tool', { req: resolveRequest(g), tool: b.dataset.tool })
        .then(() => toast('Wird geöffnet …', b.textContent.trim(), { timeout: 2500 }))
        .catch((e) => toast('Werkzeug nicht verfügbar', String(e), { type: 'err', timeout: 8000 })));
      pane.querySelector('#t-del').onclick = async () => {
        if (!(await confirmDialog('Prefix wirklich löschen?', `Der Prefix von <b>${esc(g.name)}</b> wird gelöscht und beim nächsten Start neu angelegt. Spielstände darin gehen verloren.`, { ok: 'Löschen', danger: true }))) return;
        try { await invoke('delete_prefix', req); toast('Prefix gelöscht', g.name, { type: 'ok' }); } catch (e) { toast('Fehler', String(e), { type: 'err' }); }
      };
    },
    log: async () => {
      let txt = '';
      try { txt = await invoke('read_log', { gameId: g.id }); } catch (_) {}
      pane.innerHTML = `<div class="panel"><h3>${icon('logs', 16)} Letztes Startprotokoll <span class="r" style="display:flex;gap:6px"><button class="btn small" id="l-copy">${icon('copy', 14)} Kopieren</button><button class="btn small" id="l-ref">${icon('refresh', 14)}</button></span></h3>
        <div class="log-view" id="l-view">${esc(txt) || 'Noch kein Protokoll – starte das Spiel einmal.'}</div></div>`;
      const v = pane.querySelector('#l-view'); v.scrollTop = v.scrollHeight;
      pane.querySelector('#l-copy').onclick = () => navigator.clipboard?.writeText(txt).then(() => toast('Kopiert', 'Protokoll in der Zwischenablage', { type: 'ok' }));
      pane.querySelector('#l-ref').onclick = () => panes.log();
    },
  };
  (panes[tab] || panes.overview)();

  content.querySelectorAll('[data-dt]').forEach((b) => b.onclick = () => { state.view.tab = b.dataset.dt; renderDetail(content); });
  content.querySelector('#d-back').onclick = () => nav({ name: 'library' });
  content.querySelector('#d-play')?.addEventListener('click', () => launch(g));
  content.querySelector('#d-stop')?.addEventListener('click', () => stop(g));
  content.querySelector('#d-fav').onclick = () => toggleFavorite(g);
  content.querySelector('#d-edit').onclick = () => openEditor(g.id);
  content.querySelector('#d-art').onclick = () => openEditor(g.id, 'art');
  content.querySelector('#d-folder').onclick = () => invoke('reveal_path', { path: g.path }).catch((e) => toast('Fehler', String(e), { type: 'err' }));
  content.querySelector('#d-link')?.addEventListener('click', () => createShortcut(g, true));
  content.querySelector('#d-more').onclick = (e) => { const r = e.currentTarget.getBoundingClientRect(); gameMenu(r.right - 230, r.bottom + 6, g); };
}
