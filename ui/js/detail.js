// Detailansicht eines Spiels.
import { state, game, totals, fmtDuration, fmtRelative, fmtDate, fmtClock, kindLabel } from "./store.js";
import { esc, icon, coverHtml, heroStyle } from "./ui.js";
import { fileSrc } from "./api.js";
import { barChart, secondsPerDay, startOfDay } from "./charts.js";
import { playButton } from "./library.js";
import { prefixPath } from "./actions.js";

const DAY = 86400000;

function protonLabel(g) {
  const p = g.launch.proton;
  if (p && p !== "default") return p;
  const d = state.settings.defaultProton;
  return d === "auto-experimental" ? "Standard (Proton Experimental)" : d === "auto-latest" ? "Standard (neueste Version)" : `Standard (${d})`;
}

export function renderDetail() {
  const g = game(state.detailId);
  if (!g) return `<div class="view"><p>Eintrag nicht gefunden.</p><button class="btn" data-action="nav" data-view="library">Zur Bibliothek</button></div>`;
  const t = totals()[g.id] || { seconds: 0, count: 0, last: 0 };
  const sessions = state.sessions.filter((s) => s.gameId === g.id).sort((a, b) => b.start - a.start);
  const longest = sessions.reduce((m, s) => Math.max(m, s.seconds || 0), 0);
  const running = state.running[g.id];

  const perDay = secondsPerDay(sessions);
  const today = startOfDay(Date.now());
  const items = [];
  for (let i = 29; i >= 0; i--) {
    const day = today - i * DAY;
    const d = new Date(day);
    const v = perDay.get(day) || 0;
    items.push({
      label: d.getDate() + ".",
      value: v,
      tip: `${d.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "long" })}<span>${v ? fmtDuration(v) : "nicht gespielt"}</span>`,
    });
  }

  const title = g.artwork.logo
    ? `<img class="stage-logo" src="${esc(fileSrc(g.artwork.logo))}" alt="${esc(g.name)}">`
    : `<h1 class="stage-title">${esc(g.name)}</h1>`;
  const isExe = g.kind === "exe";

  return `
  <div class="detail-hero">
    <div class="stage-bg" style="${heroStyle(g)}"></div>
    <button class="btn back" data-action="back">${icon("back")} Zurück</button>
    <div class="hero-inner">
      <div class="mini-cover"><div class="cover">${coverHtml(g)}</div></div>
      <div class="title-block">
        ${title}
        ${g.collections.length ? `<div class="tags" style="margin-bottom:16px">${g.collections.map((c) => `<span class="tag">${esc(c)}</span>`).join("")}</div>` : ""}
        <div class="stage-actions">
          ${playButton(g)}
          <button class="btn" data-action="edit" data-id="${g.id}">${icon("edit")} Bearbeiten</button>
          <button class="btn icon" data-action="fav" data-id="${g.id}" title="${g.favorite ? "Aus Favoriten entfernen" : "Zu Favoriten"}" aria-pressed="${g.favorite}" style="${g.favorite ? "color:#ffd36b" : ""}">${icon("star")}</button>
        </div>
      </div>
    </div>
  </div>
  <div class="detail-body">
    <div>
      <div class="facts">
        <div class="fact"><div class="v">${running ? `<span data-since="${running}">${fmtClock(Date.now() - running)}</span>` : fmtDuration(t.seconds, true)}</div><div class="l">${running ? "Diese Sitzung" : "Gesamtspielzeit"}</div></div>
        <div class="fact"><div class="v">${fmtRelative(t.last)}</div><div class="l">Zuletzt gespielt</div></div>
        <div class="fact"><div class="v num">${t.count}</div><div class="l">Sitzungen</div></div>
        <div class="fact"><div class="v">${t.count ? fmtDuration(t.seconds / t.count, true) : "–"}</div><div class="l">Ø pro Sitzung${longest ? `, längste ${fmtDuration(longest, true)}` : ""}</div></div>
      </div>
      <div class="panel">
        <h3>Spielzeit der letzten 30 Tage</h3>
        ${barChart(items, { height: 200, labelEvery: 5 })}
      </div>
      <div class="panel">
        <h3>Letzte Sitzungen</h3>
        ${sessions.length
          ? `<table class="sessions-table"><thead><tr><th>Beginn</th><th>Ende</th><th>Dauer</th></tr></thead><tbody>
              ${sessions.slice(0, 10).map((s) => `<tr><td>${fmtDate(s.start, true)}</td><td>${new Date(s.end).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</td><td>${fmtDuration(s.seconds)}</td></tr>`).join("")}
            </tbody></table>`
          : `<p class="muted" style="margin:0">Noch keine Sitzung. Gezählt wird, sobald du das Spiel über den Launcher startest.</p>`}
      </div>
      ${g.notes ? `<div class="panel"><h3>Notizen</h3><p style="margin:0;white-space:pre-wrap">${esc(g.notes)}</p></div>` : ""}
    </div>
    <div>
      <div class="panel">
        <h3>Infos</h3>
        <dl class="kv">
          <dt>Typ</dt><dd>${kindLabel(g.kind)}</dd>
          ${isExe ? `<dt>Proton</dt><dd>${esc(protonLabel(g))}</dd>` : ""}
          <dt>Datei</dt><dd>${esc(g.path)}</dd>
          ${isExe ? `<dt>Prefix</dt><dd>${esc(prefixPath(g))}</dd>` : ""}
          ${g.launch.args ? `<dt>Startoptionen</dt><dd>${esc(g.launch.args)}</dd>` : ""}
          <dt>Hinzugefügt</dt><dd>${fmtDate(g.addedAt)}</dd>
        </dl>
      </div>
      <div class="panel">
        <h3>Werkzeuge</h3>
        <div class="action-list">
          <button data-action="open-folder" data-id="${g.id}">${icon("folder")} Spielordner öffnen</button>
          ${isExe ? `<button data-action="open-prefix" data-id="${g.id}">${icon("folder")} Wine-Prefix öffnen</button>
          <button data-action="winecfg" data-id="${g.id}">${icon("wine")} winecfg</button>
          <button data-action="winetricks" data-id="${g.id}">${icon("wrench")} winetricks</button>` : ""}
          <button data-action="log" data-id="${g.id}">${icon("log")} Startprotokoll</button>
          <button data-action="shortcut" data-id="${g.id}">${icon("shortcut")} Verknüpfung anlegen</button>
          <button data-action="reset-time" data-id="${g.id}">${icon("clock")} Spielzeit zurücksetzen</button>
          <button class="danger" data-action="remove" data-id="${g.id}">${icon("trash")} Aus Bibliothek entfernen</button>
        </div>
      </div>
    </div>
  </div>`;
}
