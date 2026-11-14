// Einführung beim ersten Start – jederzeit über Einstellungen → Hilfe erneut abrufbar.
import { state, saveSettings } from "./store.js";
import { esc } from "./ui.js";

const STEPS = [
  {
    title: "Willkommen bei LakuenLauncher",
    text: "Hier sammelst du AppImages und Windows-Spiele an einem Ort und startest sie mit einem Klick. Alles bleibt lokal auf deinem Gerät – ohne Konto.",
    center: true,
    logo: true,
  },
  {
    target: '[data-tour="add"]',
    title: "Spiele hinzufügen",
    text: "Wähle AppImages oder .exe-Dateien aus – oder zieh sie einfach ins Fenster. „Ordner durchsuchen“ findet mehrere auf einmal.",
  },
  {
    target: '[data-tour="search"]',
    title: "Schnell finden",
    text: "Tippe hier zum Filtern. Mit Strg+K öffnest du von überall die Schnellsuche und startest Spiele direkt mit Enter.",
  },
  {
    target: '[data-tour="library"]',
    title: "Deine Bibliothek",
    text: "Klick auf ein Spiel für Details, Spielzeit und Werkzeuge. Unter „Bearbeiten“ vergibst du eigene Namen und Artwork: Cover, Banner, Logo und Icon.",
  },
  {
    target: '[data-tour="nav-settings"]',
    title: "Windows-Spiele",
    text: "Für .exe-Dateien nutzt der Launcher automatisch Proton Experimental. Pro Spiel oder in den Einstellungen kannst du eine andere Version wählen.",
  },
  {
    target: '[data-tour="nav-stats"]',
    title: "Spielzeit",
    text: "Gezählt wird nur, was du über den Launcher startest. In der Statistik siehst du, wann und wie lange du gespielt hast.",
  },
  {
    title: "Alles bereit",
    text: "Themes, Updates und diese Einführung findest du jederzeit in den Einstellungen. Viel Spaß!",
    center: true,
    last: true,
  },
];

let layer = null;

export function startTutorial(goLibrary) {
  if (layer) return;
  goLibrary && goLibrary();
  let i = 0;
  layer = document.createElement("div");
  layer.className = "tour-layer";
  layer.innerHTML = `<div class="tour-spot"></div><div class="tour-card" role="dialog" aria-live="polite"></div>`;
  document.body.appendChild(layer);
  const spot = layer.querySelector(".tour-spot");
  const card = layer.querySelector(".tour-card");

  const finish = () => {
    layer.remove();
    layer = null;
    window.removeEventListener("resize", place);
    document.removeEventListener("keydown", onKey, true);
    state.settings.tutorialDone = true;
    saveSettings();
  };
  const onKey = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); finish(); }
    else if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); next(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
  };
  const next = () => { if (i >= STEPS.length - 1) finish(); else { i++; draw(); } };
  const prev = () => { if (i > 0) { i--; draw(); } };

  function place() {
    const st = STEPS[i];
    const el = st.target && document.querySelector(st.target);
    if (!el || st.center) {
      spot.style.cssText = `left:50%;top:50%;width:0;height:0;`;
      card.classList.add("center");
      card.style.left = `calc(50% - ${card.offsetWidth / 2}px)`;
      card.style.top = `calc(50% - ${card.offsetHeight / 2}px)`;
      return;
    }
    card.classList.remove("center");
    el.scrollIntoView({ block: "nearest" });
    const r = el.getBoundingClientRect();
    const pad = 8;
    const h = Math.min(r.height, window.innerHeight * 0.5);
    spot.style.cssText = `left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${h + pad * 2}px;`;
    const cw = card.offsetWidth, ch = card.offsetHeight;
    let left = Math.min(Math.max(16, r.left + r.width / 2 - cw / 2), window.innerWidth - cw - 16);
    let top = r.top + h + pad + 16;
    if (top + ch > window.innerHeight - 16) top = r.top - pad - ch - 16;
    if (top < 16) { top = Math.min(window.innerHeight - ch - 16, r.top); left = r.right + pad + 16; if (left + cw > window.innerWidth - 16) left = r.left - cw - pad - 16; }
    card.style.left = left + "px";
    card.style.top = top + "px";
  }

  function draw() {
    const st = STEPS[i];
    card.innerHTML = `
      ${st.logo ? `<img class="t-logo" src="assets/logo.svg" alt="">` : ""}
      ${!st.center ? `<div class="t-step">Schritt ${i} von ${STEPS.length - 2}</div>` : ""}
      <h3>${esc(st.title)}</h3>
      <p>${esc(st.text)}</p>
      <div class="t-actions">
        <div class="t-dots">${STEPS.slice(1, -1).map((_, k) => `<i class="${k + 1 === i ? "on" : ""}"></i>`).join("")}</div>
        ${i === 0 ? `<button class="btn ghost" data-t="skip">Überspringen</button>` : st.last ? "" : `<button class="btn ghost" data-t="prev">Zurück</button>`}
        <button class="btn primary" data-t="next">${i === 0 ? "Los geht’s" : st.last ? "Fertig" : "Weiter"}</button>
      </div>`;
    card.querySelector('[data-t="next"]').onclick = next;
    card.querySelector('[data-t="prev"]')?.addEventListener("click", prev);
    card.querySelector('[data-t="skip"]')?.addEventListener("click", finish);
    requestAnimationFrame(place);
    setTimeout(() => card.querySelector('[data-t="next"]').focus(), 50);
  }

  window.addEventListener("resize", place);
  document.addEventListener("keydown", onKey, true);
  draw();
}
