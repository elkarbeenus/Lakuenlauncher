// Update-Prüfung über die GitHub-Releases des Projekts.
// Das ist die EINZIGE Netzwerkverbindung des Launchers und lässt sich abschalten.
import { invoke, isTauri } from './api.js';
import { state, setSetting, notify } from './store.js';
import { toast } from './ui.js';

export const REPO = 'elkarbeenus/Lakuenlauncher';
export const REPO_URL = `https://github.com/${REPO}`;
const API = `https://api.github.com/repos/${REPO}/releases?per_page=10`;

function parseVer(v) {
  const m = String(v || '').replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?/);
  if (!m) return null;
  return { nums: [+m[1], +m[2], +m[3]], pre: m[4] || '' };
}

export function isNewer(remote, local) {
  const a = parseVer(remote), b = parseVer(local);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a.nums[i] !== b.nums[i]) return a.nums[i] > b.nums[i];
  }
  if (a.pre && !b.pre) return false;
  if (!a.pre && b.pre) return true;
  return a.pre > b.pre;
}

async function fetchReleases() {
  // In der App über das Backend (curl), sonst direkt per fetch
  if (isTauri) {
    try { return JSON.parse(await invoke('http_get', { url: API })); } catch (e) { console.warn('http_get fehlgeschlagen, versuche fetch', e); }
  }
  const res = await fetch(API, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
  if (!res.ok) throw new Error(res.status === 403 ? 'GitHub-Limit erreicht – später erneut versuchen.' : `GitHub antwortet mit ${res.status}`);
  return res.json();
}

export async function checkUpdates({ manual = false } = {}) {
  try {
    const list = await fetchReleases();
    const latest = (list || []).filter((r) => !r.draft && !r.prerelease)[0];
    setSetting('lastUpdateCheck', Date.now());
    if (!latest) {
      state.update = null;
      if (manual) toast('Keine Releases gefunden', 'Auf GitHub gibt es noch keine veröffentlichte Version.');
      notify('update');
      return null;
    }
    const version = latest.tag_name.replace(/^v/i, '');
    const asset = (latest.assets || []).find((a) => /\.AppImage$/i.test(a.name));
    const info = { version, name: latest.name || latest.tag_name, url: latest.html_url, body: latest.body || '', published: latest.published_at, download: asset?.browser_download_url || latest.html_url, size: asset?.size || 0 };
    if (isNewer(version, state.version)) {
      state.update = info;
      notify('update');
      const quiet = !manual && state.settings.skippedVersion === version;
      if (!quiet) {
        toast(`Update verfügbar: v${version}`, 'Eine neue Version von LakuenLauncher ist da.', {
          timeout: 12000,
          actions: [
            { label: 'Ansehen', primary: true, onClick: () => window.dispatchEvent(new CustomEvent('lakuen:nav', { detail: { name: 'settings', settingsSection: 'updates' } })) },
            { label: 'Später', onClick: () => setSetting('skippedVersion', version) },
          ],
        });
        invoke('notify', { title: 'LakuenLauncher – Update verfügbar', body: `Version ${version} ist erschienen. Öffne die Einstellungen → Updates.` }).catch(() => {});
      }
      return info;
    }
    state.update = null;
    notify('update');
    if (manual) toast('Alles aktuell', `Du nutzt die neueste Version (v${state.version}).`, { type: 'ok' });
    return null;
  } catch (e) {
    if (manual) toast('Update-Prüfung fehlgeschlagen', String(e.message || e), { type: 'err' });
    return null;
  }
}

export function autoCheck() {
  if (!state.settings.updateCheck) return;
  // kurz nach dem Start prüfen (eine einzige Anfrage an GitHub)
  setTimeout(() => checkUpdates(), 2500);
  // während der Launcher läuft, alle 6 Stunden erneut prüfen
  setInterval(() => { if (state.settings.updateCheck) checkUpdates(); }, 6 * 3600 * 1000);
}
