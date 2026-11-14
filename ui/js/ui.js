// Allgemeine Oberflächen-Bausteine: Icons, Hinweise, Dialoge, Tooltips.
import { fileSrc } from "./api.js";

export function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const P = {
  library: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  stats: '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  play: '<path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.8l-12-7.5A1 1 0 0 0 7 4.5z"/>',
  stop: '<rect x="5" y="5" width="14" height="14" rx="2.5"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  log: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  wine: '<path d="M8 3h8l-1 7a3 3 0 0 1-6 0z"/><path d="M12 13v7M8 21h8"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0 5 5L21 13l-8 8-3-3 8-8-1.3-1.3a4 4 0 0 0-5-5L14 5z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5"/><path d="M5 3h14"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>',
  palette: '<circle cx="13.5" cy="6.5" r="1.2"/><circle cx="17.5" cy="10.5" r="1.2"/><circle cx="8.5" cy="7.5" r="1.2"/><circle cx="6.5" cy="12.5" r="1.2"/><path d="M12 2a10 10 0 0 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4A5.6 5.6 0 0 0 22 9.8C22 5.5 17.5 2 12 2z"/>',
  github: '<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.4 8.5 8 9 4.6-.5 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  shortcut: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M9 15l6-6M10 9h5v5"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
};

export function icon(name, cls = "") {
  return `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || ""}</svg>`;
}

export function petalMark(cls = "ac-mark") {
  return `<svg class="${cls}" viewBox="-60 -80 120 150" aria-hidden="true"><path fill="currentColor" d="M0 62 C-50 30 -52 -38 -14 -72 L0 -56 L14 -72 C52 -38 50 30 0 62 Z"/></svg>`;
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Automatisches Cover, solange kein eigenes Artwork gesetzt ist. */
export function autoCover(game, { initials = false } = {}) {
  const h = hash(game.name || "x");
  const h1 = h % 360;
  const h2 = (h1 + 40 + ((h >> 9) % 80)) % 360;
  const text = initials
    ? esc((game.name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase())
    : esc(game.name);
  if (initials) return `<div class="auto-cover" style="--h1:${h1};--h2:${h2}">${text}</div>`;
  const kind = game.kind === "exe" ? "Windows" : game.kind === "appimage" ? "AppImage" : "Linux";
  return `<div class="auto-cover" style="--h1:${h1};--h2:${h2}">${petalMark()}<div class="ac-title">${text}</div><div class="ac-kind">${kind}</div></div>`;
}

export function coverHtml(game, opts) {
  const src = game.artwork?.cover;
  return src ? `<img src="${esc(fileSrc(src))}" alt="" loading="lazy" draggable="false">` : autoCover(game, opts);
}
export function thumbHtml(game) {
  const src = game.artwork?.icon || game.artwork?.cover;
  return src ? `<img src="${esc(fileSrc(src))}" alt="" loading="lazy" draggable="false">` : autoCover(game, { initials: true });
}
export function heroStyle(game) {
  const src = game.artwork?.hero || game.artwork?.cover;
  if (src) return `background-image:url('${fileSrc(src).replace(/'/g, "%27")}')`;
  const h = hash(game.name || "x") % 360;
  return `background: radial-gradient(70% 120% at 85% 20%, hsl(${(h + 60) % 360} 70% 45% / .55), transparent 60%), linear-gradient(120deg, hsl(${h} 45% 20%), hsl(${(h + 50) % 360} 55% 30%))`;
}

/* ---------- Hinweise ---------- */
export function toast(title, body = "", type = "info", ms = 4200, action = null) {
  const box = document.getElementById("toasts");
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.innerHTML = `${icon(type === "error" ? "alert" : type === "ok" ? "check" : "info")}<div class="tx"><b>${esc(title)}</b>${body ? esc(body) : ""}</div>`;
  if (action) {
    const b = document.createElement("button");
    b.className = "btn small";
    b.textContent = action.label;
    b.onclick = () => { action.run(); el.remove(); };
    el.appendChild(b);
  }
  const x = document.createElement("button");
  x.className = "btn ghost icon small";
  x.setAttribute("aria-label", "Schließen");
  x.innerHTML = icon("close");
  x.onclick = () => el.remove();
  el.appendChild(x);
  box.appendChild(el);
  if (ms) setTimeout(() => el.remove(), ms);
}

/* ---------- Dialoge ---------- */
export function openModal(html, { cls = "", onClose, backdropClose = true } = {}) {
  const root = document.getElementById("modal-root");
  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop";
  wrap.innerHTML = `<div class="modal ${cls}" role="dialog" aria-modal="true">${html}</div>`;
  const close = () => {
    wrap.remove();
    document.removeEventListener("keydown", onKey, true);
    onClose && onClose();
  };
  const onKey = (e) => {
    if (e.key === "Escape" && root.lastElementChild === wrap) { e.stopPropagation(); close(); }
  };
  document.addEventListener("keydown", onKey, true);
  wrap.addEventListener("mousedown", (e) => { if (backdropClose && e.target === wrap) close(); });
  wrap.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
  root.appendChild(wrap);
  const first = wrap.querySelector("[autofocus], input, select, textarea, button:not([data-close])");
  first && setTimeout(() => first.focus(), 30);
  return { el: wrap.firstElementChild, close };
}

export function confirmDialog(title, text, okLabel = "OK", danger = false) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal(
      `<div class="modal-head"><h2>${esc(title)}</h2></div>
       <div class="modal-body"><p style="margin:0;color:var(--muted)">${esc(text)}</p></div>
       <div class="modal-foot"><button class="btn ghost" data-close>Abbrechen</button><button class="btn ${danger ? "danger" : "primary"}" data-ok>${esc(okLabel)}</button></div>`,
      { cls: "narrow", onClose: () => { if (!done) resolve(false); } },
    );
    m.el.querySelector("[data-ok]").addEventListener("click", () => { done = true; resolve(true); m.close(); });
    setTimeout(() => m.el.querySelector("[data-ok]").focus(), 40);
  });
}

/* ---------- Tooltip ---------- */
let tipEl = null;
export function showTip(x, y, html) {
  if (!tipEl) {
    tipEl = document.createElement("div");
    tipEl.className = "tooltip";
    document.body.appendChild(tipEl);
  }
  tipEl.innerHTML = html;
  tipEl.style.left = x + "px";
  tipEl.style.top = y + "px";
  tipEl.style.display = "block";
}
export function hideTip() {
  if (tipEl) tipEl.style.display = "none";
}
