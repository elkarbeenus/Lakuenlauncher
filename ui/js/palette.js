// Schnellsuche (Strg+K): Spiele starten, Bereiche öffnen, Themes wechseln.
import { state, totals, saveSettings, rerender, fmtDuration } from "./store.js";
import { esc, icon, openModal, thumbHtml } from "./ui.js";
import { allThemes, applyTheme } from "./themes.js";

let open = null;

/** Einfache unscharfe Suche: alle Zeichen müssen in Reihenfolge vorkommen. */
function score(text, q) {
  text = text.toLowerCase();
  if (!q) return 1;
  const idx = text.indexOf(q);
  if (idx === 0) return 100;
  if (idx > 0) return 80 - Math.min(idx, 40);
  let ti = 0, s = 0, run = 0;
  for (const ch of q) {
    const found = text.indexOf(ch, ti);
    if (found < 0) return 0;
    run = found === ti ? run + 1 : 0;
    s += 1 + run;
    ti = found + 1;
  }
  return Math.min(60, s);
}

export function openPalette(actions) {
  if (open) return;
  const t = totals();
  const items = () => {
    const q = input.value.trim().toLowerCase();
    const games = state.games
      .filter((g) => !g.hidden)
      .map((g) => ({ g, s: score(g.name, q) + (q ? 0 : (t[g.id]?.last || 0) / 1e13) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, q ? 8 : 6)
      .map(({ g }) => ({
        group: q ? "Spiele" : "Zuletzt gespielt",
        label: g.name,
        hint: state.running[g.id] ? "läuft – Enter öffnet Details" : "Enter startet, Umschalt+Enter zeigt Details",
        thumb: thumbHtml(g),
        run: (shift) => (shift || state.running[g.id] ? actions.open(g.id) : actions.play(g.id)),
      }));
    const cmds = [
      ["Spiel hinzufügen", "plus", () => actions.add()],
      ["Ordner durchsuchen", "scan", () => actions.scan()],
      ["Bibliothek öffnen", "library", () => actions.nav("library")],
      ["Statistik öffnen", "stats", () => actions.nav("stats")],
      ["Einstellungen öffnen", "settings", () => actions.nav("settings")],
      ["Nach Updates suchen", "refresh", () => actions.updateCheck()],
      ["Einführung anzeigen", "sparkle", () => actions.tutorial()],
    ].map(([label, ic, run]) => ({ group: "Befehle", label, thumb: icon(ic), run, s: score(label, q) }))
      .filter((c) => c.s > 0);
    const themes = q.length >= 2
      ? allThemes().map((th) => ({ group: "Themes", label: "Theme: " + th.name, thumb: icon("palette"), s: score("theme " + th.name, q), run: () => { state.settings.theme = th.id; saveSettings(); applyTheme(); rerender(); } }))
        .filter((c) => c.s > 0).slice(0, 4)
      : [];
    return [...games, ...cmds, ...themes];
  };

  const m = openModal(
    `<div class="p-input">${icon("search")}<input type="text" placeholder="Spiel starten oder Befehl suchen …" aria-label="Schnellsuche" autocomplete="off" spellcheck="false"><kbd>Esc</kbd></div>
     <div class="p-list" role="listbox"></div>
     <div class="p-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> auswählen</span><span><kbd>Enter</kbd> ausführen</span><span><kbd>Umschalt</kbd> <kbd>Enter</kbd> Details</span></div>`,
    { cls: "palette", onClose: () => (open = null) },
  );
  open = m;
  const input = m.el.querySelector("input");
  const list = m.el.querySelector(".p-list");
  let sel = 0;
  let current = [];

  const draw = () => {
    current = items();
    if (sel >= current.length) sel = Math.max(0, current.length - 1);
    let last = "";
    list.innerHTML = current.length
      ? current.map((it, i) => {
        const head = it.group !== last ? `<div class="p-group">${esc(it.group)}</div>` : "";
        last = it.group;
        return `${head}<div class="p-item ${i === sel ? "sel" : ""}" role="option" data-i="${i}"><div class="thumb">${it.thumb}</div><div class="lbl">${esc(it.label)}</div>${it.hint && i === sel ? `<div class="hint">${esc(it.hint)}</div>` : ""}</div>`;
      }).join("")
      : `<div class="p-group">Nichts gefunden</div>`;
    list.querySelector(".sel")?.scrollIntoView({ block: "nearest" });
  };
  const exec = (i, shift = false) => {
    const it = current[i];
    if (!it) return;
    m.close();
    it.run(shift);
  };
  input.addEventListener("input", () => { sel = 0; draw(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(current.length - 1, sel + 1); draw(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); }
    else if (e.key === "Enter") { e.preventDefault(); exec(sel, e.shiftKey); }
  });
  list.addEventListener("mousemove", (e) => {
    const it = e.target.closest(".p-item");
    if (it && +it.dataset.i !== sel) { sel = +it.dataset.i; draw(); }
  });
  list.addEventListener("click", (e) => {
    const it = e.target.closest(".p-item");
    if (it) exec(+it.dataset.i, e.shiftKey);
  });
  draw();
  input.focus();
}

export { fmtDuration };
