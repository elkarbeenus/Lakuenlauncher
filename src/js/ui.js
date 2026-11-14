// Kleine UI-Bausteine: Icons, Elemente, Toasts, Dialoge, Kontextmenü, Formatierung.
import { fileSrc } from './api.js';

const P = {
  play: '<path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" stroke="none"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/>',
  star: '<path d="m12 3.8 2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8z"/>',
  starFill: '<path d="m12 3.8 2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8z" fill="currentColor"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  chart: '<path d="M4 20h16"/><rect x="5.5" y="11" width="3" height="6.5" rx="1"/><rect x="10.5" y="6" width="3" height="11.5" rx="1"/><rect x="15.5" y="13.5" width="3" height="4" rx="1"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  folder: '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  trash: '<path d="M4.5 7h15M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 1.8h6a2 2 0 0 0 2-1.8L18 7M9 7V4.8h6V7"/>',
  edit: '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m4 18 5-5 4 4 2.5-2.5L20 19"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  left: '<path d="m14.5 6-6 6 6 6"/>',
  right: '<path d="m9.5 6 6 6-6 6"/>',
  down: '<path d="m6 9.5 6 6 6-6"/>',
  download: '<path d="M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5M4.5 19.5h15"/>',
  upload: '<path d="M12 15V4m0 0 4.5 4.5M12 4 7.5 8.5M4.5 19.5h15"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3L19.5 9"/><path d="M19.5 4v5h-5"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.2"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
  sparkle: '<path d="M12 3.5c.6 4.2 2.3 5.9 6.5 6.5-4.2.6-5.9 2.3-6.5 6.5-.6-4.2-2.3-5.9-6.5-6.5 4.2-.6 5.9-2.3 6.5-6.5z"/><path d="M18.5 15.5c.3 1.8 1 2.5 2.8 2.8-1.8.3-2.5 1-2.8 2.8-.3-1.8-1-2.5-2.8-2.8 1.8-.3 2.5-1 2.8-2.8z"/>',
  terminal: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="m7.5 9.5 3 2.5-3 2.5M12.5 15h4"/>',
  wine: '<path d="M8 3.5h8l-.5 5.5a3.5 3.5 0 0 1-7 0z"/><path d="M12 12.5v7M8.5 20h7"/>',
  layers: '<path d="m12 4 8.5 4.5L12 13 3.5 8.5z"/><path d="m3.5 12.5 8.5 4.5 8.5-4.5M3.5 16.5 12 21l8.5-4.5"/>',
  home: '<path d="M4 11 12 4l8 7v8.5a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  external: '<path d="M14 4.5h5.5V10M19.5 4.5 11 13M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7.5 14h9"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.1-.9-1.4-.9-2.4 0-.9.7-1.5 1.6-1.5h2.2a3.8 3.8 0 0 0 3.8-3.8c0-4.2-3.8-7.6-8.5-7.6z"/><circle cx="7.8" cy="11" r="1.1" fill="currentColor"/><circle cx="10.5" cy="7.4" r="1.1" fill="currentColor"/><circle cx="15" cy="7.8" r="1.1" fill="currentColor"/>',
  gamepad: '<path d="M7.5 7.5h9a4.5 4.5 0 0 1 4.4 5.4l-.8 4a2.5 2.5 0 0 1-4.4 1L14 16h-4l-1.7 1.9a2.5 2.5 0 0 1-4.4-1l-.8-4a4.5 4.5 0 0 1 4.4-5.4z"/><path d="M8 10.5v3M6.5 12h3"/><circle cx="15.5" cy="11" r=".9" fill="currentColor"/><circle cx="17.3" cy="13" r=".9" fill="currentColor"/>',
  zap: '<path d="M13 3.5 5 13.5h6l-1 7 8-10h-6z"/>',
  box: '<path d="m12 3.5 8 4.2v8.6l-8 4.2-8-4.2V7.7z"/><path d="m4 7.7 8 4.3 8-4.3M12 12v8.5"/>',
  file: '<path d="M6.5 3.5h7l4.5 4.5v11a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5z"/><path d="M13.5 3.5V8H18"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  heart: '<path d="M12 20s-7.5-4.5-7.5-10A4.2 4.2 0 0 1 12 7.5 4.2 4.2 0 0 1 19.5 10c0 5.5-7.5 10-7.5 10z"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  eyeOff: '<path d="M4 4l16 16M10 6a9.6 9.6 0 0 1 2-.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.6 3.4M6.5 7.6A15.6 15.6 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.4-1.1"/>',
  shield: '<path d="M12 3.5 19 6v5.5c0 4.3-3 7.7-7 9-4-1.3-7-4.7-7-9V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  trophy: '<path d="M8 4.5h8v5a4 4 0 0 1-8 0z"/><path d="M8 6.5H5a3 3 0 0 0 3 4M16 6.5h3a3 3 0 0 1-3 4M12 13.5v3.5M8.5 20h7M9.5 17h5"/>',
  fire: '<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.4 2.5-5.3 3.5-8.3 1.6 1.3 2.2 2.8 2.2 4.3 1.1-.8 1.9-2.3 1.9-4.3 3 2 5.4 5.3 5.4 8.5 0 3.5-2.6 6-6.5 6z"/>',
  sun: '<circle cx="12" cy="12" r="3.8"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
  moon: '<path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10z"/>',
  scan: '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M4 12h16"/>',
  logs: '<path d="M7 4.5h10a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 18V6A1.5 1.5 0 0 1 7 4.5z"/><path d="M8.5 9h7M8.5 12h7M8.5 15h4"/>',
  tag: '<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.6 6.6a1.5 1.5 0 0 1-2.1 0z"/><circle cx="8" cy="8" r="1.4" fill="currentColor"/>',
  random: '<path d="M4 7h3.5c4 0 5 10 9 10H20M4 17h3.5c1.4 0 2.4-1.2 3.3-2.8M13.2 9.8C14.1 8.2 15 7 16.5 7H20M17.5 4.5 20 7l-2.5 2.5M17.5 14.5 20 17l-2.5 2.5"/>',
};

