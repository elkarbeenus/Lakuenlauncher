// Bearbeiten-Dialog: Name, Pfad, Sammlungen, Artwork, Startoptionen, Proton, Skripte.
import { state, game, saveLibrary, rerender, kindLabel } from "./store.js";
import { esc, icon, openModal, toast } from "./ui.js";
import { call, openDialog, fileSrc } from "./api.js";
import { pickArtwork, importArtwork, prefixPath, openUrl } from "./actions.js";

let current = null; // { id, draft, imported:Set, modal }

export function editorDropTarget(x, y) {
  // Für Drag & Drop von Bildern direkt auf ein Artwork-Feld
  if (!current) return null;
  const el = document.elementFromPoint(x, y)?.closest?.("[data-art]");
  return el ? el.dataset.art : null;
}

export async function dropArtwork(kind, path) {
  if (!current) return;
  const dest = await importArtwork(current.id, kind, path);
  if (dest) setArt(kind, dest);
}

function setArt(kind, dest) {
  const d = current.draft;
  if (d.artwork[kind] && current.imported.has(d.artwork[kind])) call("remove_artwork", { path: d.artwork[kind] }).catch(() => {});
  d.artwork[kind] = dest;
  if (dest) current.imported.add(dest);
  renderTab();
}

const TABS = [
  ["general", "Allgemein"],
  ["artwork", "Artwork"],
  ["launch", "Start"],
  ["proton", "Proton"],
  ["scripts", "Skripte"],
];

export function openEditor(id, tab = "general", isNew = false) {
  const g = game(id);
  if (!g) return;
  const draft = structuredClone(g);
  current = { id, draft, imported: new Set(), tab, saved: false };
  const m = openModal(
    `<div class="modal-head"><h2>${isNew ? "Neu hinzugefügt – passt alles?" : "Bearbeiten"}</h2><button class="btn ghost icon" data-close aria-label="Schließen">${icon("close")}</button></div>
     <div class="tabs" role="tablist"></div>
     <div class="modal-body" id="editor-body"></div>
     <div class="modal-foot"><button class="btn ghost" data-close>Abbrechen</button><button class="btn primary" data-save>Speichern</button></div>`,
    {
      cls: "wide",
      backdropClose: false,
      onClose: () => {
        // Nicht gespeicherte, neu importierte Bilder wieder aufräumen
        if (current && !current.saved) {
          const keep = new Set(Object.values(game(id)?.artwork || {}));
          for (const p of current.imported) if (!keep.has(p)) call("remove_artwork", { path: p }).catch(() => {});
        }
        current = null;
      },
    },
  );
  current.modal = m;
  m.el.querySelector("[data-save]").onclick = save;
  m.el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
  });
  renderTab();
}

function collect() {
  // Werte aus dem aktuell sichtbaren Tab in den Entwurf übernehmen
  const d = current.draft;
  const body = current.modal.el.querySelector("#editor-body");
  body.querySelectorAll("[data-f]").forEach((el) => {
    const path = el.dataset.f.split(".");
    let obj = d;
    for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
    const key = path[path.length - 1];
    let v = el.type === "checkbox" ? el.checked : el.value;
    if (el.dataset.f === "collections") v = String(v).split(",").map((s) => s.trim()).filter(Boolean);
    if (el.dataset.f === "launch.useUmu") v = v === "on" ? true : v === "off" ? false : null;
    obj[key] = v;
  });
  const env = [];
  body.querySelectorAll(".env-row").forEach((r) => {
    const key = r.querySelector("[data-env=key]").value.trim();
    const value = r.querySelector("[data-env=value]").value;
    if (key) env.push({ key, value });
  });
  if (body.querySelector(".env-list")) d.launch.env = env;
}

function renderTab() {
  const m = current.modal;
  const d = current.draft;
  const tabs = m.el.querySelector(".tabs");
  tabs.innerHTML = TABS.filter(([id]) => id !== "proton" || d.kind === "exe")
    .map(([id, label]) => `<button class="tab ${current.tab === id ? "active" : ""}" role="tab" data-tab="${id}">${label}</button>`).join("");
  tabs.querySelectorAll("[data-tab]").forEach((b) => b.onclick = () => { collect(); current.tab = b.dataset.tab; renderTab(); });
  if (current.tab === "proton" && d.kind !== "exe") current.tab = "general";
  const body = m.el.querySelector("#editor-body");
  body.innerHTML = ({ general, artwork, launch, proton, scripts })[current.tab](d);
  bindTab(body);
}

