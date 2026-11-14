// Bibliothek: Bühne „Weiterspielen“, Filter, Raster- und Listenansicht.
import { state, totals, collections, fmtDuration, fmtRelative, fmtClock, kindShort } from "./store.js";
import { esc, icon, coverHtml, thumbHtml, heroStyle, autoCover } from "./ui.js";
import { fileSrc } from "./api.js";

export function filteredGames(t = totals()) {
  const f = state.filter;
  const q = state.query.trim().toLowerCase();
  let gs = state.games.filter((g) => (f === "hidden" ? g.hidden : !g.hidden));
  if (f === "fav") gs = gs.filter((g) => g.favorite);
  else if (f === "appimage") gs = gs.filter((g) => g.kind === "appimage");
  else if (f === "exe") gs = gs.filter((g) => g.kind === "exe");
  else if (f === "native") gs = gs.filter((g) => g.kind === "native");
  else if (f.startsWith("col:")) gs = gs.filter((g) => g.collections.includes(f.slice(4)));
  if (q) gs = gs.filter((g) => g.name.toLowerCase().includes(q) || g.collections.some((c) => c.toLowerCase().includes(q)));
  const sort = state.settings.sort;
  const by = {
    recent: (a, b) => (t[b.id]?.last || 0) - (t[a.id]?.last || 0) || b.addedAt - a.addedAt,
    name: (a, b) => a.name.localeCompare(b.name, "de", { numeric: true }),
    playtime: (a, b) => (t[b.id]?.seconds || 0) - (t[a.id]?.seconds || 0) || a.name.localeCompare(b.name, "de"),
    added: (a, b) => b.addedAt - a.addedAt,
  }[sort] || (() => 0);
  gs.sort(by);
  // Favoriten zuerst (außer bei Sortierung nach Name)
  if (sort !== "name") gs.sort((a, b) => Number(b.favorite) - Number(a.favorite));
  return gs;
}

function stage(t) {
  if (!state.settings.showStage || state.filter !== "all" || state.query) return "";
  const visible = state.games.filter((g) => !g.hidden);
  if (!visible.length) return "";
  let g = visible.filter((x) => t[x.id]?.last).sort((a, b) => t[b.id].last - t[a.id].last)[0];
  let kicker = "Weiterspielen";
  if (state.running[g?.id]) kicker = "Läuft gerade";
  if (!g) {
    g = [...visible].sort((a, b) => b.addedAt - a.addedAt)[0];
    kicker = "Neu in deiner Bibliothek";
  }
  const running = state.running[g.id];
  const tt = t[g.id] || { seconds: 0, count: 0, last: 0 };
  const title = g.artwork.logo
    ? `<img class="stage-logo" src="${esc(fileSrc(g.artwork.logo))}" alt="${esc(g.name)}">`
    : `<h1 class="stage-title">${esc(g.name)}</h1>`;
  return `
  <section class="stage" data-tour="stage">
    <div class="stage-bg" style="${heroStyle(g)}"></div>
    <div class="stage-body">
      <div class="stage-kicker">${running ? '<span class="pulse"></span>' : ""}${kicker}</div>
      ${title}
      <div class="stage-meta">
        <div><b class="num">${running ? `<span data-since="${running}">${fmtClock(Date.now() - running)}</span>` : fmtDuration(tt.seconds)}</b>${running ? "diese Sitzung" : "gespielt"}</div>
        <div><b>${fmtRelative(tt.last)}</b>zuletzt</div>
        <div><b>${kindShort(g.kind)}</b>Typ</div>
      </div>
      <div class="stage-actions">
        ${playButton(g)}
        <button class="btn" data-action="open" data-id="${g.id}">Details</button>
      </div>
    </div>
  </section>`;
}

export function playButton(g, big = true) {
  const running = state.running[g.id];
  if (running) return `<button class="play-btn running" data-action="stop" data-id="${g.id}">${icon("stop")} Beenden</button>`;
  return `<button class="play-btn" data-action="play" data-id="${g.id}">${icon("play")} ${big ? "Spielen" : ""}</button>`;
}

function card(g, t) {
  const tt = t[g.id];
  const running = state.running[g.id];
  const meta = running
    ? `Läuft seit <span data-since="${running}">${fmtClock(Date.now() - running)}</span>`
    : tt?.seconds ? `${fmtDuration(tt.seconds, true)} gespielt` : "Noch nicht gespielt";
  return `
  <div class="card" tabindex="0" data-action="open" data-id="${g.id}" aria-label="${esc(g.name)}">
    <div class="cover">
      ${coverHtml(g)}
      ${g.favorite ? `<span class="card-fav" title="Favorit">${icon("star")}</span>` : ""}
      ${running ? `<span class="badge-running"><span class="pulse"></span>Läuft</span>` : ""}
      ${running ? "" : `<button class="card-play" data-action="play" data-id="${g.id}" tabindex="-1" aria-label="${esc(g.name)} spielen">${icon("play")}</button>`}
    </div>
    <div class="card-name">${esc(g.name)}</div>
    <div class="card-meta">${meta}</div>
  </div>`;
}