export function icon(name, size = 18, cls = '') {
  return `<svg class="svg-i ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** HTML-String → Element */
export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---------- Formatierung ----------
export function fmtDuration(secs, long = false) {
  secs = Math.max(0, Math.round(secs || 0));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h === 0 && m === 0) return secs > 0 ? (long ? `${secs} Sekunden` : `${secs} s`) : (long ? 'Noch nicht gespielt' : '0 Min.');
  if (h === 0) return `${m} Min.`;
  if (h < 10 && m) return `${h} Std. ${m} Min.`;
  return `${h.toLocaleString('de-DE')} Std.`;
}

export function fmtHours(secs) {
  const h = (secs || 0) / 3600;
  if (h < 1) return `${Math.round((secs || 0) / 60)}<small> Min.</small>`;
  return `${h.toLocaleString('de-DE', { maximumFractionDigits: h < 10 ? 1 : 0 })}<small> Std.</small>`;
}

export function fmtClock(secs) {
  secs = Math.max(0, Math.floor(secs));
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
}

export function fmtRelative(ms) {
  if (!ms) return 'Nie';
  const diff = Date.now() - ms;
  const min = diff / 60000;
  if (min < 1) return 'Gerade eben';
  if (min < 60) return `Vor ${Math.round(min)} Min.`;
  const hrs = min / 60;
  if (hrs < 24) return `Vor ${Math.round(hrs)} Std.`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Gestern';
  if (days < 7) return `Vor ${days} Tagen`;
  return new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDate(ms, withTime = true) {
  const d = new Date(ms);
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short' }) +
    (withTime ? ' · ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '');
}

export function fmtSize(b) {
  if (!b) return '–';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return `${b.toLocaleString('de-DE', { maximumFractionDigits: 1 })} ${u[i]}`;
}

export function kindLabel(kind) {
  return { exe: 'Windows', appimage: 'AppImage', native: 'Linux' }[kind] || 'App';
}

// ---------- Cover ----------
function hashHue(str) {
  let h = 0;
  for (const c of str || '') h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 360;
}

export function coverHTML(game, { kind = 'cover' } = {}) {
  const art = game.art || {};
  const src = kind === 'icon' ? (art.icon || art.cover) : art.cover;
  if (src) return `<img src="${esc(fileSrc(src))}" alt="" loading="lazy" decoding="async" draggable="false" />`;
  const hue = hashHue(game.name);
  const bg = `linear-gradient(150deg, hsl(${hue} 70% 58%), hsl(${(hue + 50) % 360} 65% 38%) 60%, hsl(${(hue + 90) % 360} 60% 22%))`;
  const letter = esc((game.name || '?').trim().charAt(0).toUpperCase());
  return `<div class="gen-cover" style="background:${bg}"><div class="letter">${letter}</div><div class="gname">${esc(game.name)}</div><div class="gkind">${kindLabel(game.kind)}</div></div>`;
}

export function heroBg(game) {
  const art = game.art || {};
  if (art.hero) return { url: fileSrc(art.hero), blur: false };
  if (art.cover) return { url: fileSrc(art.cover), blur: true };
  return null;
}

// Weichgezeichnete Hintergründe ohne teuren CSS-Filter: Bild auf ein winziges
// Canvas verkleinern – beim Hochskalieren wirkt es von selbst unscharf. Ergebnis wird gecacht.
const blurCache = new Map();
export function blurred(src) {
  if (!src) return Promise.resolve(null);
  if (blurCache.has(src)) return blurCache.get(src);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const w = 40, h = Math.max(1, Math.round((40 * img.naturalHeight) / Math.max(1, img.naturalWidth)));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.filter = 'saturate(1.35)';
        ctx.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/png'));
      } catch (_) { resolve('CSS'); } // Canvas gesperrt -> CSS-Filter als Rückfall
    };
    img.onerror = () => resolve('CSS');
    img.src = src;
  });
  blurCache.set(src, p);
  return p;
}

/** Elemente mit data-blur-src bekommen ihren weichgezeichneten Hintergrund. */
export function applyBlur(root) {
  root.querySelectorAll('[data-blur-src]').forEach(async (el) => {
    const src = el.dataset.blurSrc;
    const url = await blurred(src);
    if (url === 'CSS') { el.style.backgroundImage = `url('${src}')`; el.style.filter = 'blur(24px)'; el.style.transform = 'scale(1.15)'; }
    else if (url) el.style.backgroundImage = `url('${url}')`;
  });
}

export function genGradient(name) {
  const hue = hashHue(name);
  return `linear-gradient(120deg, hsl(${hue} 65% 40%), hsl(${(hue + 60) % 360} 60% 22%))`;
}

// ---------- Toasts ----------
export function toast(title, text = '', { type = 'info', timeout = 4200, actions = [] } = {}) {
  const ic = { info: 'info', ok: 'check', err: 'x' }[type] || 'info';
  const el = h(`<div class="toast ${type}"><div class="ti">${icon(ic, 16)}</div><div class="tt"><b>${esc(title)}</b>${text ? `<span>${esc(text)}</span>` : ''}<div class="ta"></div></div></div>`);
  const ta = el.querySelector('.ta');
  if (!actions.length) ta.remove();
  actions.forEach((a) => {
    const b = h(`<button class="btn small ${a.primary ? 'primary' : ''}">${esc(a.label)}</button>`);
    b.onclick = () => { a.onClick?.(); close(); };
    ta.append(b);
  });
  document.getElementById('toasts').append(el);
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 260); };
  if (timeout) setTimeout(close, timeout);
  el.addEventListener('click', (e) => { if (!e.target.closest('button')) close(); });
  return close;
}

// ---------- Modale Dialoge ----------
const modalStack = [];
export function openModal({ title, body, footer = '', cls = '', onClose } = {}) {
  const back = h(`<div class="modal-back"><div class="modal ${cls}"><div class="modal-head"><h2>${title}</h2><button class="btn ghost icon" data-close>${icon('x')}</button></div><div class="modal-body"></div>${footer !== null ? '<div class="modal-foot"></div>' : ''}</div></div>`);
  const bodyEl = back.querySelector('.modal-body');
  if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.append(body);
  const foot = back.querySelector('.modal-foot');
  if (foot) { if (typeof footer === 'string') foot.innerHTML = footer; else foot.append(footer); }
  const close = () => {
    back.remove();
    const i = modalStack.indexOf(close);
    if (i >= 0) modalStack.splice(i, 1);
    onClose?.();
  };
  back.addEventListener('mousedown', (e) => { if (e.target === back) back.dataset.down = '1'; });
  back.addEventListener('mouseup', (e) => { if (e.target === back && back.dataset.down) close(); back.dataset.down = ''; });
  back.querySelector('[data-close]').onclick = close;
  document.getElementById('overlay-root').append(back);
  modalStack.push(close);
  return { el: back, body: bodyEl, foot, close };
}

export function closeTopModal() {
  const c = modalStack[modalStack.length - 1];
  if (c) { c(); return true; }
  return false;
}

export function hasModal() { return modalStack.length > 0; }

export function confirmDialog(title, text, { ok = 'OK', danger = false, cancel = 'Abbrechen', extra } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal({
      title: esc(title), cls: 'narrow',
      body: `<p style="margin:0 0 6px;color:var(--text-dim)">${text}</p>${extra ? `<label class="toggle-line" style="border:0"><span>${esc(extra)}</span><span class="switch"><input type="checkbox" id="cd-extra"><span></span></span></label>` : ''}`,
      footer: `<button class="btn" data-c>${esc(cancel)}</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(ok)}</button>`,
      onClose: () => { if (!done) resolve(false); },
    });
    m.foot.querySelector('[data-c]').onclick = () => m.close();
    m.foot.querySelector('[data-ok]').onclick = () => {
      done = true;
      const ex = m.body.querySelector('#cd-extra');
      m.close();
      resolve(extra ? { ok: true, extra: !!ex?.checked } : true);
    };
    setTimeout(() => m.foot.querySelector('[data-ok]').focus(), 30);
  });
}

export function promptDialog(title, { value = '', placeholder = '', ok = 'Speichern' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal({
      title: esc(title), cls: 'narrow',
      body: `<input class="input" id="pd-in" value="${esc(value)}" placeholder="${esc(placeholder)}" />`,
      footer: `<button class="btn" data-c>Abbrechen</button><button class="btn primary" data-ok>${esc(ok)}</button>`,
      onClose: () => { if (!done) resolve(null); },
    });
    const inp = m.body.querySelector('#pd-in');
    const submit = () => { done = true; const v = inp.value.trim(); m.close(); resolve(v || null); };
    m.foot.querySelector('[data-c]').onclick = () => m.close();
    m.foot.querySelector('[data-ok]').onclick = submit;
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    setTimeout(() => { inp.focus(); inp.select(); }, 30);
  });
}

// ---------- Kontextmenü ----------
let ctxEl = null;
export function contextMenu(x, y, items) {
  closeContext();
  ctxEl = h('<div class="ctx"></div>');
  items.forEach((it) => {
    if (it === '-') { ctxEl.append(h('<hr>')); return; }
    if (!it) return;
    const b = h(`<button class="${it.danger ? 'danger' : ''}">${icon(it.icon || 'right', 16)}<span>${esc(it.label)}</span></button>`);
    b.onclick = () => { closeContext(); it.onClick(); };
    ctxEl.append(b);
  });
  document.body.append(ctxEl);
  const r = ctxEl.getBoundingClientRect();
  ctxEl.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
  ctxEl.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
}
export function closeContext() { ctxEl?.remove(); ctxEl = null; }
document.addEventListener('mousedown', (e) => { if (ctxEl && !ctxEl.contains(e.target)) closeContext(); });
window.addEventListener('blur', closeContext);
