// Zuschneiden & Skalieren: Bild verschieben/zoomen, bis es exakt in den Rahmen passt.
import { openModal, icon, esc } from './ui.js';

export const ART_SPECS = {
  cover: { label: 'Cover', w: 600, h: 900, view: [280, 420], fit: 'cover' },
  hero: { label: 'Banner', w: 1920, h: 620, view: [744, 240], fit: 'cover' },
  logo: { label: 'Logo', w: 1000, h: 400, view: [600, 240], fit: 'contain' },
  icon: { label: 'Icon', w: 512, h: 512, view: [300, 300], fit: 'cover' },
};

function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Bild konnte nicht geladen werden'));
    img.src = src;
  });
}

/** Unscharfer Hintergrund ohne Canvas-Filter: winzig verkleinern, groß zeichnen */
function blurLayer(img) {
  const c = document.createElement('canvas');
  c.width = 24; c.height = Math.max(1, Math.round((24 * img.naturalHeight) / img.naturalWidth));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}

/**
 * Öffnet den Zuschneide-Dialog.
 * @returns Promise<string|null> PNG/JPEG als data:-URL in Zielgröße
 */
export async function openCropper(src, kind, { title } = {}) {
  const spec = ART_SPECS[kind] || ART_SPECS.cover;
  const img = await loadImage(src);
  const iw = img.naturalWidth || 1, ih = img.naturalHeight || 1;
  const [vw, vh] = spec.view;
  const blur = blurLayer(img);
  const coverScale = Math.max(vw / iw, vh / ih);
  const containScale = Math.min(vw / iw, vh / ih);

  const st = {
    scale: spec.fit === 'contain' ? containScale : coverScale,
    x: 0, y: 0, // Versatz des Bildmittelpunkts zur Rahmenmitte (in Ansichts-Pixeln)
    bg: kind === 'logo' ? 'transparent' : 'blur',
  };
  const minScale = containScale * 0.3, maxScale = coverScale * 6;

  return new Promise((resolve) => {
    let done = false;
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="crop-wrap">
        <div class="crop-stage ${kind === 'logo' ? 'checker' : ''}" style="width:${vw}px;height:${vh}px">
          <canvas class="crop-canvas" width="${vw * 2}" height="${vh * 2}" style="width:${vw}px;height:${vh}px"></canvas>
          <div class="crop-grid"></div>
        </div>
        <div class="crop-side">
          <div class="field"><label>Zoom</label>
            <div class="input-row"><button class="btn icon small" data-z="-">${icon('down', 14)}</button>
            <input type="range" id="cr-zoom" min="0" max="1000" value="0" style="flex:1;width:auto">
            <button class="btn icon small" data-z="+">${icon('plus', 14)}</button></div></div>
          <div class="crop-btns">
            <button class="btn small" data-fit="cover">${icon('grid', 14)} Füllen</button>
            <button class="btn small" data-fit="contain">${icon('image', 14)} Einpassen</button>
            <button class="btn small" data-fit="center">${icon('sparkle', 14)} Zentrieren</button>
          </div>
          <div class="field" style="margin-top:12px"><label>Freie Flächen</label>
            <div class="seg" id="cr-bg">
              <button data-bg="blur">Unscharf</button><button data-bg="dark">Dunkel</button><button data-bg="transparent">Transparent</button>
            </div></div>
          <p class="hint" style="margin:6px 0 0">${icon('info', 12)} Ziehen zum Verschieben, Mausrad zum Zoomen. Ergebnis: ${spec.w} × ${spec.h} px.</p>
        </div>
      </div>`;
    const m = openModal({
      title: `${icon('image', 20)} ${esc(title || spec.label + ' anpassen')}`,
      body, cls: 'wide',
      footer: `<button class="btn" data-c>Abbrechen</button><button class="btn primary" data-ok>${icon('check', 16)} Übernehmen</button>`,
      onClose: () => { if (!done) resolve(null); },
    });
    const canvas = body.querySelector('.crop-canvas');
    const ctx = canvas.getContext('2d');
    const zoom = body.querySelector('#cr-zoom');

    const toSlider = (s) => Math.round((Math.log(s / minScale) / Math.log(maxScale / minScale)) * 1000);
    const fromSlider = (v) => minScale * Math.pow(maxScale / minScale, v / 1000);

    function paint(c, w, h, f, forExport) {
      // f = Faktor Ansicht -> Ziel
      c.clearRect(0, 0, w, h);
      const dw = iw * st.scale * f, dh = ih * st.scale * f;
      const dx = w / 2 + st.x * f - dw / 2, dy = h / 2 + st.y * f - dh / 2;
      if (st.bg === 'blur') {
        const s = Math.max(w / blur.width, h / blur.height) * 1.15;
        c.imageSmoothingEnabled = true;
        c.drawImage(blur, (w - blur.width * s) / 2, (h - blur.height * s) / 2, blur.width * s, blur.height * s);
        c.fillStyle = 'rgba(0,0,0,0.25)';
        c.fillRect(0, 0, w, h);
      } else if (st.bg === 'dark') {
        c.fillStyle = '#0c0a12';
        c.fillRect(0, 0, w, h);
      }
      c.imageSmoothingQuality = 'high';
      c.drawImage(img, dx, dy, dw, dh);
      if (!forExport) return;
    }
    function draw() {
      paint(ctx, canvas.width, canvas.height, 2, false);
      zoom.value = toSlider(st.scale);
      body.querySelectorAll('[data-bg]').forEach((b) => b.classList.toggle('on', b.dataset.bg === st.bg));
    }
    function setScale(s, cx = 0, cy = 0) {
      const ns = Math.min(maxScale, Math.max(minScale, s));
      // um den Punkt (cx,cy) relativ zur Rahmenmitte zoomen
      const k = ns / st.scale;
      st.x = cx - (cx - st.x) * k;
      st.y = cy - (cy - st.y) * k;
      st.scale = ns;
      draw();
    }

    // Verschieben
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, sx: st.x, sy: st.y }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      st.x = drag.sx + (e.clientX - drag.x);
      st.y = drag.sy + (e.clientY - drag.y);
      draw();
    });
    canvas.addEventListener('pointerup', () => { drag = null; });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      setScale(st.scale * (e.deltaY < 0 ? 1.08 : 1 / 1.08), e.clientX - r.left - vw / 2, e.clientY - r.top - vh / 2);
    }, { passive: false });
    zoom.addEventListener('input', () => setScale(fromSlider(+zoom.value)));
    body.querySelectorAll('[data-z]').forEach((b) => b.onclick = () => setScale(st.scale * (b.dataset.z === '+' ? 1.15 : 1 / 1.15)));
    body.querySelectorAll('[data-fit]').forEach((b) => b.onclick = () => {
      if (b.dataset.fit === 'cover') st.scale = coverScale;
      if (b.dataset.fit === 'contain') st.scale = containScale;
      st.x = 0; st.y = 0;
      draw();
    });
    body.querySelectorAll('[data-bg]').forEach((b) => b.onclick = () => { st.bg = b.dataset.bg; draw(); });
    m.el.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 20 : 4;
      if (e.key === 'ArrowLeft') st.x -= step; else if (e.key === 'ArrowRight') st.x += step;
      else if (e.key === 'ArrowUp') st.y -= step; else if (e.key === 'ArrowDown') st.y += step;
      else if (e.key === '+') return setScale(st.scale * 1.1); else if (e.key === '-') return setScale(st.scale / 1.1);
      else if (e.key === 'Enter') { e.preventDefault(); return finish(); } else return;
      e.preventDefault(); draw();
    });

    function finish() {
      const out = document.createElement('canvas');
      out.width = spec.w; out.height = spec.h;
      const octx = out.getContext('2d');
      paint(octx, spec.w, spec.h, spec.w / vw, true);
      const transparent = st.bg === 'transparent';
      const url = transparent ? out.toDataURL('image/png') : out.toDataURL('image/jpeg', 0.92);
      done = true;
      m.close();
      resolve(url);
    }
    m.foot.querySelector('[data-c]').onclick = m.close;
    m.foot.querySelector('[data-ok]').onclick = finish;
    draw();
    setTimeout(() => m.foot.querySelector('[data-ok]').focus(), 30);
  });
}
