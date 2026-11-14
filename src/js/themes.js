// Eingebaute Themes (dunkel & hell) + externe Themes aus JSON-Dateien.
import { state } from './store.js';

export const THEMES = [
  { id: 'sakura-night', name: 'Sakura Nacht', mode: 'dark', colors: { bg: '#0c0a12', bg2: '#13101c', panel: '#1a1526', text: '#f4f0fa', dim: '#a59db8', accent: '#ff6fae', accent2: '#9b5cff' } },
  { id: 'midnight', name: 'Mitternacht', mode: 'dark', colors: { bg: '#080c16', bg2: '#0d1322', panel: '#121a2d', text: '#eef3ff', dim: '#93a1c2', accent: '#4da3ff', accent2: '#7b6cff' } },
  { id: 'neon-tokyo', name: 'Neon Tokyo', mode: 'dark', colors: { bg: '#07070c', bg2: '#0d0c16', panel: '#14121f', text: '#f5f3ff', dim: '#9d97bb', accent: '#ff2bd6', accent2: '#00e5ff' } },
  { id: 'amethyst', name: 'Amethyst', mode: 'dark', colors: { bg: '#100b18', bg2: '#170f22', panel: '#201632', text: '#f6f0ff', dim: '#ab9cc6', accent: '#b57bff', accent2: '#6d5dfc' } },
  { id: 'forest', name: 'Waldlicht', mode: 'dark', colors: { bg: '#0a110d', bg2: '#0f1813', panel: '#14201a', text: '#ecf7f0', dim: '#94b3a2', accent: '#3ddc97', accent2: '#2bb3c0' } },
  { id: 'ember', name: 'Glut', mode: 'dark', colors: { bg: '#120b0a', bg2: '#1a100e', panel: '#231613', text: '#fff3ef', dim: '#c3a49b', accent: '#ff7a3d', accent2: '#ff3d6e' } },
  { id: 'oled', name: 'OLED Schwarz', mode: 'dark', colors: { bg: '#000000', bg2: '#050505', panel: '#0e0e10', text: '#f2f2f2', dim: '#9a9aa0', accent: '#e8e8ee', accent2: '#8f8fa3' }, onAccent: '#111' },
  { id: 'deck', name: 'Deck Blau', mode: 'dark', colors: { bg: '#0e141b', bg2: '#141c25', panel: '#1b2530', text: '#e9f1f8', dim: '#8ea3b5', accent: '#1a9fff', accent2: '#5bc0ff' } },
  { id: 'blossom-light', name: 'Kirschblüte Hell', mode: 'light', colors: { bg: '#fbf4f8', bg2: '#f5e9f0', panel: '#ffffff', text: '#2a1f2d', dim: '#7a6a80', accent: '#e8478f', accent2: '#8b5cf6' } },
  { id: 'paper', name: 'Papier', mode: 'light', colors: { bg: '#f4f4f1', bg2: '#ebebe6', panel: '#ffffff', text: '#1f1f24', dim: '#6c6c75', accent: '#4f46e5', accent2: '#0ea5e9' } },
  { id: 'sky', name: 'Himmel', mode: 'light', colors: { bg: '#f1f6fc', bg2: '#e6eef8', panel: '#ffffff', text: '#18243a', dim: '#5f708a', accent: '#0f8cf0', accent2: '#14b8a6' } },
];

export const ACCENTS = ['#ff6fae', '#9b5cff', '#4da3ff', '#00d1c1', '#3ddc97', '#ffb547', '#ff7a3d', '#ff4d6d', '#e8e8ee'];

