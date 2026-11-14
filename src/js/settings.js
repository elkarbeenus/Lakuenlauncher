// Einstellungen: Darstellung, Allgemein, Bibliothek, Start & Proton, Updates, Daten, Tastenkürzel, Über.
import { invoke, pickFiles, saveFile, isTauri } from './api.js';
import { state, setSetting, save, saveNow, notify, invalidateStats, DEFAULT_SETTINGS, normalizeGame } from './store.js';
import { icon, esc, toast, confirmDialog, fmtRelative, fmtSize, h } from './ui.js';
import { THEMES, ACCENTS, allThemes, applyTheme, parseThemeFile, THEME_TEMPLATE } from './themes.js';
import { refreshProtons, protonLabel, runnerLabel, scanWatchFolders, scanDialog } from './actions.js';
import { checkUpdates, REPO_URL } from './updates.js';

let nav = () => {};
let startTour = () => {};
export function wireSettings({ navigate, tour }) { nav = navigate; startTour = tour; }

const SECTIONS = [
  ['appearance', 'Darstellung', 'palette'],
  ['general', 'Allgemein', 'settings'],
  ['library', 'Bibliothek', 'layers'],
  ['launch', 'Start & Proton', 'wine'],
  ['updates', 'Updates', 'download'],
  ['data', 'Daten & Sicherung', 'shield'],
  ['shortcuts', 'Tastenkürzel', 'keyboard'],
  ['about', 'Über', 'info'],
];

export function renderSettingsTop(top) {
  top.innerHTML = `<h1>Einstellungen</h1><div class="spacer"></div>`;
}

const sw = (key, on) => `<span class="switch"><input type="checkbox" data-set="${key}" ${on ? 'checked' : ''}><span></span></span>`;
const row = (title, desc, control) => `<div class="setting-row"><div class="txt"><b>${title}</b><span>${desc}</span></div>${control}</div>`;

export function renderSettings(content) {
  const sec = state.view.settingsSection || 'appearance';
  content.innerHTML = `<div class="settings">
    <nav class="settings-nav">${SECTIONS.map(([k, l, ic]) => `<button class="nav-item ${sec === k ? 'active' : ''}" data-sec="${k}">${icon(ic, 17)} ${l}${k === 'updates' && state.update ? ' <span class="count" style="color:var(--accent)">●</span>' : ''}</button>`).join('')}</nav>
    <div class="settings-body" id="set-body"></div></div>`;
  content.querySelectorAll('[data-sec]').forEach((b) => b.onclick = () => { state.view.settingsSection = b.dataset.sec; renderSettings(content); });
  const body = content.querySelector('#set-body');
  ({ appearance, general, library, launch, updates, data, shortcuts, about })[sec](body);
  // generische Schalter
  body.querySelectorAll('[data-set]').forEach((inp) => {
    inp.addEventListener('change', () => {
      const k = inp.dataset.set;
      const v = inp.type === 'checkbox' ? inp.checked : inp.type === 'range' || inp.type === 'number' ? +inp.value : inp.value;
      setSetting(k, v);
      if (['reduceMotion', 'effects', 'petals', 'cardSize', 'ambient'].includes(k)) applyTheme();
    });
  });
}

function themeCard(t) {
  const c = { ...THEMES[0].colors, ...t.colors };
  const on = state.settings.theme === t.id;
  return `<button class="theme-card ${on ? 'on' : ''}" data-theme="${esc(t.id)}">
    <div class="pv" style="background:${c.bg}"><div class="side" style="background:${c.panel}"></div><i style="height:60%;background:${c.accent}"></i><i style="height:85%;background:${c.accent2}"></i><i style="height:40%;background:${c.panel}"></i></div>
    <div class="lbl">${esc(t.name)}<small>${t.custom ? 'Extern' : t.mode === 'light' ? 'Hell' : 'Dunkel'}</small></div></button>`;
}

