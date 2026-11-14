// Statistik über alle Spiele.
import { state, game, fmtDuration, fmtHours, fmtDate } from "./store.js";
import { esc, thumbHtml, icon } from "./ui.js";
import { barChart, heatmap, secondsPerDay, startOfDay } from "./charts.js";

const DAY = 86400000;
let range = "30";

export function setRange(r) { range = r; }

function rangeStart() {
  const today = startOfDay(Date.now());
  if (range === "all") return 0;
  return today - (parseInt(range, 10) - 1) * DAY;
}

function streak(perDay) {
  let day = startOfDay(Date.now());
  if (!perDay.get(day)) day -= DAY; // heute noch nicht gespielt zählt nicht als Abbruch
  let n = 0;
  while (perDay.get(day) > 0) { n++; day -= DAY; }
  return n;
}

function timelineItems(perDay, from) {
  const today = startOfDay(Date.now());
  const items = [];
  if (range === "7" || range === "30") {
    const days = parseInt(range, 10);
    for (let i = days - 1; i >= 0; i--) {
      const day = today - i * DAY;
      const d = new Date(day);
      const v = perDay.get(day) || 0;
      items.push({
        label: range === "7" ? d.toLocaleDateString("de-DE", { weekday: "short" }) : d.getDate() + ".",
        value: v,
        tip: `${d.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}<span>${v ? fmtDuration(v) : "nicht gespielt"}</span>`,
      });
    }
    return { items, every: range === "7" ? 1 : 5, title: "Spielzeit pro Tag" };
  }
  if (range === "90") {
    const dow = (new Date(today).getDay() + 6) % 7;
    const weekStart = today - dow * DAY;
    for (let w = 12; w >= 0; w--) {
      const ws = weekStart - w * 7 * DAY;
      let v = 0;
      for (let d = 0; d < 7; d++) v += perDay.get(ws + d * DAY) || 0;
      const a = new Date(ws);
      items.push({
        label: `${a.getDate()}.${a.getMonth() + 1}.`,
        value: v,
        tip: `Woche ab ${a.toLocaleDateString("de-DE", { day: "numeric", month: "long" })}<span>${v ? fmtDuration(v) : "nicht gespielt"}</span>`,
      });
    }
    return { items, every: 2, title: "Spielzeit pro Woche" };
  }
  // Monate (1 Jahr bzw. gesamt, höchstens 24 Monate)
  const now = new Date(today);
  let months = 12;
  if (range === "all") {
    const first = Math.min(...state.sessions.map((s) => s.start), Date.now());
    const f = new Date(first);
    months = Math.min(24, Math.max(6, (now.getFullYear() - f.getFullYear()) * 12 + now.getMonth() - f.getMonth() + 1));
  }
  for (let m = months - 1; m >= 0; m--) {
    const a = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const b = new Date(now.getFullYear(), now.getMonth() - m + 1, 1);
    let v = 0;
    for (const [day, sec] of perDay) if (day >= a.getTime() && day < b.getTime() && day >= from) v += sec;
    items.push({
      label: a.toLocaleDateString("de-DE", { month: "short" }),
      value: v,
      tip: `${a.toLocaleDateString("de-DE", { month: "long", year: "numeric" })}<span>${v ? fmtDuration(v) : "nicht gespielt"}</span>`,
    });
  }
  return { items, every: months > 12 ? 2 : 1, title: "Spielzeit pro Monat" };
}

