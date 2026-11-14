// Einstellungen.
import { state, saveSettings, saveLibrary, saveSessions, rerender, fmtDate, normalizeGame, VERSION, REPO } from "./store.js";
import { esc, icon, toast, confirmDialog } from "./ui.js";
import { call, openDialog, saveDialog } from "./api.js";
import { allThemes, applyTheme, ACCENTS, parseExternal, BUILTIN_THEMES } from "./themes.js";
import { openPath, openUrl, scanFolder } from "./actions.js";
import { checkUpdates } from "./updates.js";

const SECTIONS = [
  ["darstellung", "Darstellung"],
  ["bibliothek", "Bibliothek"],
  ["proton", "Proton"],
  ["spielstart", "Spielstart"],
  ["updates", "Updates"],
  ["daten", "Daten und Datenschutz"],
  ["hilfe", "Hilfe"],
  ["ueber", "Über"],
];

const sw = (key, title, desc) => `
  <div class="switch-row"><div class="text"><div class="title">${title}</div>${desc ? `<div class="desc">${desc}</div>` : ""}</div>
  <label class="toggle"><input type="checkbox" data-setting="${key}" ${state.settings[key] ? "checked" : ""}><span></span></label></div>`;

function themeCard(t) {
  const c = t.colors;
  const active = state.settings.theme === t.id;
  return `<button class="theme-card ${active ? "active" : ""}" data-action="theme" data-theme="${esc(t.id)}" aria-pressed="${active}">
    <div class="theme-preview" style="background:${c.bg}">
      <div class="tp-side" style="background:${c.bg2}"></div>
      <div class="tp-main"><div class="tp-line" style="background:${c.text};opacity:.85"></div><div class="tp-line" style="background:${c.muted};width:50%"></div><div class="tp-pill" style="background:${state.settings.accent && active ? state.settings.accent : c.accent}"></div></div>
    </div>
    <div class="theme-name"><span>${esc(t.name)}</span><small>${t.external ? "Extern" : t.type === "light" ? "Hell" : "Dunkel"}</small></div>
  </button>`;
}