function appearance(body) {
  const s = state.settings;
  const themes = allThemes();
  body.innerHTML = `
    <div class="panel"><h3>${icon('moon', 17)} Dunkle Themes</h3><div class="theme-grid">${themes.filter((t) => t.mode !== 'light' && !t.custom).map(themeCard).join('')}</div></div>
    <div class="panel"><h3>${icon('sun', 17)} Helle Themes</h3><div class="theme-grid">${themes.filter((t) => t.mode === 'light' && !t.custom).map(themeCard).join('')}</div></div>
    <div class="panel"><h3>${icon('palette', 17)} Externe Themes <span class="r" style="display:flex;gap:6px"><button class="btn small" id="th-tpl">${icon('download', 14)} Vorlage speichern</button><button class="btn small primary" id="th-imp">${icon('upload', 14)} Theme importieren</button></span></h3>
      ${themes.some((t) => t.custom) ? `<div class="theme-grid">${themes.filter((t) => t.custom).map((t) => `<div style="position:relative">${themeCard(t)}<button class="btn icon small ghost" data-th-del="${esc(t.id)}" style="position:absolute;top:6px;right:6px" title="Entfernen">${icon('trash', 14)}</button></div>`).join('')}</div>`
        : '<p class="hint" style="margin:0">Du kannst eigene Themes als JSON-Datei einbinden – speichere dir die Vorlage, passe die Farben an und importiere sie. Optional mit eigenem CSS.</p>'}
    </div>
    <div class="panel"><h3>${icon('sparkle', 17)} Akzentfarbe</h3>
      <div class="accent-row">
        <button class="accent-dot ${!s.accent ? 'on' : ''}" data-accent="" title="Vom Theme" style="background:conic-gradient(from 90deg, var(--accent), var(--accent-2), var(--accent))"></button>
        ${ACCENTS.map((a) => `<button class="accent-dot ${s.accent === a ? 'on' : ''}" data-accent="${a}" style="background:${a}"></button>`).join('')}
        <input type="color" id="acc-pick" value="${s.accent || '#ff6fae'}" title="Eigene Farbe">
      </div></div>
    <div class="panel"><h3>${icon('grid', 17)} Bibliothek & Effekte</h3>
      ${row('Cover-Größe', 'Wie groß die Spiele im Raster angezeigt werden', `<input type="range" min="140" max="280" step="10" value="${s.cardSize}" data-set="cardSize">`)}
      ${row('Spielzeit auf Karten', 'Zeigt die Spielzeit unter jedem Cover', sw('showPlaytime', s.showPlaytime))}
      ${row('Hintergrund-Effekte', 'Sanfte Farbverläufe im Hintergrund', sw('effects', s.effects))}
      ${row('Stimmungslicht', 'Der Hintergrund übernimmt die Farben des zuletzt gespielten Spiels', sw('ambient', s.ambient))}
      ${row('Blütenregen 🌸', 'Rakuen-Kirschblüten fallen sanft im Hintergrund', sw('petals', s.petals))}
      ${row('Bewegungen reduzieren', 'Weniger Animationen (Barrierefreiheit)', sw('reduceMotion', s.reduceMotion))}
    </div>`;
  body.querySelectorAll('[data-theme]').forEach((b) => b.onclick = () => { setSetting('theme', b.dataset.theme); applyTheme(); appearance(body); rebind(body); });
  body.querySelectorAll('[data-accent]').forEach((b) => b.onclick = () => { setSetting('accent', b.dataset.accent || null); applyTheme(); appearance(body); rebind(body); });
  body.querySelector('#acc-pick').oninput = (e) => { state.settings.accent = e.target.value; applyTheme(); };
  body.querySelector('#acc-pick').onchange = (e) => { setSetting('accent', e.target.value); appearance(body); rebind(body); };
  body.querySelector('#th-imp').onclick = async () => {
    if (!isTauri) return toast('Demo-Modus', 'Import gibt es nur in der App.');
    const p = await pickFiles({ title: 'Theme-Datei wählen', filters: [{ name: 'Theme (JSON)', extensions: ['json'] }] });
    if (!p?.[0]) return;
    try {
      const t = parseThemeFile(await invoke('read_text_file', { path: p[0] }));
      setSetting('customThemes', [...(state.settings.customThemes || []), t]);
      setSetting('theme', t.id);
      applyTheme(); appearance(body); rebind(body);
      toast('Theme importiert', t.name, { type: 'ok' });
    } catch (e) { toast('Theme ungültig', String(e.message || e), { type: 'err' }); }
  };
  body.querySelector('#th-tpl').onclick = async () => {
    const p = await saveFile({ defaultPath: 'mein-lakuen-theme.json', filters: [{ name: 'Theme (JSON)', extensions: ['json'] }] });
    if (!p) return;
    try { await invoke('write_text_file', { path: p, content: JSON.stringify(THEME_TEMPLATE, null, 2) }); toast('Vorlage gespeichert', p, { type: 'ok' }); }
    catch (e) { toast('Fehler', String(e), { type: 'err' }); }
  };
  body.querySelectorAll('[data-th-del]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const id = b.dataset.thDel;
    setSetting('customThemes', state.settings.customThemes.filter((t) => t.id !== id));
    if (state.settings.theme === id) setSetting('theme', DEFAULT_SETTINGS.theme);
    applyTheme(); appearance(body); rebind(body);
  });
}

