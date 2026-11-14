// Spiel-Editor: Name, Datei, Artwork, Startoptionen (Proton, MangoHud, Variablen …).
import { invoke, pickFiles, fileSrc, isTauri } from './api.js';
import { state, gameById, updateGame, guessKind, notify } from './store.js';
import { openModal, esc, icon, toast, kindLabel } from './ui.js';
import { protonLabel, runnerLabel, refreshProtons } from './actions.js';

const ART = {
  cover: { label: 'Cover', hint: 'Hochformat 2:3 · z. B. 600 × 900' },
  hero: { label: 'Banner', hint: 'Breitbild · z. B. 1920 × 620' },
  logo: { label: 'Logo', hint: 'Transparentes PNG' },
  icon: { label: 'Icon', hint: 'Quadratisch' },
};
const IMG_FILTER = [{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif', 'bmp', 'PNG', 'JPG', 'JPEG', 'WEBP'] }];

let current = null; // { id, draft, modal, tab, dropTarget }

export function editorDropTarget() { return current; }

export function openEditor(id, tab = 'general') {
  const g = gameById(id);
  if (!g) return;
  if (current) current.modal.close();
  const draft = structuredClone(g);
  const body = document.createElement('div');
  const modal = openModal({
    title: `${icon('edit', 20)} <span id="ed-title">${esc(g.name)}</span>`,
    body, cls: 'wide',
    footer: `<div class="left"><span class="hint" id="ed-hint">Tipp: Bilder einfach ins Fenster ziehen.</span></div><button class="btn" data-c>Abbrechen</button><button class="btn primary" data-s>${icon('check', 16)} Speichern</button>`,
    onClose: () => { current = null; },
  });
  current = { id, draft, modal, tab, body };
  modal.foot.querySelector('[data-c]').onclick = modal.close;
  modal.foot.querySelector('[data-s]').onclick = () => saveDraft();
  modal.el.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveDraft(); } });
  render();
}

function saveDraft() {
  if (!current) return;
  const d = current.draft;
  d.name = d.name.trim() || 'Unbenannt';
  if (!d.path.trim()) { toast('Datei fehlt', 'Bitte eine Spieldatei auswählen.', { type: 'err' }); return; }
  // leere Variablen entfernen
  d.env = Object.fromEntries(Object.entries(d.env || {}).filter(([k]) => k.trim()));
  const { id } = current;
  const patch = { ...d };
  delete patch.id;
  updateGame(id, patch);
  current.modal.close();
  toast('Gespeichert', d.name, { type: 'ok', timeout: 2000 });
}

function render() {
  const { draft: d, tab, body } = current;
  body.innerHTML = `
    <div class="tabs">
      <button data-tab="general" class="${tab === 'general' ? 'on' : ''}">Allgemein</button>
      <button data-tab="art" class="${tab === 'art' ? 'on' : ''}">Artwork</button>
      <button data-tab="launch" class="${tab === 'launch' ? 'on' : ''}">Start & Kompatibilität</button>
      <button data-tab="advanced" class="${tab === 'advanced' ? 'on' : ''}">Erweitert</button>
    </div>
    <div id="ed-pane"></div>`;
  body.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { current.tab = b.dataset.tab; render(); });
  const pane = body.querySelector('#ed-pane');
  ({ general: paneGeneral, art: paneArt, launch: paneLaunch, advanced: paneAdvanced })[tab](pane, d);
}

function bindInputs(pane, d) {
  pane.querySelectorAll('[data-k]').forEach((inp) => {
    const k = inp.dataset.k;
    const ev = inp.type === 'checkbox' || inp.tagName === 'SELECT' ? 'change' : 'input';
    inp.addEventListener(ev, () => {
      d[k] = inp.type === 'checkbox' ? inp.checked : inp.value;
      if (k === 'name') { const t = document.getElementById('ed-title'); if (t) t.textContent = inp.value || 'Unbenannt'; }
    });
  });
}

