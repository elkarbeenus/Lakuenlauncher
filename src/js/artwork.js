// Artwork setzen: Datei → (optional zuschneiden) → speichern → Spiel aktualisieren.
import { invoke, isTauri } from './api.js';
import { gameById, updateGame } from './store.js';
import { openModal, icon, esc, toast, coverHTML } from './ui.js';
import { openCropper, ART_SPECS } from './cropper.js';

export const IMG_RE = /\.(png|jpe?g|webp|gif|svg|avif|bmp)$/i;

/** Bild-Datei als Artwork übernehmen. Mit Zuschneiden (außer animierte GIFs). Gibt den neuen Pfad zurück. */
export async function applyArtworkFile(gameId, kind, path, { crop = true } = {}) {
  const g = gameById(gameId);
  if (!g) return null;
  try {
    let dest;
    if (crop && !/\.gif$/i.test(path)) {
      const dataUrl = await invoke('read_image_data_url', { path });
      const result = await openCropper(dataUrl, kind, { title: `${ART_SPECS[kind].label} für „${g.name}“ anpassen` });
      if (!result) return null;
      dest = await invoke('save_artwork_data', { gameId, kind, data: result });
    } else {
      dest = await invoke('import_artwork', { gameId, kind, src: path });
    }
    const fresh = gameById(gameId);
    updateGame(gameId, { art: { ...fresh.art, [kind]: dest } });
    toast(`${ART_SPECS[kind].label} gesetzt`, g.name, { type: 'ok', timeout: 2500 });
    return dest;
  } catch (e) {
    toast('Bild nicht übernommen', String(e), { type: 'err' });
    return null;
  }
}

/** Vorhandenes Artwork erneut zuschneiden. */
export async function recropArtwork(gameId, kind) {
  const g = gameById(gameId);
  const path = g?.art?.[kind];
  if (!path) return null;
  return applyArtworkFile(gameId, kind, path, { crop: true });
}

/**
 * Bild wurde auf eine Spielkarte gezogen: einmal nachfragen (Cover vorausgewählt),
 * danach zuschneiden und speichern.
 */
export function askDropArtwork(gameId, path) {
  const g = gameById(gameId);
  if (!g) return;
  if (!isTauri) { toast('Demo-Modus', 'Nur in der App möglich.'); return; }
  const kinds = [['cover', 'Cover', 'Hochformat 2:3'], ['hero', 'Banner', 'Breitbild oben'], ['logo', 'Logo', 'Schriftzug, transparent'], ['icon', 'Icon', 'Quadratisch']];
  let chosen = 'cover';
  const body = document.createElement('div');
  body.innerHTML = `
    <div style="display:flex;gap:16px;align-items:center;margin-bottom:16px">
      <div style="width:64px;aspect-ratio:2/3;border-radius:10px;overflow:hidden;flex:none">${coverHTML(g)}</div>
      <div><b style="font-size:15px">${esc(g.name)}</b><div class="hint">${esc(path.split('/').pop())}</div></div>
    </div>
    <div class="kind-pick">${kinds.map(([k, l, d]) => `<button class="kind-opt ${k === chosen ? 'on' : ''}" data-k="${k}">${icon(k === 'icon' ? 'grid' : k === 'logo' ? 'tag' : 'image', 20)}<b>${l}</b><span>${d}</span></button>`).join('')}</div>
    <label class="toggle-line" style="border:0;margin-top:8px"><div><b>Zuschneiden & skalieren</b><span>Ausschnitt passend für den Rahmen wählen</span></div><span class="switch"><input type="checkbox" id="dp-crop" checked><span></span></span></label>`;
  const m = openModal({
    title: `${icon('image', 20)} Bild als Artwork verwenden?`, body, cls: 'narrow',
    footer: `<button class="btn" data-c>Abbrechen</button><button class="btn primary" data-ok>${icon('check', 16)} Verwenden</button>`,
  });
  body.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => {
    chosen = b.dataset.k;
    body.querySelectorAll('[data-k]').forEach((x) => x.classList.toggle('on', x === b));
  });
  body.querySelectorAll('[data-k]').forEach((b) => b.ondblclick = () => m.foot.querySelector('[data-ok]').click());
  m.foot.querySelector('[data-c]').onclick = m.close;
  m.foot.querySelector('[data-ok]').onclick = () => {
    const crop = body.querySelector('#dp-crop').checked;
    m.close();
    applyArtworkFile(gameId, chosen, path, { crop });
  };
  setTimeout(() => m.foot.querySelector('[data-ok]').focus(), 30);
}