function rebind(body) {
  body.querySelectorAll('[data-set]').forEach((inp) => {
    inp.addEventListener('change', () => {
      const k = inp.dataset.set;
      const v = inp.type === 'checkbox' ? inp.checked : inp.type === 'range' ? +inp.value : inp.value;
      setSetting(k, v);
      applyTheme();
    });
  });
}

function general(body) {
  const s = state.settings;
  body.innerHTML = `
    <div class="panel"><h3>${icon('sparkle', 17)} Einführung</h3>
      ${row('Tutorial erneut zeigen', 'Die kurze Tour durch den Launcher noch einmal ansehen', `<button class="btn" id="g-tour">${icon('play', 14)} Tour starten</button>`)}
    </div>
    <div class="panel"><h3>${icon('play', 17)} Beim Spielstart</h3>
      ${row('Launcher minimieren', 'Fenster beim Start eines Spiels minimieren', sw('minimizeOnLaunch', s.minimizeOnLaunch))}
      ${row('Danach wieder öffnen', 'Fenster wieder in den Vordergrund holen, wenn das Spiel beendet ist', sw('restoreOnExit', s.restoreOnExit))}
      ${row('Sitzungs-Hinweis', 'Nach dem Spielen kurz anzeigen, wie lange du gespielt hast', sw('notifySessions', s.notifySessions))}
    </div>
    <div class="panel"><h3>${icon('gamepad', 17)} Eingabe</h3>
      ${row('Controller-Steuerung', 'Mit Steuerkreuz/Stick durch die Bibliothek, A = Starten, B = Zurück, Y = Details', sw('gamepad', s.gamepad))}
    </div>
    <div class="panel"><h3>${icon('shield', 17)} Privatsphäre</h3>
      <p style="margin:0;color:var(--text-dim)">LakuenLauncher braucht <b>kein Konto</b> und sammelt <b>keine Daten</b>. Bibliothek, Artwork und Spielzeiten liegen ausschließlich lokal auf deinem Gerät. Die einzige Verbindung ins Internet ist die optionale Update-Prüfung bei GitHub.</p>
    </div>`;
  body.querySelector('#g-tour').onclick = () => { nav({ name: 'library', filter: 'all' }); setTimeout(() => startTour(true), 250); };
}