const toggle = (f, checked) => `<label class="toggle"><input type="checkbox" data-f="${f}" ${checked ? "checked" : ""}><span></span></label>`;

function general(d) {
  const known = [...new Set(state.games.flatMap((g) => g.collections))];
  return `
    <div class="field"><label for="ed-name">Anzeigename</label><input id="ed-name" class="input" data-f="name" value="${esc(d.name)}" autofocus></div>
    <div class="field"><label for="ed-path">Datei</label>
      <div class="row"><input id="ed-path" class="input grow" data-f="path" value="${esc(d.path)}" spellcheck="false"><button class="btn" data-pick="path">${icon("folder")} Durchsuchen</button></div>
    </div>
    <div class="grid2">
      <div class="field"><label for="ed-kind">Startart</label>
        <select id="ed-kind" class="input" data-f="kind">
          ${["appimage", "exe", "native"].map((k) => `<option value="${k}" ${d.kind === k ? "selected" : ""}>${kindLabel(k)}</option>`).join("")}
        </select>
      </div>
      <div class="field"><label for="ed-col">Sammlungen</label>
        <input id="ed-col" class="input" data-f="collections" value="${esc(d.collections.join(", "))}" list="ed-col-list" placeholder="z. B. Abenteuer, Koop">
        <datalist id="ed-col-list">${known.map((c) => `<option value="${esc(c)}">`).join("")}</datalist>
        <span class="hint">Mehrere mit Komma trennen.</span>
      </div>
    </div>
    <div class="switch-row"><div class="text"><div class="title">Favorit</div><div class="desc">Favoriten stehen in der Bibliothek ganz vorne.</div></div>${toggle("favorite", d.favorite)}</div>
    <div class="switch-row"><div class="text"><div class="title">In der Bibliothek ausblenden</div><div class="desc">Bleibt erhalten und ist über den Filter „Ausgeblendet“ erreichbar.</div></div>${toggle("hidden", d.hidden)}</div>
    <div class="field" style="margin-top:14px"><label for="ed-notes">Notizen</label><textarea id="ed-notes" class="input" data-f="notes" style="font-family:inherit;font-size:14px" placeholder="z. B. Speicherort der Spielstände, Mods, Tastenbelegung">${esc(d.notes)}</textarea></div>`;
}

function slot(kind, label, hint, d) {
  const src = d.artwork[kind];
  return `<div class="art-slot ${kind}" data-art="${kind}" tabindex="0" role="button" aria-label="${label} wählen">
    ${src ? `<img src="${esc(fileSrc(src))}" alt="">` : `<div class="art-label"><b>${label}</b><br>${hint}</div>`}
    ${src ? `<button class="btn icon small art-remove" data-art-remove="${kind}" aria-label="${label} entfernen">${icon("close")}</button>` : ""}
  </div>`;
}

function artwork(d) {
  return `
    <p class="muted" style="margin:0 0 14px">Klick auf ein Feld oder zieh ein Bild direkt darauf. Bilder werden in den Launcher kopiert – das Original kannst du danach löschen.</p>
    <div class="art-grid">
      ${slot("cover", "Cover", "Hochformat, z. B. 600 × 900", d)}
      <div class="art-col">
        ${slot("hero", "Banner", "Breitformat, z. B. 1920 × 620", d)}
        ${slot("logo", "Logo", "Transparentes PNG, ersetzt den Titel", d)}
        ${slot("icon", "Icon", "Quadratisch, für Liste und Verknüpfung", d)}
      </div>
    </div>
    <p class="muted" style="margin:16px 0 0;font-size:13px">Passendes Artwork findest du z. B. bei SteamGridDB. <a href="#" data-open-url="https://www.steamgriddb.com/" style="color:var(--accent)">steamgriddb.com öffnen</a></p>`;
}

