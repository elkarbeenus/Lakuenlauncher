// Schlanke SVG-Diagramme (ohne Fremdbibliothek). Eine Datenreihe pro Diagramm,
// eine Farbe (Akzent), dünne Balken mit abgerundeten Enden, Tooltip beim Überfahren.
import { esc } from "./ui.js";
import { fmtDuration } from "./store.js";

const DAY = 86400000;

export function startOfDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Verteilt Sitzungen auf Kalendertage (Sitzungen über Mitternacht werden aufgeteilt). */
export function secondsPerDay(sessions) {
  const map = new Map();
  for (const s of sessions) {
    let a = s.start;
    const b = s.end || s.start + (s.seconds || 0) * 1000;
    while (a < b) {
      const day = startOfDay(a);
      const next = Math.min(b, day + DAY);
      map.set(day, (map.get(day) || 0) + (next - a) / 1000);
      a = next;
    }
  }
  return map;
}

function niceStep(maxSec) {
  const steps = [600, 1800, 3600, 7200, 10800, 18000, 36000, 72000, 180000, 360000, 720000];
  for (const st of steps) if (maxSec / st <= 4) return st;
  return Math.ceil(maxSec / 4 / 3600) * 3600;
}
function tickLabel(sec) {
  return sec < 3600 ? `${Math.round(sec / 60)} Min.` : `${Math.round(sec / 3600)} Std.`;
}

/**
 * Balkendiagramm.
 * @param {{label:string, tip:string, value:number}[]} items
 */
export function barChart(items, { height = 220, labelEvery = 1 } = {}) {
  const W = 720, H = height, padL = 62, padR = 6, padT = 10, padB = 30;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const max = Math.max(...items.map((i) => i.value), 0);
  const step = niceStep(max || 3600);
  const top = Math.max(step, Math.ceil((max || 1) / step) * step);
  const n = items.length || 1;
  const slot = innerW / n;
  const gap = Math.max(2, slot * 0.28);
  const bw = Math.max(2, slot - gap);
  let out = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">`;
  for (let v = 0; v <= top; v += step) {
    const y = padT + innerH - (v / top) * innerH;
    out += `<line class="grid-line" x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}"/>`;
    out += `<text x="${padL - 8}" y="${y + 5}" text-anchor="end">${v === 0 ? "0" : tickLabel(v)}</text>`;
  }
  items.forEach((it, i) => {
    const x = padL + i * slot + gap / 2;
    const h = top ? (it.value / top) * innerH : 0;
    const y = padT + innerH - h;
    if (h > 0.5) {
      const r = Math.min(4, bw / 2, h);
      out += `<path class="bar" d="M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${y + h} Z"/>`;
    }
    out += `<rect class="hit" x="${padL + i * slot}" y="${padT}" width="${slot}" height="${innerH}" data-tip="${esc(it.tip)}"/>`;
    if (i % labelEvery === 0 || i === n - 1) {
      out += `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${esc(it.label)}</text>`;
    }
  });
  return out + "</svg>";
}

/** Aktivitäts-Kalender der letzten `weeks` Wochen (eine Farbe, heller → kräftiger). */
export function heatmap(perDay, weeks = 26) {
  const cell = 13, gap = 3, padL = 26, padT = 18;
  const today = startOfDay(Date.now());
  const dow = (new Date(today).getDay() + 6) % 7; // Montag = 0
  const start = today - (dow + (weeks - 1) * 7) * DAY;
  const values = [...perDay.values()];
  const max = Math.max(3600, ...values);
  const level = (v) => (v <= 0 ? 0 : v < max * 0.15 ? 1 : v < max * 0.35 ? 2 : v < max * 0.65 ? 3 : 4);
  const fills = [
    "var(--surface2)",
    "color-mix(in srgb, var(--accent) 28%, var(--surface2))",
    "color-mix(in srgb, var(--accent) 52%, var(--surface2))",
    "color-mix(in srgb, var(--accent) 76%, var(--surface2))",
    "var(--accent)",
  ];
  const W = padL + weeks * (cell + gap), H = padT + 7 * (cell + gap);
  let out = `<svg class="chart heat" viewBox="0 0 ${W} ${H}" role="img">`;
  ["Mo", "Mi", "Fr"].forEach((d, i) => {
    out += `<text x="0" y="${padT + i * 2 * (cell + gap) + cell - 2}">${d}</text>`;
  });
  let lastMonth = -1;
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const day = start + (w * 7 + d) * DAY;
      if (day > today) continue;
      const date = new Date(day);
      if (d === 0 && date.getMonth() !== lastMonth) {
        lastMonth = date.getMonth();
        if (w < weeks - 1) out += `<text x="${padL + w * (cell + gap)}" y="11">${date.toLocaleDateString("de-DE", { month: "short" })}</text>`;
      }
      const v = perDay.get(day) || 0;
      const tip = `${date.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "long" })}<span>${v ? fmtDuration(v) : "nicht gespielt"}</span>`;
      out += `<rect x="${padL + w * (cell + gap)}" y="${padT + d * (cell + gap)}" width="${cell}" height="${cell}" rx="3" fill="${fills[level(v)]}" data-tip="${esc(tip)}"/>`;
    }
  }
  out += "</svg>";
  out += `<div class="heat-legend">Weniger ${fills.map((f) => `<i style="background:${f}"></i>`).join("")} Mehr</div>`;
  return out;
}