export function renderSettings() {
  const s = state.settings;
  const themes = allThemes();
  const t = state.tools;
  const upd = state.update;
  const ext = themes.filter((x) => x.external);
  return `
  <div class="view">
    <div class="view-head"><h1 class="view-title">Einstellungen</h1></div>
    <div class="settings-layout">
      <nav class="settings-nav">${SECTIONS.map(([id, l]) => `<button class="nav-item" data-action="settings-jump" data-sec="${id}"><span class="txt">${l}</span></button>`).join("")}</nav>
      <div>
        <section class="settings-section" id="sec-darstellung">
          <h2>Darstellung</h2>
          <p class="lead">Wähle ein Theme. Eigene Themes kannst du als JSON-Datei einbinden.</p>
          <div class="theme-grid">${themes.map(themeCard).join("")}</div>
          <div class="row" style="flex-wrap:wrap;margin-bottom:22px">
            <button class="btn small" data-action="theme-import">${icon("upload")} Theme importieren</button>
            <button class="btn small" data-action="theme-template">${icon("download")} Vorlage speichern</button>
            <button class="btn small ghost" data-action="open-themes">${icon("folder")} Theme-Ordner</button>
            ${ext.length ? `<span class="spacer"></span>${ext.map((x) => `<button class="btn small ghost danger" data-action="theme-delete" data-file="${esc(x.file)}">${icon("trash")} ${esc(x.name)}</button>`).join("")}` : ""}
          </div>
          <div class="field"><span class="field-label">Akzentfarbe</span>
            <div class="swatches">
              <button class="swatch reset ${!s.accent ? "active" : ""}" data-action="accent" data-color="" title="Farbe des Themes" aria-label="Farbe des Themes"></button>
              ${ACCENTS.map((a) => `<button class="swatch ${s.accent === a ? "active" : ""}" style="background:${a}" data-action="accent" data-color="${a}" aria-label="Akzent ${a}"></button>`).join("")}
              <label class="btn small ghost" style="position:relative">${icon("palette")} Eigene Farbe<input type="color" data-input="accent" value="${s.accent || "#ff6fa8"}" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label>
            </div>
          </div>
          <div class="field"><span class="field-label">Kartengröße</span><div class="row"><input type="range" min="130" max="260" step="2" value="${s.cardSize}" data-input="cardSize" style="width:240px"><span class="muted num">${s.cardSize} px</span></div></div>
          ${sw("showStage", "Bühne „Weiterspielen“ anzeigen", "Großes Banner des zuletzt gespielten Spiels oben in der Bibliothek.")}
          ${sw("reduceMotion", "Animationen reduzieren", "Schaltet Übergänge und Bewegungen ab.")}
        </section>

        <section class="settings-section" id="sec-bibliothek">
          <h2>Bibliothek</h2>
          <p class="lead">Spiele lassen sich auch per Drag &amp; Drop ins Fenster ziehen.</p>
          <div class="row" style="flex-wrap:wrap">
            <button class="btn" data-action="add">${icon("plus")} Dateien hinzufügen</button>
            <button class="btn" data-action="scan">${icon("scan")} Ordner durchsuchen</button>
            ${s.scanFolder ? `<button class="btn ghost" data-action="rescan">${icon("refresh")} Erneut durchsuchen: ${esc(s.scanFolder.split("/").pop())}</button>` : ""}
          </div>
        </section>

        <section class="settings-section" id="sec-proton">
          <h2>Proton</h2>
          <p class="lead">Windows-Spiele (.exe) starten über Proton aus deiner Steam-Installation. Jedes Spiel bekommt einen eigenen Prefix.</p>
          <div class="field"><label for="set-proton">Standard-Version</label>
            <select id="set-proton" class="input" data-change="defaultProton">
              <option value="auto-experimental" ${s.defaultProton === "auto-experimental" ? "selected" : ""}>Automatisch: Proton Experimental (empfohlen)</option>
              <option value="auto-latest" ${s.defaultProton === "auto-latest" ? "selected" : ""}>Automatisch: neueste Proton-Version</option>
              ${state.proton.map((p) => `<option value="${esc(p.name)}" ${s.defaultProton === p.name ? "selected" : ""}>${esc(p.name)}</option>`).join("")}
            </select>
            <span class="hint">„Automatisch“ wählt bei jedem Start die passende installierte Version – Updates über Steam werden also sofort genutzt.</span>
          </div>
          <div class="row" style="margin-bottom:4px"><span class="field-label">Gefundene Versionen</span><span class="spacer"></span><button class="btn small ghost" data-action="proton-refresh">${icon("refresh")} Neu suchen</button></div>
          <div class="proton-list">
            ${state.proton.length ? state.proton.map((p) => `<div class="proton-item"><b>${esc(p.name)}</b><span class="kind-tag">${{ experimental: "Experimental", official: "Offiziell", ge: "GE / Community", custom: "Eigene" }[p.kind] || p.kind}</span><span class="path" title="${esc(p.path)}">${esc(p.path)}</span></div>`).join("")
              : `<div class="proton-item" style="color:var(--danger)">Keine Proton-Version gefunden. Installiere in Steam unter Bibliothek → Tools z. B. „Proton Experimental“.</div>`}
          </div>
          ${sw("useUmu", "Über umu-launcher starten", `Startet Proton in der Steam-Laufzeitumgebung – meist die zuverlässigste Variante. ${t.umu ? '<span class="status ok">umu ist installiert</span>' : '<span class="status off">umu ist nicht installiert, Proton wird direkt gestartet</span>'}`)}
          <div class="switch-row"><div class="text"><div class="title">Weitere Werkzeuge</div><div class="desc">
            <span class="status ${t.mangohud ? "ok" : "off"}">MangoHud</span> &nbsp; <span class="status ${t.gamemode ? "ok" : "off"}">GameMode</span> &nbsp; <span class="status ${t.winetricks || t.umu ? "ok" : "off"}">winetricks</span>
          </div></div></div>
        </section>

        <section class="settings-section" id="sec-spielstart">
          <h2>Spielstart</h2>
          ${sw("minimizeOnLaunch", "Launcher beim Spielstart minimieren", "Nach dem Beenden kommt das Fenster wieder nach vorn.")}
          ${sw("confirmStop", "Vor dem Beenden nachfragen", "Schützt vor versehentlichem Beenden eines laufenden Spiels.")}
        </section>

        <section class="settings-section" id="sec-updates">
          <h2>Updates</h2>
          <p class="lead">Der Launcher fragt die Releases auf GitHub ab. Dabei werden keine persönlichen Daten übertragen.</p>
          <div class="update-box">
            ${icon(upd ? "sparkle" : "check")}
            <div class="text">
              ${upd ? `<b>Version ${esc(upd.version)} ist verfügbar</b><div class="muted" style="font-size:13px">Du nutzt ${esc(state.sys.version || VERSION)}${upd.date ? `, erschienen am ${fmtDate(Date.parse(upd.date))}` : ""}.</div>`
                : `<b>LakuenLauncher ${esc(state.sys.version || VERSION)}</b><div class="muted" style="font-size:13px">${s.lastUpdateCheck ? `Zuletzt geprüft: ${fmtDate(s.lastUpdateCheck, true)}` : "Noch nicht geprüft."}</div>`}
            </div>
            ${upd ? `<button class="btn primary small" data-action="update-download">${icon("download")} Herunterladen</button><button class="btn small" data-action="update-notes">Neuerungen</button>` : ""}
            <button class="btn small" data-action="update-check">${icon("refresh")} Jetzt prüfen</button>
          </div>
          ${sw("checkUpdates", "Automatisch nach Updates suchen", "Beim Start und danach alle sechs Stunden.")}
          ${sw("notifyUpdates", "Desktop-Benachrichtigung bei neuer Version", "")}
        </section>

        <section class="settings-section" id="sec-daten">
          <h2>Daten und Datenschutz</h2>
          <div class="switch-row"><div class="text"><div class="title">${icon("shield")} Alles bleibt auf deinem Gerät</div><div class="desc">Kein Konto, keine Anmeldung, keine Telemetrie. Bibliothek, Artwork und Spielzeit liegen lokal in deinem Benutzerordner.</div></div></div>
          <div class="field" style="margin-top:12px"><span class="field-label">Datenordner</span>
            <div class="row"><input class="input grow" value="${esc(state.dataDir)}" readonly spellcheck="false"><button class="btn" data-action="open-data">${icon("folder")} Öffnen</button></div>
          </div>
          <div class="row" style="flex-wrap:wrap">
            <button class="btn" data-action="backup-export">${icon("download")} Sicherung exportieren</button>
            <button class="btn" data-action="backup-import">${icon("upload")} Sicherung importieren</button>
            <button class="btn danger" data-action="stats-reset">${icon("trash")} Gesamte Spielzeit löschen</button>
          </div>
          <p class="muted" style="font-size:13px">Die Sicherung enthält Bibliothek, Einstellungen und Spielzeit als JSON. Artwork-Dateien bleiben im Datenordner.</p>
        </section>

        <section class="settings-section" id="sec-hilfe">
          <h2>Hilfe</h2>
          <div class="row" style="margin-bottom:14px"><button class="btn" data-action="tutorial">${icon("sparkle")} Einführung erneut anzeigen</button></div>
          <div class="panel" style="padding:16px 20px">
            <dl class="kv" style="grid-template-columns:150px 1fr">
              <dt><kbd>Strg</kbd> <kbd>K</kbd></dt><dd>Schnellsuche – Spiele starten, Bereiche öffnen</dd>
              <dt><kbd>Strg</kbd> <kbd>N</kbd></dt><dd>Spiel hinzufügen</dd>
              <dt><kbd>Strg</kbd> <kbd>F</kbd></dt><dd>Bibliothek durchsuchen</dd>
              <dt><kbd>Strg</kbd> <kbd>,</kbd></dt><dd>Einstellungen</dd>
              <dt><kbd>Pfeiltasten</kbd></dt><dd>Zwischen Spielen wechseln, <kbd>Enter</kbd> öffnet die Details</dd>
              <dt><kbd>Esc</kbd></dt><dd>Zurück bzw. Dialog schließen</dd>
            </dl>
          </div>
        </section>

        <section class="settings-section" id="sec-ueber">
          <h2>Über</h2>
          <div class="panel">
            <div class="about">
              <img src="assets/logo.svg" alt="">
              <div>
                <h3>LakuenLauncher</h3>
                <p>Version ${esc(state.sys.version || VERSION)}</p>
                <p>erstellt von Dominic Lesina x Claude</p>
                <div class="row" style="margin-top:10px">
                  <button class="btn small" data-action="open-repo">${icon("github")} GitHub</button>
                  <button class="btn small ghost" data-action="open-releases">Alle Releases</button>
                </div>
              </div>
            </div>
            <p class="muted" style="font-size:13px;margin:16px 0 0">Freie Software unter der MIT-Lizenz. „Rakuen“ (楽園) bedeutet „Paradies“.</p>
          </div>
        </section>
      </div>
    </div>
  </div>`;
}