function paneGeneral(pane, d) {
  const cols = state.library.collections;
  pane.innerHTML = `
    <div class="field"><label>Anzeigename</label><input class="input" data-k="name" value="${esc(d.name)}" placeholder="So erscheint das Spiel in der Bibliothek"></div>
    <div class="field"><label>Spieldatei</label>
      <div class="input-row"><input class="input" data-k="path" id="ed-path" value="${esc(d.path)}" placeholder="/pfad/zum/spiel.exe oder .AppImage"><button class="btn" id="ed-pick">${icon('folder', 16)} Wählen</button></div>
      <span class="hint">AppImages und Linux-Programme starten direkt, .exe-Dateien über Proton.</span></div>
    <div class="grid-2">
      <div class="field"><label>Art</label>
        <select class="input" data-k="kind" id="ed-kind">
          ${['exe', 'appimage', 'native'].map((k) => `<option value="${k}" ${d.kind === k ? 'selected' : ''}>${kindLabel(k)}${k === 'exe' ? ' (.exe über Proton)' : k === 'native' ? ' (Programm/Skript)' : ''}</option>`).join('')}
        </select></div>
      <div class="field"><label>Startargumente</label><input class="input" data-k="args" value="${esc(d.args)}" placeholder="z. B. -windowed -skipintro"></div>
    </div>
    <div class="field"><label>Sammlungen</label>
      <div style="display:flex;gap:6px;flex-wrap:wrap" id="ed-cols">${cols.length ? cols.map((c) => `<button class="chip ${d.collections.includes(c.id) ? 'accent' : ''}" data-col="${c.id}" style="cursor:pointer">${esc(c.name)}</button>`).join('') : '<span class="hint">Noch keine Sammlungen – lege links in der Seitenleiste eine an.</span>'}</div></div>
    <div class="grid-2">
      <label class="toggle-line"><div><b>Favorit</b><span>Oben in der Bibliothek anpinnen</span></div><span class="switch"><input type="checkbox" data-k="favorite" ${d.favorite ? 'checked' : ''}><span></span></span></label>
      <label class="toggle-line"><div><b>Ausblenden</b><span>Nicht in „Alle“ anzeigen</span></div><span class="switch"><input type="checkbox" data-k="hidden" ${d.hidden ? 'checked' : ''}><span></span></span></label>
    </div>
    <div class="field" style="margin-top:10px"><label>Notizen</label><textarea class="input" data-k="notes" placeholder="Cheats, Controller-Belegung, wo du stehen geblieben bist …" style="font-family:var(--font);font-size:13.5px">${esc(d.notes)}</textarea></div>`;
  bindInputs(pane, d);
  pane.querySelector('#ed-pick').onclick = async () => {
    const p = await pickFiles({ title: 'Spieldatei wählen', filters: [{ name: 'Spiele & Apps', extensions: ['AppImage', 'appimage', 'exe', 'EXE', 'sh', 'x86_64', 'bat', 'msi'] }, { name: 'Alle Dateien', extensions: ['*'] }] });
    if (p?.[0]) {
      d.path = p[0]; d.kind = guessKind(p[0]);
      pane.querySelector('#ed-path').value = d.path;
      pane.querySelector('#ed-kind').value = d.kind;
    }
  };
  pane.querySelectorAll('[data-col]').forEach((b) => b.onclick = () => {
    const id = b.dataset.col;
    d.collections = d.collections.includes(id) ? d.collections.filter((x) => x !== id) : [...d.collections, id];
    b.classList.toggle('accent');
  });
}

function slotHTML(kind, d, cls = '') {
  const src = d.art?.[kind];
  return `<div class="art-slot art-${kind} ${cls}" data-slot="${kind}">
    <span class="tag">${ART[kind].label}</span>
    ${src ? `<img src="${esc(fileSrc(src))}" alt=""><button class="rm" data-rm="${kind}" title="Entfernen">${icon('x', 14)}</button>`
      : `<div class="lab">${icon('image', 26)}<span>${ART[kind].label} wählen<br>oder hierher ziehen</span><span class="hint">${ART[kind].hint}</span></div>`}
  </div>`;
}