function library(body) {
  const s = state.settings;
  body.innerHTML = `
    <div class="panel"><h3>${icon('folder', 17)} Beobachtete Ordner <span class="r" style="display:flex;gap:6px"><button class="btn small" id="l-scan">${icon('refresh', 14)} Jetzt prüfen</button><button class="btn small primary" id="l-add">${icon('plus', 14)} Ordner hinzufügen</button></span></h3>
      <p class="hint" style="margin:0 0 12px">Neue AppImages und .exe-Dateien in diesen Ordnern werden beim Start erkannt und vorgeschlagen.</p>
      ${s.watchFolders.length ? `<div class="proton-list">${s.watchFolders.map((f, i) => `<div class="proton-item">${icon('folder', 16)}<div style="flex:1;min-width:0"><b>${esc(f.split('/').pop() || f)}</b><div class="p">${esc(f)}</div></div><button class="btn small" data-wscan="${i}">Durchsuchen</button><button class="btn icon small ghost" data-wdel="${i}">${icon('trash', 14)}</button></div>`).join('')}</div>` : '<p class="hint" style="margin:0">Noch keine Ordner – z. B. <code>~/Games</code> oder <code>~/Applications</code>.</p>'}
      <div style="margin-top:6px">${row('Beim Start prüfen', 'Beobachtete Ordner bei jedem Start durchsuchen', sw('scanOnStart', s.scanOnStart))}</div>
      ${s.scanIgnored.length ? row('Ignorierte Dateien', `${s.scanIgnored.length} Dateien werden beim Scan nicht mehr vorgeschlagen`, '<button class="btn small" id="l-unign">Zurücksetzen</button>') : ''}
    </div>
    <div class="panel"><h3>${icon('eye', 17)} Anzeige</h3>
      ${row('Ausgeblendete Spiele zeigen', 'Ausgeblendete Einträge auch unter „Alle“ anzeigen', sw('showHidden', s.showHidden))}
    </div>`;
  body.querySelector('#l-add').onclick = async () => {
    const p = await pickFiles({ directory: true, title: 'Ordner beobachten' });
    if (p?.[0] && !s.watchFolders.includes(p[0])) { setSetting('watchFolders', [...s.watchFolders, p[0]]); library(body); rebind(body); scanWatchFolders(false); }
  };
  body.querySelector('#l-scan').onclick = () => scanWatchFolders(false);
  body.querySelectorAll('[data-wdel]').forEach((b) => b.onclick = () => { setSetting('watchFolders', s.watchFolders.filter((_, i) => i !== +b.dataset.wdel)); library(body); rebind(body); });
  body.querySelectorAll('[data-wscan]').forEach((b) => b.onclick = () => scanDialog(s.watchFolders[+b.dataset.wscan]));
  body.querySelector('#l-unign')?.addEventListener('click', () => { setSetting('scanIgnored', []); library(body); rebind(body); toast('Zurückgesetzt', 'Ignorierte Dateien werden wieder vorgeschlagen.'); });
}

