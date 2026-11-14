// Zufalls-Artwork: erzeugt eigene Cover, Banner und Icons aus dem Spielnamen (lokal, per Canvas).
import { invoke, isTauri } from './api.js';
import { state, gameById, updateGame } from './store.js';
import { openModal, icon, esc, toast } from './ui.js';

export const STYLES = [
  ['wellen', 'Wellen'], ['geometrie', 'Geometrie'], ['sakura', 'Sakura-Nacht'],
  ['neon', 'Synthwave'], ['kosmos', 'Kosmos'], ['pixel', 'Pixel'], ['aurora', 'Aurora'],
];

function hash(str) {
  let h = 2166136261;
  for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hsl = (h, s, l, a = 1) => `hsla(${((h % 360) + 360) % 360}, ${s}%, ${l}%, ${a})`;

function background(ctx, w, h, r, hue, style) {
  const g = ctx.createLinearGradient(0, 0, w * (0.3 + r() * 0.7), h);
  const dark = style === 'kosmos' || style === 'sakura' || style === 'neon';
  g.addColorStop(0, hsl(hue, 70, dark ? 18 : 55));
  g.addColorStop(0.55, hsl(hue + 40, 65, dark ? 12 : 38));
  g.addColorStop(1, hsl(hue + 80, 60, dark ? 6 : 20));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

const PAINTERS = {
  wellen(ctx, w, h, r, hue) {
    for (let i = 0; i < 7; i++) {
      const y0 = h * (0.25 + i * 0.11);
      const amp = h * (0.03 + r() * 0.06), freq = (1 + r() * 2.5) * Math.PI * 2 / w, ph = r() * 10;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 6) ctx.lineTo(x, y0 + Math.sin(x * freq + ph) * amp + Math.sin(x * freq * 2.3 + ph) * amp * 0.3);
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = hsl(hue + i * 14, 70, 60 - i * 6, 0.22 + i * 0.05);
      ctx.fill();
    }
  },
  geometrie(ctx, w, h, r, hue) {
    const n = 26;
    for (let i = 0; i < n; i++) {
      const s = Math.min(w, h) * (0.05 + r() * 0.35);
      ctx.save();
      ctx.translate(r() * w, r() * h);
      ctx.rotate(r() * Math.PI);
      ctx.globalAlpha = 0.15 + r() * 0.45;
      const col = hsl(hue + (r() < 0.3 ? 180 : r() * 60), 75, 55 + r() * 25);
      const filled = r() < 0.55;
      ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, s * 0.06);
      ctx.beginPath();
      const kind = Math.floor(r() * 3);
      if (kind === 0) ctx.arc(0, 0, s / 2, 0, Math.PI * 2);
      else if (kind === 1) { ctx.moveTo(0, -s / 2); ctx.lineTo(s / 2, s / 2); ctx.lineTo(-s / 2, s / 2); ctx.closePath(); }
      else ctx.rect(-s / 2, -s / 2, s, s * 0.6);
      filled ? ctx.fill() : ctx.stroke();
      ctx.restore();
    }
  },
  sakura(ctx, w, h, r, hue) {
    const mx = w * (0.55 + r() * 0.3), my = h * (0.18 + r() * 0.15), mr = Math.min(w, h) * (0.16 + r() * 0.08);
    const glow = ctx.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 3);
    glow.addColorStop(0, 'rgba(255,220,235,0.35)'); glow.addColorStop(1, 'rgba(255,220,235,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff1f6'; ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
    // Berge
    for (let l = 0; l < 3; l++) {
      ctx.beginPath(); ctx.moveTo(0, h);
      let y = h * (0.62 + l * 0.1);
      for (let x = 0; x <= w; x += w / 12) { y += (r() - 0.5) * h * 0.08; ctx.lineTo(x, y); }
      ctx.lineTo(w, h); ctx.closePath();
      ctx.fillStyle = hsl(hue + 300, 35, 14 - l * 4, 0.95); ctx.fill();
    }
    // Blütenblätter
    for (let i = 0; i < 60; i++) {
      const s = Math.min(w, h) * (0.012 + r() * 0.02);
      ctx.save(); ctx.translate(r() * w, r() * h); ctx.rotate(r() * Math.PI * 2);
      ctx.fillStyle = `rgba(255,${170 + Math.floor(r() * 60)},${200 + Math.floor(r() * 40)},${0.5 + r() * 0.5})`;
      ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  },
  neon(ctx, w, h, r, hue) {
    const hor = h * 0.58;
    const sky = ctx.createLinearGradient(0, 0, 0, hor);
    sky.addColorStop(0, hsl(hue + 260, 70, 8)); sky.addColorStop(1, hsl(hue + 320, 80, 30));
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, hor);
    const sr = Math.min(w, h) * 0.28, sx = w / 2, sy = hor - sr * 0.15;
    const sun = ctx.createLinearGradient(0, sy - sr, 0, sy + sr);
    sun.addColorStop(0, '#ffe36e'); sun.addColorStop(1, '#ff3d9a');
    ctx.save(); ctx.beginPath(); ctx.arc(sx, sy, sr, Math.PI, 0); ctx.closePath(); ctx.clip();
    ctx.fillStyle = sun; ctx.fillRect(sx - sr, sy - sr, sr * 2, sr);
    ctx.fillStyle = hsl(hue + 320, 80, 30);
    for (let i = 0; i < 6; i++) ctx.fillRect(sx - sr, sy - sr * 0.45 + i * sr * 0.09, sr * 2, sr * 0.02 + i * sr * 0.012);
    ctx.restore();
    ctx.fillStyle = '#0b0518'; ctx.fillRect(0, hor, w, h - hor);
    ctx.strokeStyle = 'rgba(255,60,200,0.85)'; ctx.lineWidth = Math.max(1.5, w / 400);
    for (let i = 1; i < 16; i++) { const y = hor + (h - hor) * Math.pow(i / 16, 1.8); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    for (let i = -12; i <= 12; i++) { ctx.beginPath(); ctx.moveTo(w / 2 + i * w * 0.02, hor); ctx.lineTo(w / 2 + i * w * 0.18, h); ctx.stroke(); }
  },
  kosmos(ctx, w, h, r, hue) {
    for (let i = 0; i < 5; i++) {
      const x = r() * w, y = r() * h, rad = Math.max(w, h) * (0.25 + r() * 0.4);
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, hsl(hue + r() * 120, 80, 55, 0.45)); g.addColorStop(1, hsl(hue, 80, 30, 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    for (let i = 0; i < 260; i++) {
      const s = r() < 0.95 ? r() * 1.6 + 0.3 : r() * 3 + 1.5;
      ctx.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`;
      ctx.beginPath(); ctx.arc(r() * w, r() * h, s * (w / 600), 0, Math.PI * 2); ctx.fill();
    }
    const pr = Math.min(w, h) * (0.14 + r() * 0.1), px = w * (0.2 + r() * 0.6), py = h * (0.2 + r() * 0.3);
    const pg = ctx.createRadialGradient(px - pr * 0.4, py - pr * 0.4, pr * 0.1, px, py, pr);
    pg.addColorStop(0, hsl(hue + 30, 70, 70)); pg.addColorStop(1, hsl(hue + 60, 60, 18));
    ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = hsl(hue + 30, 60, 75, 0.6); ctx.lineWidth = pr * 0.06;
    ctx.beginPath(); ctx.ellipse(px, py, pr * 1.7, pr * 0.42, -0.35, 0, Math.PI * 2); ctx.stroke();
  },
  pixel(ctx, w, h, r, hue) {
    const cell = Math.round(Math.min(w, h) / (10 + Math.floor(r() * 8)));
    for (let y = 0; y < h; y += cell) for (let x = 0; x < w; x += cell) {
      if (r() < 0.45) continue;
      ctx.fillStyle = hsl(hue + Math.floor(r() * 4) * 25, 70, 30 + r() * 40, 0.35 + r() * 0.5);
      ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
    }
  },
  aurora(ctx, w, h, r, hue) {
    ctx.fillStyle = hsl(hue + 200, 60, 6); ctx.fillRect(0, 0, w, h);
    for (let b = 0; b < 4; b++) {
      const base = h * (0.2 + b * 0.12), amp = h * 0.08;
      for (let x = 0; x < w; x += 3) {
        const y = base + Math.sin(x / w * Math.PI * (2 + b) + b * 3 + r()) * amp;
        const g = ctx.createLinearGradient(0, y - h * 0.25, 0, y);
        g.addColorStop(0, hsl(hue + 120 + b * 30, 90, 60, 0));
        g.addColorStop(1, hsl(hue + 120 + b * 30, 90, 60, 0.12));
        ctx.fillStyle = g; ctx.fillRect(x, y - h * 0.25, 3, h * 0.25);
      }
    }
    for (let i = 0; i < 120; i++) { ctx.fillStyle = `rgba(255,255,255,${r() * 0.8})`; ctx.fillRect(r() * w, r() * h * 0.6, 1.5 * w / 600, 1.5 * w / 600); }
    ctx.fillStyle = '#05070a'; ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += w / 30) ctx.lineTo(x, h * 0.85 - r() * h * 0.08);
    ctx.lineTo(w, h); ctx.fill();
  },
};

function wrapLines(ctx, text, maxW) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const wd of words) {
    const t = cur ? cur + ' ' + wd : wd;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = wd; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

function title(ctx, w, h, name, kind) {
  const font = '"Inter","Noto Sans","Segoe UI",sans-serif';
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = w * 0.03; ctx.shadowOffsetY = w * 0.008;
  ctx.fillStyle = '#fff';
  if (kind === 'icon') {
    ctx.font = `900 ${Math.round(h * 0.58)}px ${font}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText((name.trim()[0] || '?').toUpperCase(), w / 2, h / 2 + h * 0.03);
  } else {
    const pad = w * (kind === 'hero' ? 0.05 : 0.08);
    const maxW = w * (kind === 'hero' ? 0.6 : 0.84);
    let size = Math.round(kind === 'hero' ? h * 0.2 : w * 0.13);
    let lines;
    for (;;) {
      ctx.font = `850 ${size}px ${font}`;
      lines = wrapLines(ctx, name, maxW);
      if ((lines.length <= 3 && lines.every((l) => ctx.measureText(l).width <= maxW)) || size < 14) break;
      size -= 2;
    }
    const lh = size * 1.08;
    let y = h - pad - (lines.length - 1) * lh;
    // dunkler Verlauf hinter dem Text für Lesbarkeit
    ctx.shadowColor = 'transparent';
    const g = ctx.createLinearGradient(0, y - lh * 1.6, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g; ctx.fillRect(0, y - lh * 1.6, w, h);
    ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.fillStyle = '#fff';
    ctx.textBaseline = 'alphabetic';
    for (const l of lines) { ctx.fillText(l, pad, y); y += lh; }
  }
  ctx.restore();
}

/** Erzeugt ein Bild (data:-URL). kind: cover | hero | icon */
export function generateArt(name, { style = 'wellen', seed = 0, kind = 'cover', showName = true } = {}) {
  const size = { cover: [600, 900], hero: [1920, 620], icon: [512, 512] }[kind] || [600, 900];
  const [w, h] = size;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const r = rng(hash(name + '|' + style + '|' + seed + '|' + (kind === 'icon' ? 'i' : 'x')));
  const hue = hash(name + seed) % 360;
  background(ctx, w, h, r, hue, style);
  (PAINTERS[style] || PAINTERS.wellen)(ctx, w, h, r, hue);
  if (showName) title(ctx, w, h, name, kind);
  return c.toDataURL('image/jpeg', 0.9);
}

async function saveArt(gameId, kind, dataUrl) {
  const path = await invoke('save_artwork_data', { gameId, kind, data: dataUrl });
  const g = gameById(gameId);
  if (g) updateGame(gameId, { art: { ...g.art, [kind]: path || dataUrl } });
  return path;
}

/** Dialog: Stil wählen, würfeln, übernehmen */
export function openGenerator(gameId, onDone) {
  const g = gameById(gameId);
  if (!g) return;
  const st = { style: STYLES[hash(g.name) % STYLES.length][0], seed: Math.floor(Math.random() * 1e6), showName: true,
    take: { cover: !g.art?.cover, hero: !g.art?.hero, icon: !g.art?.icon } };
  if (!st.take.cover && !st.take.hero && !st.take.icon) st.take = { cover: true, hero: true, icon: true };
  const body = document.createElement('div');
  const m = openModal({
    title: `${icon('sparkle', 20)} Artwork generieren`, body, cls: 'wide',
    footer: `<div class="left"><button class="btn" data-roll>${icon('random', 16)} Neu würfeln</button></div><button class="btn" data-c>Abbrechen</button><button class="btn primary" data-ok>${icon('check', 16)} Übernehmen</button>`,
  });
  const draw = () => {
    const opt = { style: st.style, seed: st.seed, showName: st.showName };
    body.innerHTML = `
      <p class="hint" style="margin:0 0 12px">Einzigartiges Artwork aus dem Namen <b>${esc(g.name)}</b> – lokal erzeugt, ohne Internet. Gefällt’s nicht? Einfach neu würfeln.</p>
      <div class="filter-chips" style="margin-bottom:14px">${STYLES.map(([k, l]) => `<button data-style="${k}" class="${st.style === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="gen-grid">
        <label class="gen-item"><img src="${generateArt(g.name, { ...opt, kind: 'cover' })}" class="gen-cover-img"><span><input type="checkbox" data-take="cover" ${st.take.cover ? 'checked' : ''}> Cover</span></label>
        <div class="gen-right">
          <label class="gen-item"><img src="${generateArt(g.name, { ...opt, kind: 'hero' })}" class="gen-hero-img"><span><input type="checkbox" data-take="hero" ${st.take.hero ? 'checked' : ''}> Banner</span></label>
          <div style="display:flex;gap:16px;align-items:flex-end">
            <label class="gen-item"><img src="${generateArt(g.name, { ...opt, kind: 'icon' })}" class="gen-icon-img"><span><input type="checkbox" data-take="icon" ${st.take.icon ? 'checked' : ''}> Icon</span></label>
            <label class="toggle-line" style="flex:1;border:0"><div><b>Namen einblenden</b><span>Spielname auf Cover und Banner</span></div><span class="switch"><input type="checkbox" id="gen-name" ${st.showName ? 'checked' : ''}><span></span></span></label>
          </div>
        </div>
      </div>`;
    body.querySelectorAll('[data-style]').forEach((b) => b.onclick = () => { st.style = b.dataset.style; draw(); });
    body.querySelectorAll('[data-take]').forEach((c) => c.onchange = () => { st.take[c.dataset.take] = c.checked; });
    body.querySelector('#gen-name').onchange = (e) => { st.showName = e.target.checked; draw(); };
  };
  m.foot.querySelector('[data-roll]').onclick = () => { st.seed = Math.floor(Math.random() * 1e6); draw(); };
  m.foot.querySelector('[data-c]').onclick = m.close;
  m.foot.querySelector('[data-ok]').onclick = async () => {
    const kinds = Object.keys(st.take).filter((k) => st.take[k]);
    if (!kinds.length) { toast('Nichts ausgewählt', 'Hake Cover, Banner oder Icon an.'); return; }
    if (!isTauri) { toast('Demo-Modus', 'Speichern gibt es nur in der App.'); return; }
    try {
      for (const k of kinds) await saveArt(g.id, k, generateArt(g.name, { style: st.style, seed: st.seed, showName: st.showName, kind: k }));
      m.close();
      toast('Artwork erstellt', g.name, { type: 'ok' });
      onDone?.();
    } catch (e) { toast('Speichern fehlgeschlagen', String(e), { type: 'err' }); }
  };
  draw();
}

/** Für alle Spiele ohne Cover automatisch Artwork erzeugen */
export async function generateMissing() {
  const list = state.library.games.filter((g) => !g.art?.cover);
  if (!list.length) { toast('Alles schon schön', 'Jedes Spiel hat bereits ein Cover.'); return; }
  if (!isTauri) { toast('Demo-Modus', 'Speichern gibt es nur in der App.'); return; }
  let n = 0;
  for (const g of list) {
    const style = STYLES[hash(g.name) % STYLES.length][0];
    try {
      for (const k of ['cover', 'hero', 'icon']) {
        if (!g.art?.[k]) await saveArt(g.id, k, generateArt(g.name, { style, seed: 1, kind: k }));
      }
      n++;
    } catch (_) {}
  }
  toast(`${n} Artworks erstellt`, 'Gefällt dir eins nicht? Rechtsklick → Artwork generieren → neu würfeln.', { type: 'ok', timeout: 6000 });
}