function paneArt(pane, d) {
  pane.innerHTML = `
    <p class="hint" style="margin:0 0 14px">Wie bei Nicht-Steam-Spielen: eigenes Cover, Banner, Logo und Icon. Klicke auf ein Feld oder ziehe ein Bild aus deinem Dateimanager darauf. Die Bilder werden lokal in den Launcher kopiert.</p>
    <div class="art-grid">
      ${slotHTML('cover', d)}
      <div class="art-right">
        ${slotHTML('hero', d)}
        <div class="art-small">${slotHTML('logo', d, 'contain')}${slotHTML('icon', d, 'contain')}</div>
      </div>
    </div>
    <p class="hint" style="margin:14px 0 0">${icon('sparkle', 13)} Tipp: Ohne Cover erzeugt der Launcher automatisch ein farbiges Cover aus dem Namen.</p>`;
  pane.querySelectorAll('[data-slot]').forEach((slot) => {
    slot.addEventListener('click', async (e) => {
      if (e.target.closest('[data-rm]')) return;
      const kind = slot.dataset.slot;
      if (!isTauri) { toast('Demo-Modus', 'Bildauswahl gibt es nur in der App.'); return; }
      const p = await pickFiles({ title: `${ART[kind].label} wählen`, filters: IMG_FILTER });
      if (p?.[0]) await setArt(kind, p[0]);
    });
    slot.addEventListener('mouseenter', () => { current.hoverSlot = slot.dataset.slot; });
    slot.addEventListener('mouseleave', () => { current.hoverSlot = null; });
  });
  pane.querySelectorAll('[data-rm]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const kind = b.dataset.rm;
    const d2 = current.draft;
    d2.art = { ...d2.art };
    delete d2.art[kind];
    render();
  });
}

export async function setArt(kind, src) {
  if (!current) return;
  try {
    const dest = await invoke('import_artwork', { gameId: current.id, kind, src });
    current.draft.art = { ...current.draft.art, [kind]: dest };
    // Artwork sofort übernehmen, damit es auch ohne „Speichern“ nicht verloren geht
    const g = gameById(current.id);
    if (g) { g.art = { ...g.art, [kind]: dest }; updateGame(g.id, { art: g.art }); }
    if (current.tab === 'art') render();
  } catch (e) { toast('Bild nicht übernommen', String(e), { type: 'err' }); }
}

/** Drag & Drop von Bildern während der Editor offen ist. */
export async function handleEditorDrop(paths, pos) {
  if (!current) return false;
  const imgs = paths.filter((p) => /\.(png|jpe?g|webp|gif|svg|avif|bmp)$/i.test(p));
  if (!imgs.length) return false;
  if (current.tab !== 'art') { current.tab = 'art'; render(); }
  let kind = current.hoverSlot;
  if (!kind && pos) {
    const el = document.elementFromPoint(pos.x / devicePixelRatio, pos.y / devicePixelRatio) || document.elementFromPoint(pos.x, pos.y);
    kind = el?.closest?.('[data-slot]')?.dataset.slot;
  }
  if (!kind) kind = ['cover', 'hero', 'logo', 'icon'].find((k) => !current.draft.art?.[k]) || 'cover';
  if (imgs.length > 1 && !current.hoverSlot) {
    const order = ['cover', 'hero', 'logo', 'icon'];
    for (let i = 0; i < Math.min(imgs.length, 4); i++) await setArt(order[i], imgs[i]);
  } else {
    await setArt(kind, imgs[0]);
  }
  return true;
}

function tri(key, d, labelDefault) {
  const v = d[key];
  return `<span class="tri" data-tri="${key}">
    <button data-v="null" class="${v === null || v === undefined ? 'on' : ''}">${labelDefault}</button>
    <button data-v="true" class="${v === true ? 'on' : ''}">An</button>
    <button data-v="false" class="${v === false ? 'on' : ''}">Aus</button></span>`;
}