function launch(body) {
  const s = state.settings;
  const sys = state.sys || {};
  const protonOpts = [['auto-latest', 'Immer die neueste Version'], ['auto-experimental', 'Proton Experimental (falls installiert)'], ...state.protons.map((p) => [p.path, `${p.name} · ${p.source}`])];
  body.innerHTML = `
    <div class="panel"><h3>${icon('wine', 17)} Standard für Windows-Spiele</h3>
      <div class="grid-2">
        <div class="field"><label>Proton-Version</label><select class="input" data-set="defaultProton">${protonOpts.map(([v, l]) => `<option value="${esc(v)}" ${s.defaultProton === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
          <span class="hint">Aktuell: ${esc(protonLabel(s.defaultProton))}</span></div>
        <div class="field"><label>Startmethode</label><select class="input" data-set="defaultRunner">${['auto', 'umu', 'slr', 'proton'].map((r) => `<option value="${r}" ${s.defaultRunner === r ? 'selected' : ''}>${runnerLabel(r)}</option>`).join('')}</select>
          <span class="hint">Automatisch = umu-launcher, sonst Proton in der Steam Linux Runtime, sonst Proton direkt.</span></div>
      </div>
      <div class="field"><label>Basisordner für Prefixe (optional)</label>
        <div class="input-row"><input class="input" id="pb" value="${esc(s.prefixBase)}" placeholder="Leer = im Datenordner des Launchers"><button class="btn" id="pb-pick">${icon('folder', 16)}</button></div>
        <span class="hint">Jedes Spiel bekommt darin einen eigenen Unterordner.</span></div>
      ${row('MangoHud standardmäßig', 'FPS-Anzeige für alle Spiele (pro Spiel änderbar)', sw('mangohud', s.mangohud))}
      ${row('GameMode standardmäßig', 'Leistungsmodus für alle Spiele (pro Spiel änderbar)', sw('gamemode', s.gamemode))}
    </div>
    <div class="panel"><h3>${icon('layers', 17)} Gefundene Proton-Versionen <span class="r"><button class="btn small" id="pr-ref">${icon('refresh', 14)} Neu suchen</button></span></h3>
      ${state.protons.length ? `<div class="proton-list">${state.protons.map((p) => `<div class="proton-item">${icon('wine', 16)}<div style="flex:1;min-width:0"><b>${esc(p.name)}</b> ${p.experimental ? '<span class="chip accent">Experimental</span>' : ''} <span class="chip">${esc(p.source)}</span><div class="p">${esc(p.path)}</div></div>${p.runtime ? '<span class="chip ok" title="Steam Linux Runtime vorhanden">Runtime</span>' : ''}</div>`).join('')}</div>`
        : `<p class="hint" style="margin:0">Keine Proton-Version gefunden. Installiere in Steam z. B. <b>Proton Experimental</b> (Bibliothek → Werkzeuge) oder <b>GE-Proton</b> mit ProtonUp-Qt.</p>`}
    </div>
    <div class="panel"><h3>${icon('zap', 17)} Werkzeuge auf diesem System</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${[['umu-launcher', !!sys.umu], ['Steam Linux Runtime', !!sys.steamRuntime], ['MangoHud', sys.mangohud], ['GameMode', sys.gamemode], ['gamescope', sys.gamescope], ['winetricks', sys.winetricks]].map(([n, ok]) => `<span class="chip ${ok ? 'ok' : ''}">${icon(ok ? 'check' : 'x', 12)} ${n}</span>`).join('')}
      </div>
      <p class="hint" style="margin:12px 0 0">Steam-Ordner: ${esc(sys.steamRoot || 'nicht gefunden')}</p>
    </div>`;
  const pb = body.querySelector('#pb');
  pb.onchange = () => setSetting('prefixBase', pb.value.trim());
  body.querySelector('#pb-pick').onclick = async () => { const p = await pickFiles({ directory: true, title: 'Basisordner für Prefixe' }); if (p?.[0]) { pb.value = p[0]; setSetting('prefixBase', p[0]); } };
  body.querySelector('#pr-ref').onclick = async () => { await refreshProtons(); launch(body); rebindPlain(body); toast('Proton-Liste aktualisiert', `${state.protons.length} Versionen gefunden`); };
}

function rebindPlain(body) {
  body.querySelectorAll('[data-set]').forEach((inp) => inp.addEventListener('change', () => setSetting(inp.dataset.set, inp.type === 'checkbox' ? inp.checked : inp.value)));
}

function updates(body) {
  const s = state.settings;
  const u = state.update;
  body.innerHTML = `
    <div class="panel"><h3>${icon('download', 17)} Updates</h3>
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:8px">
        <div style="flex:1"><div style="font-size:13px;color:var(--text-faint);font-weight:700">INSTALLIERT</div><div style="font-size:24px;font-weight:800">v${esc(state.version)}</div></div>
        <button class="btn primary" id="u-check">${icon('refresh', 16)} Nach Updates suchen</button>
      </div>
      <p class="hint" style="margin:0">Zuletzt geprüft: ${s.lastUpdateCheck ? fmtRelative(s.lastUpdateCheck) : 'noch nie'}</p>
      ${row('Automatisch prüfen', 'Beim Start bei GitHub nachsehen und per Benachrichtigung melden, wenn ein neuer Release erscheint', sw('updateCheck', s.updateCheck))}
    </div>
    ${u ? `<div class="panel" style="border-color:rgba(var(--accent-rgb),.5)"><h3>${icon('sparkle', 17)} Neue Version: v${esc(u.version)} <span class="r chip accent">${u.published ? new Date(u.published).toLocaleDateString('de-DE') : ''}</span></h3>
      <div class="changelog">${esc(u.body || 'Keine Patchnotes.')}</div>
      <div style="display:flex;gap:10px;margin-top:14px">
        <button class="btn primary" id="u-dl">${icon('download', 16)} AppImage herunterladen${u.size ? ` (${fmtSize(u.size)})` : ''}</button>
        <button class="btn" id="u-page">${icon('external', 16)} Release-Seite</button>
      </div>
      <p class="hint" style="margin:12px 0 0">Nach dem Download einfach die alte AppImage durch die neue ersetzen – deine Bibliothek und Statistik bleiben erhalten.</p></div>` : ''}`;
  body.querySelector('#u-check').onclick = async (e) => { e.currentTarget.disabled = true; await checkUpdates({ manual: true }); updates(body); rebindPlain(body); };
  body.querySelector('#u-dl')?.addEventListener('click', () => invoke('open_path', { path: u.download }));
  body.querySelector('#u-page')?.addEventListener('click', () => invoke('open_path', { path: u.url }));
}

function data(body) {
  body.innerHTML = `
    <div class="panel"><h3>${icon('shield', 17)} Sicherung</h3>
      ${row('Bibliothek exportieren', 'Spiele, Einstellungen und Spielzeiten als eine JSON-Datei sichern', `<button class="btn" id="d-exp">${icon('download', 14)} Exportieren</button>`)}
      ${row('Sicherung importieren', 'Ersetzt die aktuelle Bibliothek durch eine Sicherung', `<button class="btn" id="d-imp">${icon('upload', 14)} Importieren</button>`)}
      ${row('Automatische Sicherungen', 'Der Launcher legt täglich eine Kopie an (die letzten 7 Tage)', `<button class="btn" id="d-bak">${icon('folder', 14)} Ordner öffnen</button>`)}
    </div>
    <div class="panel"><h3>${icon('folder', 17)} Speicherort</h3>
      <p class="hint" style="margin:0 0 10px">Alle Daten liegen hier – Artwork, Prefixe, Protokolle und Sicherungen:</p>
      <div class="input-row"><input class="input" readonly value="${esc(state.sys?.dataDir || '')}" style="font-family:var(--mono);font-size:12px"><button class="btn" id="d-open">${icon('folder', 16)} Öffnen</button></div>
    </div>
    <div class="panel"><h3 style="color:var(--danger)">${icon('trash', 17)} Zurücksetzen</h3>
      ${row('Statistik löschen', 'Alle erfassten Spielzeiten entfernen', '<button class="btn danger" id="d-clr">Löschen</button>')}
      ${row('Einstellungen zurücksetzen', 'Alle Einstellungen auf Standard (Bibliothek bleibt)', '<button class="btn danger" id="d-rst">Zurücksetzen</button>')}
    </div>`;
  body.querySelector('#d-open').onclick = () => invoke('open_path', { path: state.sys?.dataDir || '' });
  body.querySelector('#d-bak').onclick = () => invoke('open_path', { path: (state.sys?.dataDir || '') + '/backups' });
  body.querySelector('#d-exp').onclick = async () => {
    const date = new Date().toISOString().slice(0, 10);
    const p = await saveFile({ defaultPath: `lakuenlauncher-sicherung-${date}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (!p) return;
    const payload = { app: 'LakuenLauncher', version: state.version, exported: Date.now(), library: state.library, settings: state.settings, sessions: state.sessions };
    try { await invoke('write_text_file', { path: p, content: JSON.stringify(payload, null, 2) }); toast('Exportiert', p, { type: 'ok' }); } catch (e) { toast('Fehler', String(e), { type: 'err' }); }
  };
  body.querySelector('#d-imp').onclick = async () => {
    const p = await pickFiles({ title: 'Sicherung wählen', filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (!p?.[0]) return;
    try {
      const d = JSON.parse(await invoke('read_text_file', { path: p[0] }));
      if (!d.library?.games) throw new Error('Das ist keine LakuenLauncher-Sicherung.');
      if (!(await confirmDialog('Sicherung importieren?', `Die aktuelle Bibliothek wird durch die Sicherung mit <b>${d.library.games.length} Einträgen</b> ersetzt.`, { ok: 'Importieren' }))) return;
      state.library = { version: 1, collections: [], ...d.library, games: d.library.games.map(normalizeGame) };
      if (d.settings) state.settings = { ...DEFAULT_SETTINGS, ...d.settings };
      if (Array.isArray(d.sessions)) state.sessions = d.sessions;
      invalidateStats();
      await Promise.all([saveNow('library'), saveNow('settings'), saveNow('sessions')]);
      applyTheme(); notify('all');
      toast('Importiert', `${state.library.games.length} Einträge wiederhergestellt`, { type: 'ok' });
    } catch (e) { toast('Import fehlgeschlagen', String(e.message || e), { type: 'err' }); }
  };
  body.querySelector('#d-clr').onclick = async () => {
    if (!(await confirmDialog('Gesamte Statistik löschen?', 'Alle erfassten Spielzeiten werden unwiderruflich entfernt.', { ok: 'Alles löschen', danger: true }))) return;
    state.sessions = []; invalidateStats(); save('sessions'); notify('all'); toast('Statistik gelöscht', '', { type: 'ok' });
  };
  body.querySelector('#d-rst').onclick = async () => {
    if (!(await confirmDialog('Einstellungen zurücksetzen?', 'Theme, Proton-Standard usw. werden auf Werkseinstellungen gesetzt.', { ok: 'Zurücksetzen', danger: true }))) return;
    state.settings = { ...DEFAULT_SETTINGS, tutorialDone: true }; save('settings'); applyTheme(); notify('all');
  };
}

function shortcuts(body) {
  const k = [
    ['Schnellsuche / Befehle', '<kbd>Strg</kbd> + <kbd>K</kbd>'], ['Bibliothek durchsuchen', '<kbd>Strg</kbd> + <kbd>F</kbd>'],
    ['Spiel hinzufügen', '<kbd>Strg</kbd> + <kbd>N</kbd>'], ['Ordner durchsuchen', '<kbd>Strg</kbd> + <kbd>Umschalt</kbd> + <kbd>N</kbd>'],
    ['Bibliothek', '<kbd>Strg</kbd> + <kbd>1</kbd>'], ['Statistik', '<kbd>Strg</kbd> + <kbd>2</kbd>'], ['Einstellungen', '<kbd>Strg</kbd> + <kbd>,</kbd>'],
    ['Ausgewähltes Spiel starten', '<kbd>Leertaste</kbd>'], ['Details öffnen', '<kbd>Enter</kbd>'], ['Zurück / Schließen', '<kbd>Esc</kbd>'],
    ['Zufälliges Spiel', '<kbd>Strg</kbd> + <kbd>R</kbd>'], ['Im Editor speichern', '<kbd>Strg</kbd> + <kbd>S</kbd>'],
  ];
  body.innerHTML = `<div class="panel"><h3>${icon('keyboard', 17)} Tastatur</h3><div class="kbd-list">${k.map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('')}</div></div>
    <div class="panel"><h3>${icon('gamepad', 17)} Controller</h3><div class="kbd-list">
      <span>Navigieren</span><span>Steuerkreuz / linker Stick</span><span>Spielen</span><span><kbd>A</kbd></span><span>Zurück</span><span><kbd>B</kbd></span>
      <span>Details</span><span><kbd>Y</kbd></span><span>Favorit</span><span><kbd>X</kbd></span><span>Filter wechseln</span><span><kbd>LB</kbd> / <kbd>RB</kbd></span></div></div>`;
}

function about(body) {
  body.innerHTML = `
    <div class="panel"><div class="about"><img src="assets/logo.svg" alt="">
      <div><h2>LakuenLauncher</h2><div class="by">erstellt von <b>Dominic Lesina x Claude</b></div>
      <div style="display:flex;gap:8px;margin-top:10px"><span class="chip accent">v${esc(state.version)}</span><span class="chip">${esc(state.sys?.os || '')}</span>${state.sys?.isAppImage ? '<span class="chip">AppImage</span>' : ''}</div></div></div>
      <p style="color:var(--text-dim);margin:18px 0 0">„Rakuen“ (楽園) heißt Paradies – ein Ort für all deine Spiele und Apps. Lokal, ohne Konto, ohne Datensammlung.</p>
      <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
        <button class="btn" id="a-gh">${icon('external', 16)} GitHub</button>
        <button class="btn" id="a-rel">${icon('download', 16)} Releases</button>
        <button class="btn" id="a-tour">${icon('sparkle', 16)} Tutorial zeigen</button>
      </div></div>
    <div class="panel"><h3>${icon('heart', 17)} Danke an</h3>
      <p class="hint" style="margin:0">Tauri (MIT/Apache-2.0) · Valve Proton & Steam Linux Runtime · umu-launcher (wird nur aufgerufen, falls installiert) · Inspiration: Playnite (MIT), clear (Unlicense). Lizenz von LakuenLauncher: MIT.</p></div>`;
  body.querySelector('#a-gh').onclick = () => invoke('open_path', { path: REPO_URL });
  body.querySelector('#a-rel').onclick = () => invoke('open_path', { path: REPO_URL + '/releases' });
  body.querySelector('#a-tour').onclick = () => { nav({ name: 'library', filter: 'all' }); setTimeout(() => startTour(true), 250); };
}