function launch(d) {
  const L = d.launch;
  const t = state.tools;
  return `
    <div class="field"><label for="ed-args">Startoptionen</label>
      <input id="ed-args" class="input" data-f="launch.args" value="${esc(L.args)}" spellcheck="false" placeholder="z. B. -windowed oder PROTON_USE_WINED3D=1 %command% -skipintro">
      <span class="hint">Wie in Steam: Text vor <code>%command%</code> setzt Variablen oder Wrapper, Text danach geht an das Spiel.</span>
    </div>
    <div class="field"><label for="ed-wd">Arbeitsordner</label>
      <div class="row"><input id="ed-wd" class="input grow" data-f="launch.workingDir" value="${esc(L.workingDir)}" placeholder="Standard: Ordner der Datei" spellcheck="false"><button class="btn" data-pick="workingDir">${icon("folder")} Wählen</button></div>
    </div>
    <div class="field"><span class="field-label">Umgebungsvariablen</span>
      <div class="env-list">${(L.env || []).map(envRow).join("")}</div>
      <div><button class="btn small" data-env-add>${icon("plus")} Variable hinzufügen</button></div>
    </div>
    <div class="switch-row"><div class="text"><div class="title">MangoHud</div><div class="desc">Zeigt FPS, Auslastung und Temperaturen im Spiel. ${t.mangohud ? '<span class="status ok">installiert</span>' : '<span class="status off">nicht gefunden</span>'}</div></div>${toggle("launch.mangohud", L.mangohud)}</div>
    <div class="switch-row"><div class="text"><div class="title">GameMode</div><div class="desc">Optimiert CPU und Energieprofil während des Spielens. ${t.gamemode ? '<span class="status ok">installiert</span>' : '<span class="status off">nicht gefunden</span>'}</div></div>${toggle("launch.gamemode", L.gamemode)}</div>
    ${d.kind === "exe" ? `<div class="switch-row"><div class="text"><div class="title">FSR-Hochskalierung</div><div class="desc">AMD FidelityFX Super Resolution im Vollbild (mit GE-Proton). Spiel auf niedrigere Auflösung stellen.</div></div>${toggle("launch.fsr", L.fsr)}</div>` : ""}`;
}

function envRow(e = { key: "", value: "" }) {
  return `<div class="env-row"><input class="input" data-env="key" value="${esc(e.key)}" placeholder="NAME" spellcheck="false"><input class="input" data-env="value" value="${esc(e.value)}" placeholder="Wert" spellcheck="false"><button class="btn ghost icon small" data-env-del aria-label="Entfernen">${icon("close")}</button></div>`;
}

function proton(d) {
  const L = d.launch;
  const def = state.settings.defaultProton;
  const defLabel = def === "auto-experimental" ? "Proton Experimental" : def === "auto-latest" ? "neueste Version" : def;
  const umuDefault = state.settings.useUmu ? "an" : "aus";
  return `
    <div class="field"><label for="ed-proton">Proton-Version</label>
      <select id="ed-proton" class="input" data-f="launch.proton">
        <option value="default" ${!L.proton || L.proton === "default" ? "selected" : ""}>Standard aus den Einstellungen (${esc(defLabel)})</option>
        <option value="auto-experimental" ${L.proton === "auto-experimental" ? "selected" : ""}>Immer Proton Experimental</option>
        <option value="auto-latest" ${L.proton === "auto-latest" ? "selected" : ""}>Immer die neueste Proton-Version</option>
        ${state.proton.map((p) => `<option value="${esc(p.name)}" ${L.proton === p.name ? "selected" : ""}>${esc(p.name)}</option>`).join("")}
      </select>
      ${state.proton.length ? "" : `<span class="hint" style="color:var(--danger)">Keine Proton-Version gefunden. Installiere in Steam z. B. „Proton Experimental“.</span>`}
    </div>
    <div class="field"><label for="ed-umu">Start über umu-launcher</label>
      <select id="ed-umu" class="input" data-f="launch.useUmu">
        <option value="default" ${L.useUmu === null || L.useUmu === undefined ? "selected" : ""}>Standard aus den Einstellungen (${umuDefault})</option>
        <option value="on" ${L.useUmu === true ? "selected" : ""}>An</option>
        <option value="off" ${L.useUmu === false ? "selected" : ""}>Aus</option>
      </select>
      <span class="hint">umu startet Proton in der Steam-Laufzeitumgebung und ist meist zuverlässiger. ${state.tools.umu ? "umu ist installiert." : "umu ist nicht installiert – dann wird Proton direkt gestartet."}</span>
    </div>
    <div class="field"><label for="ed-prefix">Wine-Prefix</label>
      <div class="row"><input id="ed-prefix" class="input grow" data-f="launch.prefix" value="${esc(L.prefix)}" placeholder="${esc(prefixPath({ ...d, launch: { ...L, prefix: "" } }))}" spellcheck="false"><button class="btn" data-pick="prefix">${icon("folder")} Wählen</button></div>
      <span class="hint">Jedes Spiel bekommt automatisch einen eigenen Prefix. Nur ändern, wenn du einen bestehenden weiterverwenden willst.</span>
    </div>`;
}