/* ---------- Aktionen der Einstellungen ---------- */
export async function loadExternalThemes() {
  const files = await call("list_themes").catch(() => []);
  state.externalThemes = files.map((f) => parseExternal(f.file, f.content)).filter(Boolean);
}

export const settingsActions = {
  "theme": (el) => { state.settings.theme = el.dataset.theme; saveSettings(); applyTheme(); rerender(); },
  "accent": (el) => { state.settings.accent = el.dataset.color || null; saveSettings(); applyTheme(); rerender(); },
  "settings-jump": (el) => document.getElementById("sec-" + el.dataset.sec)?.scrollIntoView({ behavior: state.settings.reduceMotion ? "auto" : "smooth" }),
  "theme-import": async () => {
    const res = await openDialog({ multiple: false, title: "Theme importieren", filters: [{ name: "Theme (JSON)", extensions: ["json"] }] });
    if (!res) return;
    try {
      const file = await call("import_theme", { source: Array.isArray(res) ? res[0] : res });
      await loadExternalThemes();
      const t = state.externalThemes.find((x) => x.file === file);
      if (t) { state.settings.theme = t.id; saveSettings(); applyTheme(); }
      rerender();
      toast("Theme importiert", t?.name || file, "ok");
    } catch (e) { toast("Theme konnte nicht importiert werden", String(e), "error", 8000); }
  },
  "theme-template": async () => {
    const t = allThemes().find((x) => x.id === state.settings.theme) || BUILTIN_THEMES[0];
    const json = JSON.stringify({ name: "Mein Theme", author: "", type: t.type, colors: { ...t.colors, ...(state.settings.accent ? { accent: state.settings.accent } : {}) } }, null, 2);
    const path = await saveDialog({ defaultPath: "mein-theme.json", filters: [{ name: "Theme (JSON)", extensions: ["json"] }] });
    if (!path) return;
    try { await call("write_text_file", { path, content: json }); toast("Vorlage gespeichert", "Farben anpassen und über „Theme importieren“ einbinden.", "ok", 6000); }
    catch (e) { toast("Speichern fehlgeschlagen", String(e), "error"); }
  },
  "theme-delete": async (el) => {
    await call("delete_theme", { file: el.dataset.file }).catch(() => {});
    if (state.settings.theme === "ext:" + el.dataset.file) state.settings.theme = "nachtgarten";
    await loadExternalThemes();
    saveSettings(); applyTheme(); rerender();
  },
  "open-themes": () => openPath(state.dataDir + "/themes"),
  "open-data": () => openPath(state.dataDir),
  "rescan": () => scanFolder(state.settings.scanFolder),
  "proton-refresh": async () => {
    const [p, t] = await Promise.all([call("list_proton").catch(() => []), call("detect_tools").catch(() => ({}))]);
    state.proton = p; state.tools = t; rerender();
    toast(`${p.length} Proton-Version${p.length === 1 ? "" : "en"} gefunden`, "", "ok", 2500);
  },
  "update-check": () => checkUpdates({ manual: true }),
  "update-download": () => state.update && openUrl(state.update.download || state.update.url),
  "update-notes": () => state.update && openUrl(state.update.url),
  "update-dismiss": () => { if (state.update) { state.settings.dismissedVersion = state.update.version; saveSettings(); rerender(); } },
  "open-repo": () => openUrl(`https://github.com/${REPO}`),
  "open-releases": () => openUrl(`https://github.com/${REPO}/releases`),
  "backup-export": async () => {
    const d = new Date().toISOString().slice(0, 10);
    const path = await saveDialog({ defaultPath: `lakuenlauncher-sicherung-${d}.json`, filters: [{ name: "Sicherung (JSON)", extensions: ["json"] }] });
    if (!path) return;
    const content = JSON.stringify({ app: "LakuenLauncher", version: VERSION, exportedAt: Date.now(), library: { version: 1, games: state.games }, settings: state.settings, sessions: state.sessions }, null, 1);
    try { await call("write_text_file", { path, content }); toast("Sicherung exportiert", path, "ok"); }
    catch (e) { toast("Export fehlgeschlagen", String(e), "error"); }
  },
  "backup-import": async () => {
    const res = await openDialog({ multiple: false, title: "Sicherung importieren", filters: [{ name: "Sicherung (JSON)", extensions: ["json"] }] });
    if (!res) return;
    try {
      const data = JSON.parse(await call("read_text_file", { path: Array.isArray(res) ? res[0] : res }));
      if (data.app !== "LakuenLauncher" || !data.library) throw new Error("Das ist keine LakuenLauncher-Sicherung.");
      const ok = await confirmDialog("Sicherung einspielen?", `Die aktuelle Bibliothek (${state.games.length} Einträge) und Spielzeit werden durch die Sicherung (${data.library.games?.length || 0} Einträge) ersetzt.`, "Einspielen", true);
      if (!ok) return;
      state.games = (data.library.games || []).map(normalizeGame);
      state.sessions = Array.isArray(data.sessions) ? data.sessions : [];
      if (data.settings) Object.assign(state.settings, data.settings, { tutorialDone: true });
      saveLibrary(); saveSettings(); await saveSessions(); applyTheme(); rerender();
      toast("Sicherung eingespielt", "", "ok");
    } catch (e) { toast("Import fehlgeschlagen", String(e.message || e), "error", 8000); }
  },
  "stats-reset": async () => {
    const ok = await confirmDialog("Gesamte Spielzeit löschen?", "Alle gemessenen Sitzungen aller Spiele werden entfernt. Das lässt sich nicht rückgängig machen – exportiere vorher ggf. eine Sicherung.", "Alles löschen", true);
    if (!ok) return;
    state.sessions = [];
    await saveSessions();
    rerender();
  },
};

export function onSettingToggle(el) {
  state.settings[el.dataset.setting] = el.checked;
  saveSettings();
  if (el.dataset.setting === "reduceMotion") applyTheme();
  rerender();
}