function row(g, t) {
  const tt = t[g.id];
  const running = state.running[g.id];
  return `
  <div class="list-row" tabindex="0" data-action="open" data-id="${g.id}">
    <div class="thumb">${thumbHtml(g)}</div>
    <div class="name">${g.favorite ? '<span style="color:#ffd36b">★</span> ' : ""}${esc(g.name)}</div>
    <div class="cell"><span class="kind-tag">${kindShort(g.kind)}</span></div>
    <div class="cell">${running ? `<span data-since="${running}">${fmtClock(Date.now() - running)}</span>` : fmtDuration(tt?.seconds || 0, true)}</div>
    <div class="cell">${fmtRelative(tt?.last)}</div>
    <div>${running
      ? `<button class="btn small" data-action="stop" data-id="${g.id}">${icon("stop")} Beenden</button>`
      : `<button class="btn small primary" data-action="play" data-id="${g.id}">${icon("play")} Spielen</button>`}</div>
  </div>`;
}

export function renderLibraryContent() {
  const t = totals();
  const list = filteredGames(t);
  if (!state.games.length) {
    return `
    <div class="empty" data-tour="library">
      <img src="assets/logo.svg" alt="">
      <h2>Deine Bibliothek ist noch leer</h2>
      <p>Zieh AppImages oder .exe-Dateien einfach in dieses Fenster – oder wähle sie aus. Windows-Spiele starten automatisch über Proton.</p>
      <div class="row">
        <button class="btn primary" data-action="add">${icon("plus")} Dateien auswählen</button>
        <button class="btn" data-action="scan">${icon("scan")} Ordner durchsuchen</button>
      </div>
    </div>`;
  }
  if (!list.length) {
    return `<div class="empty" data-tour="library"><h2>Keine Treffer</h2><p>${state.query ? `Nichts passt zu „${esc(state.query)}“.` : "In diesem Filter ist noch nichts."}</p><button class="btn" data-action="clear-filter">Filter zurücksetzen</button></div>`;
  }
  if (state.settings.view === "list") {
    return `<div data-tour="library"><div class="list-head"><span></span><span>Name</span><span>Typ</span><span>Spielzeit</span><span>Zuletzt</span><span></span></div>
      <div class="list">${list.map((g) => row(g, t)).join("")}</div></div>`;
  }
  return `<div class="grid" data-tour="library">${list.map((g) => card(g, t)).join("")}</div>`;
}

export function renderLibrary() {
  const t = totals();
  const s = state.settings;
  const cols = collections();
  const hasHidden = state.games.some((g) => g.hidden);
  const kinds = new Set(state.games.map((g) => g.kind));
  const chip = (id, label) => `<button class="chip ${state.filter === id ? "active" : ""}" data-action="filter" data-filter="${esc(id)}">${esc(label)}</button>`;
  const visibleCount = state.games.filter((g) => !g.hidden).length;
  const upd = state.update && s.dismissedVersion !== state.update.version
    ? `<div class="update-banner">${icon("sparkle")}<div class="tx"><b>Version ${esc(state.update.version)} ist verfügbar.</b> <span class="muted">Du nutzt ${esc(state.sys.version || "")}.</span></div>
        <button class="btn small primary" data-action="update-download">Herunterladen</button><button class="btn small ghost" data-action="update-dismiss">Später</button></div>`
    : "";
  return `
  ${upd}
  <div class="view">
    ${stage(t)}
    <div class="view-head">
      <h1 class="view-title">Bibliothek<small class="num">${visibleCount} ${visibleCount === 1 ? "Eintrag" : "Einträge"}</small></h1>
      <div class="spacer"></div>
      <div class="search" data-tour="search">${icon("search")}<input id="lib-search" class="input" type="search" placeholder="Bibliothek durchsuchen" value="${esc(state.query)}" autocomplete="off" spellcheck="false"><kbd>Strg K</kbd></div>
      <button class="btn" data-action="scan" title="Ordner nach Spielen durchsuchen">${icon("scan")} Ordner durchsuchen</button>
      <button class="btn primary" data-action="add" data-tour="add">${icon("plus")} Hinzufügen</button>
    </div>
    <div class="row" style="margin-bottom:22px;flex-wrap:wrap;gap:14px">
      <div class="chips">
        ${chip("all", "Alle")}
        ${state.games.some((g) => g.favorite) ? chip("fav", "Favoriten") : ""}
        ${kinds.has("exe") ? chip("exe", "Windows") : ""}
        ${kinds.has("appimage") ? chip("appimage", "AppImages") : ""}
        ${kinds.has("native") ? chip("native", "Linux") : ""}
        ${cols.map(([c]) => chip("col:" + c, c)).join("")}
        ${hasHidden ? chip("hidden", "Ausgeblendet") : ""}
      </div>
      <div class="spacer"></div>
      <select class="input" style="width:auto;height:36px;border-radius:999px" data-change="sort" aria-label="Sortierung">
        ${[["recent", "Zuletzt gespielt"], ["name", "Name"], ["playtime", "Spielzeit"], ["added", "Zuletzt hinzugefügt"]]
          .map(([v, l]) => `<option value="${v}" ${s.sort === v ? "selected" : ""}>${l}</option>`).join("")}
      </select>
      <div class="seg" role="group" aria-label="Ansicht">
        <button class="${s.view === "grid" ? "active" : ""}" data-action="view" data-v="grid" aria-label="Raster">${icon("grid")}</button>
        <button class="${s.view === "list" ? "active" : ""}" data-action="view" data-v="list" aria-label="Liste">${icon("list")}</button>
      </div>
    </div>
    <div id="lib-content">${renderLibraryContent()}</div>
  </div>`;
}

export { autoCover };
