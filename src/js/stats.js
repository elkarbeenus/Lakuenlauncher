// Statistik-Seite: Gesamtzeit, Verlauf, Aktivitätskalender, Top-Spiele, Wochentage.
import { state, stats, secondsByDay, dayKey, gameById } from './store.js';
import { icon, esc, fmtHours, fmtDuration, coverHTML } from './ui.js';

let nav = () => {};
export function wireStats({ navigate }) { nav = navigate; }

/** Einfaches SVG-Balkendiagramm. data: [{label, value, title}] */
export function barChart(data, { unit = 'Std.', height = 220 } = {}) {
  const w = 900, hgt = height, padL = 34, padB = 24, padT = 10;
  const max = Math.max(0.0001, ...data.map((d) => d.value));
  const nice = niceMax(max);
  const bw = (w - padL) / data.length;
  const every = Math.ceil(data.length / 15);
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const y = padT + (hgt - padT - padB) * (1 - f);
    const v = nice * f;
    return `<line class="grid-line" x1="${padL}" x2="${w}" y1="${y}" y2="${y}"/><text class="axis" x="${padL - 6}" y="${y + 3}" text-anchor="end">${fmtAxis(v)}</text>`;
  }).join('');
  const bars = data.map((d, i) => {
    const bh = ((hgt - padT - padB) * d.value) / nice;
    const x = padL + i * bw + bw * 0.18;
    const y = hgt - padB - bh;
    const lbl = i % every === 0 ? `<text class="axis" x="${x + bw * 0.32}" y="${hgt - 6}" text-anchor="middle">${esc(d.label)}</text>` : '';
    return `<rect class="bar" x="${x}" y="${y}" width="${Math.max(2, bw * 0.64)}" height="${Math.max(d.value > 0 ? 2 : 0, bh)}" rx="${Math.min(6, bw * 0.25)}"><title>${esc(d.title || d.label)}: ${fmtDuration(d.value * 3600)}</title></rect>${lbl}`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${w} ${hgt}" style="height:auto">
    <defs><linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)"/><stop offset="1" stop-color="var(--accent-2)"/></linearGradient></defs>
    ${gridLines}${bars}</svg>`;
}

function niceMax(v) {
  if (v <= 0.25) return 0.25;
  if (v <= 0.5) return 0.5;
  if (v <= 1) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 4, 8, 10]) if (m * p >= v) return m * p;
  return v;
}
function fmtAxis(h) {
  if (h === 0) return '0';
  if (h < 1) return Math.round(h * 60) + 'm';
  return (Math.round(h * 10) / 10).toLocaleString('de-DE') + 'h';
}

function streak(days) {
  let cur = 0, best = 0, run = 0;
  const d = new Date();
  // aktuelle Serie (heute oder gestern beginnend)
  if (!days.get(dayKey(d))) d.setDate(d.getDate() - 1);
  while (days.get(dayKey(d))) { cur++; d.setDate(d.getDate() - 1); }
  const keys = [...days.keys()].sort();
  let prev = null;
  for (const k of keys) {
    const t = new Date(k + 'T12:00:00').getTime();
    run = prev && t - prev < 1.5 * 86400000 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return { cur, best };
}

export function renderStatsTop(top) {
  const r = state.view.range || 30;
  top.innerHTML = `<h1>Statistik</h1><div class="spacer"></div>
    <div class="seg">${[[7, '7 Tage'], [30, '30 Tage'], [90, '90 Tage'], [365, '12 Monate']].map(([v, l]) => `<button data-r="${v}" class="${r === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  top.querySelectorAll('[data-r]').forEach((b) => b.onclick = () => nav({ name: 'stats', range: +b.dataset.r }));
}

export function renderStats(content) {
  const range = state.view.range || 30;
  const st = stats();
  const days = secondsByDay();
  const now = new Date();
  const since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - range + 1).getTime();
  const inRange = state.sessions.filter((s) => s.end >= since);
  const rangeSecs = [...days.entries()].filter(([k]) => new Date(k + 'T12:00:00').getTime() >= since).reduce((a, [, v]) => a + v, 0);
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7)).getTime();
  const weekSecs = [...days.entries()].filter(([k]) => new Date(k + 'T12:00:00').getTime() >= weekStart).reduce((a, [, v]) => a + v, 0);
  const longest = state.sessions.reduce((m, s) => (s.secs > (m?.secs || 0) ? s : m), null);
  const { cur, best } = streak(days);

  if (!state.sessions.length) {
    content.innerHTML = `<div class="empty"><div class="big-icon">${icon('chart', 48)}</div><h2>Noch keine Spielzeit erfasst</h2>
      <p>Sobald du ein Spiel über LakuenLauncher startest, wird jede Sitzung hier erfasst – lokal und nur für dich.</p></div>`;
    return;
  }

  // Verlauf
  let chartData = [];
  if (range <= 90) {
    for (let i = range - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      chartData.push({ label: range === 7 ? d.toLocaleDateString('de-DE', { weekday: 'short' }) : `${d.getDate()}.${d.getMonth() + 1}.`, value: (days.get(dayKey(d)) || 0) / 3600, title: d.toLocaleDateString('de-DE') });
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
      let sum = 0;
      for (const [k, v] of days) { const d = new Date(k + 'T12:00:00'); if (d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth()) sum += v; }
      chartData.push({ label: m.toLocaleDateString('de-DE', { month: 'short' }), value: sum / 3600, title: m.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }) });
    }
  }

  // Top-Spiele im Zeitraum
  const per = {};
  inRange.forEach((s) => { per[s.gameId] = (per[s.gameId] || 0) + s.secs; });
  const top = Object.entries(per).map(([id, secs]) => ({ g: gameById(id), secs })).filter((x) => x.g).sort((a, b) => b.secs - a.secs).slice(0, 8);
  const topMax = top[0]?.secs || 1;

  // Wochentage
  const wd = [0, 0, 0, 0, 0, 0, 0];
  for (const [k, v] of days) { if (new Date(k + 'T12:00:00').getTime() >= since) wd[(new Date(k + 'T12:00:00').getDay() + 6) % 7] += v; }
  const wdMax = Math.max(1, ...wd);
  // Tageszeit
  const hours = new Array(24).fill(0);
  inRange.forEach((s) => { hours[new Date(s.start).getHours()] += s.secs; });
  const favHour = hours.indexOf(Math.max(...hours));

  // Heatmap 26 Wochen
  const weeks = 26;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7) - (weeks - 1) * 7);
  const cells = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    if (d > now) { cells.push('<div class="d" style="visibility:hidden"></div>'); continue; }
    const v = days.get(dayKey(d)) || 0;
    const l = v === 0 ? 0 : v < 1800 ? 1 : v < 3600 * 1.5 ? 2 : v < 3600 * 3 ? 3 : 4;
    cells.push(`<div class="d" data-l="${l}" title="${d.toLocaleDateString('de-DE')}: ${fmtDuration(v)}"></div>`);
  }

  content.innerHTML = `
    <div class="stats-grid">
      <div class="stat"><div class="k">${icon('clock', 13)} Gesamt</div><div class="v">${fmtHours(st.total)}</div></div>
      <div class="stat"><div class="k">${icon('calendar', 13)} Zeitraum</div><div class="v">${fmtHours(rangeSecs)}</div></div>
      <div class="stat"><div class="k">${icon('sun', 13)} Diese Woche</div><div class="v">${fmtHours(weekSecs)}</div></div>
      <div class="stat"><div class="k">${icon('play', 13)} Sitzungen</div><div class="v">${inRange.length}<small> / ${state.sessions.length}</small></div></div>
      <div class="stat"><div class="k">${icon('trophy', 13)} Längste</div><div class="v">${fmtHours(longest?.secs || 0)}</div></div>
      <div class="stat"><div class="k">${icon('fire', 13)} Serie</div><div class="v">${cur}<small> Tage · Rekord ${best}</small></div></div>
    </div>
    <div class="panel" style="margin-bottom:20px"><h3>${icon('chart', 16)} Verlauf <span class="r hint">${range > 90 ? 'pro Monat' : 'pro Tag'}</span></h3>${barChart(chartData)}</div>
    <div class="stats-2">
      <div class="panel"><h3>${icon('trophy', 16)} Meistgespielt im Zeitraum</h3>
        ${top.length ? `<div class="top-list">${top.map((t, i) => `<div class="top-item" data-gid="${t.g.id}"><span class="rank">${i + 1}</span><div class="thumb">${coverHTML(t.g, { kind: 'icon' })}</div><div><div class="nm">${esc(t.g.name)}</div><div class="track"><i style="width:${(t.secs / topMax) * 100}%"></i></div></div><span class="tm">${fmtDuration(t.secs)}</span></div>`).join('')}</div>` : '<p class="hint">In diesem Zeitraum wurde nichts gespielt.</p>'}
      </div>
      <div style="display:flex;flex-direction:column;gap:20px">
        <div class="panel"><h3>${icon('calendar', 16)} Wochentage</h3>
          <div class="week-bars">${wd.map((v, i) => `<div class="wb" title="${fmtDuration(v)}"><i style="height:${(v / wdMax) * 100}%"></i><span>${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][i]}</span></div>`).join('')}</div></div>
        <div class="panel"><h3>${icon('moon', 16)} Lieblingszeit</h3>
          <div style="font-size:26px;font-weight:800">${inRange.length ? `${String(favHour).padStart(2, '0')}–${String((favHour + 1) % 24).padStart(2, '0')} Uhr` : '–'}</div>
          <div class="hint">Zu dieser Uhrzeit startest du am häufigsten.</div></div>
      </div>
    </div>
    <div class="panel"><h3>${icon('fire', 16)} Aktivität · letzte 26 Wochen</h3>
      <div class="heatmap">${cells.join('')}</div>
      <div class="legend">Weniger <span class="d" style="background:rgba(127,127,127,.15)"></span><span class="d" style="background:rgba(var(--accent-rgb),.28)"></span><span class="d" style="background:rgba(var(--accent-rgb),.5)"></span><span class="d" style="background:rgba(var(--accent-rgb),.75)"></span><span class="d" style="background:var(--accent)"></span> Mehr</div>
    </div>`;
  content.querySelectorAll('[data-gid]').forEach((el) => el.onclick = () => nav({ name: 'game', gameId: el.dataset.gid }));
}
