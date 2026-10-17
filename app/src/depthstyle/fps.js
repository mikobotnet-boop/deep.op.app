/**
 * fps.js — fotogramas por segundo de la salida: se miden en el video original.
 *
 * El navegador no da los fps de un video directamente. Se reproduce el fragmento (en silencio y sin
 * mostrarlo) durante un instante y se miden los intervalos entre fotogramas con
 * requestVideoFrameCallback. Si no se puede medir, se usa OUTPUT_FPS_DEFAULT.
 */

import { OUTPUT_FPS_DEFAULT, OUTPUT_FPS_MAX, FPS_PROBE_MS } from './config.js';

const COMMON = [24, 25, 30, 48, 50, 60];

/**
 * Estima los fps a partir de los intervalos (s) entre fotogramas presentados. Si el dispositivo
 * pierde algún fotograma, ese intervalo sale doble: por eso se usan los más cortos, no la media.
 * Devuelve null si hay pocos datos.
 */
export function fpsFromIntervals(deltas) {
  const valid = deltas.filter((d) => d > 1 / 240 && d < 0.5).sort((a, b) => a - b);
  if (valid.length < 3) return null;
  const shortest = valid.slice(0, Math.min(5, valid.length));
  const median = shortest[Math.floor(shortest.length / 2)];
  return 1 / median;
}

/** Ajusta a un valor habitual (29,97 → 30; 23,976 → 24) y lo baja al tope dividiendo entre 2 (60 → 30, 50 → 25). */
export function snapFps(raw, maxFps = OUTPUT_FPS_MAX) {
  if (!(raw > 0)) return OUTPUT_FPS_DEFAULT;
  let fps = COMMON.find((f) => Math.abs(raw - f) / f < 0.04) ?? Math.round(raw);
  while (fps > maxFps) fps = fps / 2;
  return Math.max(10, Math.round(fps));
}

/**
 * Mide los fps del fragmento [start, end] de `video`. Siempre devuelve un número usable.
 * `maxFps` es el tope de la salida (por defecto el de DepthStyle; el Compresor pasa el suyo).
 */
export async function detectFps(video, start, end, maxFps = OUTPUT_FPS_MAX) {
  if (typeof video.requestVideoFrameCallback !== 'function') return OUTPUT_FPS_DEFAULT;
  const deltas = [];
  // Algunos navegadores no avisan de los fotogramas de un video fuera de la página: se pone dentro,
  // invisible y sin interferir, solo durante la medición.
  const prevStyle = video.style.cssText;
  video.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none;';
  document.body.appendChild(video);
  try {
    await new Promise((resolve) => {
      let last = null;
      let count = 0;
      const stop = () => { clearTimeout(timer); video.removeEventListener('ended', stop); resolve(); };
      const timer = setTimeout(stop, FPS_PROBE_MS);
      video.addEventListener('ended', stop);
      const onFrame = (_now, meta) => {
        if (last !== null) deltas.push(meta.mediaTime - last);
        last = meta.mediaTime;
        if (++count >= 14 || meta.mediaTime >= end - 0.05) { stop(); return; }
        video.requestVideoFrameCallback(onFrame);
      };
      video.currentTime = start;
      video.requestVideoFrameCallback(onFrame);
      video.play().catch(stop);
    });
  } catch { /* se usa el valor por defecto */ }
  finally {
    video.pause();
    video.remove();
    video.style.cssText = prevStyle;
  }
  const raw = fpsFromIntervals(deltas);
  return raw === null ? Math.min(OUTPUT_FPS_DEFAULT, maxFps) : snapFps(raw, maxFps);
}
