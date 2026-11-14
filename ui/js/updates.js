// Update-Prüfung über die GitHub-Releases des Projekts.
// Das ist die einzige Netzwerkverbindung des Launchers und lässt sich abschalten.
import { state, saveSettings, rerender, newerVersion, VERSION, REPO } from "./store.js";
import { notify } from "./api.js";
import { toast } from "./ui.js";

export async function checkUpdates({ manual = false } = {}) {
  const current = state.sys.version || VERSION;
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
      cache: "no-store",
    });
    state.settings.lastUpdateCheck = Date.now();
    saveSettings();
    if (r.status === 404) {
      if (manual) toast("Noch kein Release veröffentlicht", "Sobald es eines gibt, siehst du es hier.");
      return;
    }
    if (!r.ok) throw new Error("HTTP " + r.status);
    const d = await r.json();
    const latest = String(d.tag_name || "").replace(/^v/, "");
    const asset = (d.assets || []).find((a) => /\.AppImage$/i.test(a.name));
    if (latest && newerVersion(latest, current)) {
      const isNew = state.update?.version !== latest;
      state.update = { version: latest, url: d.html_url, download: asset?.browser_download_url || d.html_url, notes: d.body || "", date: d.published_at };
      if (isNew && state.settings.notifyUpdates && state.settings.dismissedVersion !== latest) {
        notify("LakuenLauncher-Update verfügbar", `Version ${latest} ist erschienen. Du nutzt ${current}.`);
      }
      if (manual) toast(`Version ${latest} ist verfügbar`, "Den Download findest du unter Einstellungen → Updates.", "ok");
    } else {
      state.update = null;
      if (manual) toast("Du nutzt die neueste Version", `LakuenLauncher ${current}`, "ok");
    }
    rerender();
  } catch (e) {
    console.warn("Update-Prüfung fehlgeschlagen", e);
    if (manual) toast("Update-Prüfung fehlgeschlagen", "GitHub ist gerade nicht erreichbar. Prüfe deine Internetverbindung.", "error");
  }
}

export function scheduleUpdateChecks() {
  const SIX_HOURS = 6 * 3600 * 1000;
  const run = () => {
    if (!state.settings.checkUpdates) return;
    if (Date.now() - (state.settings.lastUpdateCheck || 0) >= SIX_HOURS) checkUpdates();
  };
  // Beim Start einmal prüfen, danach höchstens alle 6 Stunden
  setTimeout(() => state.settings.checkUpdates && checkUpdates(), 4000);
  setInterval(run, 30 * 60 * 1000);
}