export function hexToRgb(hex) {
  let h = String(hex || '').replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  if (Number.isNaN(n) || h.length !== 6) return '255, 111, 174';
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

function rgba(hex, a) { return `rgba(${hexToRgb(hex)}, ${a})`; }

export function allThemes() {
  return [...THEMES, ...(state.settings.customThemes || []).map((t) => ({ ...t, custom: true }))];
}

let customStyle = null;

export function applyTheme() {
  const s = state.settings;
  const theme = allThemes().find((t) => t.id === s.theme) || THEMES[0];
  const c = { ...THEMES[0].colors, ...(theme.colors || {}) };
  const accent = s.accent || c.accent;
  const light = theme.mode === 'light';
  const root = document.documentElement;
  root.dataset.mode = light ? 'light' : 'dark';
  const vars = {
    '--bg': c.bg,
    '--bg-2': c.bg2 || c.bg,
    '--panel': rgba(c.panel, light ? 0.9 : 0.86),
    '--panel-solid': c.panel,
    '--panel-2': rgba(c.panel, 0.9),
    '--border': light ? 'rgba(30, 20, 50, 0.09)' : 'rgba(255, 255, 255, 0.08)',
    '--border-strong': light ? 'rgba(30, 20, 50, 0.16)' : 'rgba(255, 255, 255, 0.15)',
    '--text': c.text,
    '--text-dim': c.dim,
    '--text-faint': rgba(c.dim, 0.75),
    '--accent': accent,
    '--accent-2': c.accent2,
    '--accent-rgb': hexToRgb(accent),
    '--accent-2-rgb': hexToRgb(c.accent2),
    '--on-accent': theme.onAccent || '#ffffff',
    '--card-w': (s.cardSize || 190) + 'px',
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  document.body.classList.toggle('reduce-motion', !!s.reduceMotion);
  document.body.classList.toggle('no-effects', !s.effects);
  document.body.classList.toggle('lite', !!s.lite);
  if (!customStyle) { customStyle = document.createElement('style'); document.head.append(customStyle); }
  customStyle.textContent = theme.css || '';
  renderPetals();
}

function renderPetals() {
  const box = document.getElementById('petals');
  if (!box) return;
  const want = state.settings.petals && state.settings.effects && !state.settings.reduceMotion && !state.settings.lite;
  if (!want) { box.innerHTML = ''; return; }
  if (box.childElementCount) return;
  for (let i = 0; i < 12; i++) {
    const p = document.createElement('i');
    p.className = 'petal';
    p.style.left = Math.random() * 100 + 'vw';
    p.style.animationDuration = 12 + Math.random() * 14 + 's';
    p.style.animationDelay = -Math.random() * 20 + 's';
    p.style.transform = `scale(${0.6 + Math.random() * 0.8})`;
    p.style.opacity = 0.25 + Math.random() * 0.4;
    box.append(p);
  }
}

/** Prüft eine importierte Theme-Datei und gibt ein Theme-Objekt zurück. */
export function parseThemeFile(text) {
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object') throw new Error('Keine gültige Theme-Datei.');
  const raw = data.colors || {};
  // auch alternative Schlüssel akzeptieren (surface/muted/type)
  const colors = { ...raw, panel: raw.panel || raw.surface, dim: raw.dim || raw.muted };
  if (!data.mode && data.type) data.mode = data.type;
  const need = ['bg', 'panel', 'text', 'accent'];
  for (const k of need) if (!colors[k]) throw new Error(`Farbe "${k}" fehlt in der Theme-Datei.`);
  const name = String(data.name || 'Eigenes Theme').slice(0, 40);
  return {
    id: 'custom-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString(36),
    name,
    author: String(data.author || '').slice(0, 40),
    mode: data.mode === 'light' ? 'light' : 'dark',
    colors: {
      bg: colors.bg, bg2: colors.bg2 || colors.bg, panel: colors.panel, text: colors.text,
      dim: colors.dim || colors.text, accent: colors.accent, accent2: colors.accent2 || colors.accent,
    },
    onAccent: data.onAccent || undefined,
    css: typeof data.css === 'string' ? data.css.slice(0, 20000) : '',
  };
}

export const THEME_TEMPLATE = {
  name: 'Mein Theme',
  author: 'Dein Name',
  mode: 'dark',
  colors: {
    bg: '#0c0a12',
    bg2: '#13101c',
    panel: '#1a1526',
    text: '#f4f0fa',
    dim: '#a59db8',
    accent: '#ff6fae',
    accent2: '#9b5cff',
  },
  onAccent: '#ffffff',
  css: '/* Optional: eigenes CSS, z. B. .card .cover { border-radius: 4px; } */',
};