function scripts(d) {
  return `
    <p class="muted" style="margin:0 0 14px">Shell-Befehle, die vor dem Start bzw. nach dem Beenden laufen – z. B. um Mods zu kopieren oder ein Backup der Spielstände anzulegen. Die Ausgabe landet im Startprotokoll.</p>
    <div class="field"><label for="ed-pre">Vor dem Start</label><textarea id="ed-pre" class="input" data-f="launch.preLaunch" spellcheck="false" placeholder="z. B. cp -r ~/Mods/* ./mods/">${esc(d.launch.preLaunch)}</textarea></div>
    <div class="field"><label for="ed-post">Nach dem Beenden</label><textarea id="ed-post" class="input" data-f="launch.postExit" spellcheck="false" placeholder="z. B. tar czf ~/Backups/spielstand-$(date +%F).tgz ./saves">${esc(d.launch.postExit)}</textarea></div>`;
}

function bindTab(body) {
  const d = current.draft;
  body.querySelectorAll("[data-art]").forEach((el) => {
    const pick = async (e) => {
      if (e.target.closest("[data-art-remove]")) return;
      const dest = await pickArtwork(current.id, el.dataset.art);
      if (dest && current) setArt(el.dataset.art, dest);
    };
    el.addEventListener("click", pick);
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(e); } });
  });
  body.querySelectorAll("[data-art-remove]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    setArt(b.dataset.artRemove, "");
  }));
  body.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", async () => {
    collect();
    const what = b.dataset.pick;
    const res = await openDialog(what === "path"
      ? { multiple: false, title: "Datei wählen" }
      : { directory: true, multiple: false, title: "Ordner wählen" });
    if (!res) return;
    const v = Array.isArray(res) ? res[0] : res;
    if (what === "path") {
      d.path = v;
      try { d.kind = (await call("inspect_file", { path: v })).kind; } catch { /* Pfad trotzdem übernehmen */ }
    } else if (what === "workingDir") d.launch.workingDir = v;
    else if (what === "prefix") d.launch.prefix = v;
    renderTab();
  }));
  body.querySelector("[data-env-add]")?.addEventListener("click", () => {
    body.querySelector(".env-list").insertAdjacentHTML("beforeend", envRow());
    bindEnvDel(body);
    body.querySelector(".env-list .env-row:last-child input")?.focus();
  });
  bindEnvDel(body);
  body.querySelector("#ed-kind")?.addEventListener("change", () => { collect(); renderTab(); });
  body.querySelectorAll("[data-open-url]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); openUrl(a.dataset.openUrl); }));
}

function bindEnvDel(body) {
  body.querySelectorAll("[data-env-del]").forEach((b) => (b.onclick = () => b.closest(".env-row").remove()));
}

function save() {
  collect();
  const d = current.draft;
  d.name = d.name.trim();
  if (!d.name) { toast("Bitte einen Namen eingeben", "", "error"); current.tab = "general"; renderTab(); return; }
  if (!d.path.trim()) { toast("Bitte eine Datei wählen", "", "error"); current.tab = "general"; renderTab(); return; }
  const idx = state.games.findIndex((g) => g.id === current.id);
  if (idx < 0) return;
  const old = state.games[idx];
  // Ersetzte Bilder löschen
  for (const [k, p] of Object.entries(old.artwork)) if (p && p !== d.artwork[k]) call("remove_artwork", { path: p }).catch(() => {});
  state.games[idx] = d;
  current.saved = true;
  saveLibrary();
  current.modal.close();
  rerender();
  toast("Gespeichert", d.name, "ok", 2000);
}