function paneLaunch(pane, d) {
  const s = state.settings;
  const sys = state.sys || {};
  const isExe = d.kind === 'exe';
  const protonOpts = [
    ['default', `Standard (${protonLabel(s.defaultProton)})`],
    ['auto-latest', 'Immer die neueste Version'],
    ['auto-experimental', 'Proton Experimental'],
    ...state.protons.map((p) => [p.path, `${p.name} · ${p.source}`]),
  ];
  if (d.proton && !protonOpts.some(([v]) => v === d.proton)) protonOpts.push([d.proton, `${d.proton.split('/').pop()} (nicht gefunden)`]);
  pane.innerHTML = `
    ${isExe ? `
    <div class="grid-2">
      <div class="field"><label>Proton-Version</label>
        <div class="input-row"><select class="input" data-k="proton">${protonOpts.map(([v, l]) => `<option value="${esc(v)}" ${d.proton === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
        <button class="btn icon" id="ed-rp" title="Neu suchen">${icon('refresh', 16)}</button></div>
        <span class="hint">${state.protons.length ? `${state.protons.length} Versionen gefunden` : 'Keine Proton-Version gefunden – über Steam oder ProtonUp-Qt installieren.'}</span></div>
      <div class="field"><label>Startmethode</label>
        <select class="input" data-k="runner">
          ${['default', 'auto', 'umu', 'slr', 'proton'].map((r) => `<option value="${r}" ${d.runner === r ? 'selected' : ''}>${r === 'default' ? `Standard (${runnerLabel(s.defaultRunner)})` : runnerLabel(r)}${r === 'umu' && !sys.umu ? ' – nicht installiert' : ''}</option>`).join('')}
        </select>
        <span class="hint">Automatisch: umu-launcher falls installiert, sonst Proton in der Steam Linux Runtime.</span></div>
    </div>
    <div class="field"><label>Eigener Prefix-Ordner (optional)</label>
      <div class="input-row"><input class="input" data-k="prefix" id="ed-prefix" value="${esc(d.prefix)}" placeholder="Leer = automatisch eigener Prefix für dieses Spiel"><button class="btn" id="ed-pp">${icon('folder', 16)}</button></div></div>
    ` : `<div class="panel" style="margin-bottom:16px;padding:14px 16px"><b>${kindLabel(d.kind)}</b> – wird direkt gestartet, Proton wird nicht benötigt.</div>`}
    <div class="panel" style="padding:6px 16px">
      <div class="toggle-line"><div><b>MangoHud</b><span>FPS- & Leistungsanzeige${sys.mangohud === false ? ' · nicht installiert' : ''}</span></div>${tri('mangohud', d, 'Standard')}</div>
      <div class="toggle-line"><div><b>GameMode</b><span>Leistungsoptimierung von Feral${sys.gamemode === false ? ' · nicht installiert' : ''}</span></div>${tri('gamemode', d, 'Standard')}</div>
      ${isExe ? `<label class="toggle-line"><div><b>FSR-Hochskalierung</b><span>AMD FidelityFX Super Resolution im Vollbild (WINE_FULLSCREEN_FSR)</span></div><span class="switch"><input type="checkbox" data-k="fsr" ${d.fsr ? 'checked' : ''}><span></span></span></label>` : ''}
    </div>
    <div class="field" style="margin-top:16px"><label>Wrapper-Befehl (optional)</label><input class="input" data-k="wrapper" value="${esc(d.wrapper)}" placeholder="z. B. gamescope -W 1920 -H 1080 -f --">
      <span class="hint">Wird vor den Startbefehl gesetzt${sys.gamescope ? ' · gamescope ist installiert' : ''}.</span></div>`;
  bindInputs(pane, d);
  pane.querySelectorAll('[data-tri]').forEach((t) => t.querySelectorAll('button').forEach((b) => b.onclick = () => {
    d[t.dataset.tri] = JSON.parse(b.dataset.v);
    t.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  }));
  pane.querySelector('#ed-rp')?.addEventListener('click', async () => { await refreshProtons(); render(); toast('Proton-Liste aktualisiert', `${state.protons.length} Versionen gefunden`); });
  pane.querySelector('#ed-pp')?.addEventListener('click', async () => {
    const p = await pickFiles({ directory: true, title: 'Prefix-Ordner wählen' });
    if (p?.[0]) { d.prefix = p[0]; pane.querySelector('#ed-prefix').value = p[0]; }
  });
}

function paneAdvanced(pane, d) {
  const envRows = Object.entries(d.env || {});
  if (!envRows.length) envRows.push(['', '']);
  pane.innerHTML = `
    <div class="field"><label>Arbeitsordner (optional)</label>
      <div class="input-row"><input class="input" data-k="workdir" id="ed-wd" value="${esc(d.workdir)}" placeholder="Leer = Ordner der Spieldatei"><button class="btn" id="ed-wdp">${icon('folder', 16)}</button></div></div>
    <div class="field"><label>Umgebungsvariablen</label>
      <div class="env-table" id="ed-env">${envRows.map(([k, v], i) => envRow(k, v, i)).join('')}</div>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
        <button class="btn small" id="ed-env-add">${icon('plus', 14)} Variable</button>
        ${[['DXVK_HUD', 'fps'], ['PROTON_LOG', '1'], ['PROTON_USE_WINED3D', '1'], ['PROTON_ENABLE_WAYLAND', '1'], ['PROTON_NO_ESYNC', '1'], ['GAMEID', 'umu-default']].map(([k, v]) => `<button class="chip" data-preset="${k}=${v}" style="cursor:pointer">+ ${k}</button>`).join('')}
      </div></div>
    <div class="grid-2">
      <div class="field"><label>Skript vor dem Start</label><textarea class="input" data-k="preScript" placeholder="z. B. notify-send 'Los geht\\'s'">${esc(d.preScript)}</textarea></div>
      <div class="field"><label>Skript nach dem Beenden</label><textarea class="input" data-k="postScript" placeholder="z. B. Spielstände sichern">${esc(d.postScript)}</textarea></div>
    </div>
    <p class="hint">Skripte laufen mit <code>sh -c</code> im Arbeitsordner des Spiels.</p>`;
  bindInputs(pane, d);
  const envEl = pane.querySelector('#ed-env');
  const sync = () => {
    const env = {};
    envEl.querySelectorAll('.er').forEach((r) => { const k = r.querySelector('[data-ek]').value.trim(); if (k) env[k] = r.querySelector('[data-ev]').value; });
    d.env = env;
  };
  envEl.addEventListener('input', sync);
  envEl.addEventListener('click', (e) => { const b = e.target.closest('[data-erm]'); if (b) { b.closest('.er').remove(); sync(); } });
  pane.querySelector('#ed-env-add').onclick = () => { envEl.insertAdjacentHTML('beforeend', envRow('', '', Date.now())); };
  pane.querySelectorAll('[data-preset]').forEach((b) => b.onclick = () => {
    const [k, v] = b.dataset.preset.split('=');
    d.env = { ...Object.fromEntries(Object.entries(d.env || {}).filter(([kk]) => kk)), [k]: v };
    paneAdvanced(pane, d);
  });
  pane.querySelector('#ed-wdp').onclick = async () => {
    const p = await pickFiles({ directory: true, title: 'Arbeitsordner wählen' });
    if (p?.[0]) { d.workdir = p[0]; pane.querySelector('#ed-wd').value = p[0]; }
  };
}

function envRow(k, v) {
  return `<div class="er"><input class="input" data-ek value="${esc(k)}" placeholder="NAME" style="font-family:var(--mono)"><input class="input" data-ev value="${esc(v)}" placeholder="Wert" style="font-family:var(--mono)"><button class="btn icon ghost" data-erm>${icon('x', 15)}</button></div>`;
}

export function isEditorOpen() { return !!current; }
export { notify };