export function renderStats() {
  const from = rangeStart();
  const all = state.sessions;
  const inRange = all.filter((s) => s.end >= from);
  const perDayAll = secondsPerDay(all);
  const perDay = secondsPerDay(inRange);
  let total = 0;
  for (const [day, sec] of perDay) if (day >= from) total += sec;
  const playedDays = [...perDay.entries()].filter(([d, v]) => d >= from && v > 0).length;
  const longest = inRange.reduce((m, s) => (s.seconds > (m?.seconds || 0) ? s : m), null);
  const byGame = new Map();
  for (const s of inRange) byGame.set(s.gameId, (byGame.get(s.gameId) || 0) + (s.seconds || 0));
  const top = [...byGame.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const topMax = top[0]?.[1] || 1;
  const hours = new Array(24).fill(0);
  for (const s of inRange) {
    if (!(s.end > s.start)) continue;
    let a = s.start;
    while (a < s.end) {
      const hEnd = Math.min(s.end, new Date(a).setMinutes(60, 0, 0));
      hours[new Date(a).getHours()] += (hEnd - a) / 1000;
      a = hEnd;
    }
  }
  const tl = timelineItems(perDay, from);
  const seg = (v, l) => `<button class="${range === v ? "active" : ""}" data-action="stats-range" data-r="${v}">${l}</button>`;
  const recent = [...all].sort((a, b) => b.start - a.start).slice(0, 12);

  if (!all.length) {
    return `<div class="view">
      <div class="view-head"><h1 class="view-title">Statistik</h1></div>
      <div class="empty">${icon("stats")}<h2>Noch keine Spielzeit gemessen</h2>
      <p>Starte ein Spiel über den Launcher – sobald du es beendest, erscheint hier deine erste Sitzung. Spielzeit außerhalb des Launchers wird nicht gezählt.</p>
      <button class="btn primary" data-action="nav" data-view="library">Zur Bibliothek</button></div></div>`;
  }

  return `
  <div class="view">
    <div class="view-head">
      <h1 class="view-title">Statistik</h1>
      <div class="spacer"></div>
      <div class="seg" role="group" aria-label="Zeitraum">${seg("7", "7 Tage")}${seg("30", "30 Tage")}${seg("90", "90 Tage")}${seg("365", "1 Jahr")}${seg("all", "Gesamt")}</div>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="v">${fmtHours(total)}</div><div class="l">Spielzeit</div><div class="sub">${byGame.size} ${byGame.size === 1 ? "Spiel" : "Spiele"}, ${inRange.length} Sitzungen</div></div>
      <div class="kpi"><div class="v">${playedDays ? fmtDuration(total / playedDays, true) : "–"}</div><div class="l">Ø pro Spieltag</div><div class="sub">an ${playedDays} ${playedDays === 1 ? "Tag" : "Tagen"} gespielt</div></div>
      <div class="kpi"><div class="v">${longest ? fmtDuration(longest.seconds, true) : "–"}</div><div class="l">Längste Sitzung</div><div class="sub">${longest ? esc(game(longest.gameId)?.name || "Entfernter Eintrag") + ", " + fmtDate(longest.start) : ""}</div></div>
      <div class="kpi"><div class="v num">${streak(perDayAll)} ${streak(perDayAll) === 1 ? "Tag" : "Tage"}</div><div class="l">Aktuelle Serie</div><div class="sub">Tage in Folge mit Spielzeit</div></div>
    </div>
    <div class="chart-grid">
      <div>
        <div class="panel"><h3>${tl.title}</h3>${barChart(tl.items, { labelEvery: tl.every })}</div>
        <div class="panel"><h3>Aktivität der letzten 6 Monate</h3>${heatmap(perDayAll, 26)}</div>
      </div>
      <div>
        <div class="panel">
          <h3>Meistgespielt</h3>
          ${top.length ? `<div class="top-list">${top.map(([id, sec]) => {
            const g = game(id);
            const name = g ? g.name : "Entfernter Eintrag";
            return `<div class="top-row" ${g ? `data-action="open" data-id="${id}"` : ""}>
              <div class="thumb">${g ? thumbHtml(g) : ""}</div>
              <div style="min-width:0"><div class="nm">${esc(name)}</div><div class="track"><div class="fill" style="width:${Math.max(2, (sec / topMax) * 100)}%"></div></div></div>
              <div class="val">${fmtDuration(sec, true)}</div></div>`;
          }).join("")}</div>` : `<p class="muted" style="margin:0">In diesem Zeitraum nicht gespielt.</p>`}
        </div>
        <div class="panel">
          <h3>Nach Tageszeit</h3>
          ${barChart(hours.map((v, h) => ({ label: String(h), value: v, tip: `${h}:00 bis ${h + 1}:00 Uhr<span>${v ? fmtDuration(v) : "nicht gespielt"}</span>` })), { height: 170, labelEvery: 3 })}
        </div>
      </div>
    </div>
    <div class="panel" style="margin-top:18px">
      <h3>Letzte Sitzungen</h3>
      <table class="sessions-table"><thead><tr><th>Spiel</th><th>Beginn</th><th>Dauer</th></tr></thead><tbody>
        ${recent.map((s) => {
          const g = game(s.gameId);
          return `<tr><td>${g ? `<a href="#" data-action="open" data-id="${g.id}" style="color:inherit">${esc(g.name)}</a>` : '<span class="muted">Entfernter Eintrag</span>'}</td><td>${fmtDate(s.start, true)}</td><td>${fmtDuration(s.seconds)}</td></tr>`;
        }).join("")}
      </tbody></table>
    </div>
  </div>`;
}
