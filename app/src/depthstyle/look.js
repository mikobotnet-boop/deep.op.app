/**
 * look.js — el aspecto DepthStyle: funciones puras (sin DOM, fáciles de probar y de mejorar).
 */

import { DEPTH_GAMMA, FOG_FLOOR, TEMPORAL_MIX, RANGE_MIX } from './config.js';


/**
 * Normaliza un mapa de profundidad a 0…1 usando los percentiles 1 y 99 (ignora valores sueltos)
 * y un rango que se adapta despacio entre fotogramas (`range` se actualiza en el sitio).
 */
export function normalizeDepth(depth, range) {
  const BINS = 512;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < depth.length; i++) {
    const v = depth[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!(max > min)) return new Float32Array(depth.length);   // plano (o con NaN): todo a 0

  const hist = new Uint32Array(BINS);
  const scale = (BINS - 1) / (max - min);
  for (let i = 0; i < depth.length; i++) hist[((depth[i] - min) * scale) | 0]++;

  const cut = depth.length * 0.01;
  let acc = 0;
  let loBin = 0;
  for (; loBin < BINS - 1; loBin++) { acc += hist[loBin]; if (acc > cut) break; }
  acc = 0;
  let hiBin = BINS - 1;
  for (; hiBin > 0; hiBin--) { acc += hist[hiBin]; if (acc > cut) break; }
  const lo = min + loBin / scale;
  const hi = min + (hiBin + 1) / scale;

  if (range.lo === null) { range.lo = lo; range.hi = hi; }
  else {
    range.lo += (lo - range.lo) * RANGE_MIX;
    range.hi += (hi - range.hi) * RANGE_MIX;
  }

  const span = Math.max(range.hi - range.lo, 1e-6);
  const out = new Float32Array(depth.length);
  for (let i = 0; i < depth.length; i++) {
    const n = (depth[i] - range.lo) / span;
    out[i] = n < 0 ? 0 : n > 1 ? 1 : n;
  }
  return out;
}

/**
 * Mezcla el mapa nuevo con el anterior (quita el parpadeo) y lo pasa a gris en `rgba`:
 * cercano (1) → oscuro, lejano (0) → claro. `prev` se actualiza en el sitio.
 */
export function paintDepth(norm, prev, rgba) {
  for (let i = 0, p = 0; i < norm.length; i++, p += 4) {
    const n = prev[i] < 0 ? norm[i] : prev[i] + (norm[i] - prev[i]) * TEMPORAL_MIX;
    prev[i] = n;
    const g = FOG_FLOOR + (1 - FOG_FLOOR) * (1 - Math.pow(n, DEPTH_GAMMA));
    const v = (g * 255 + 0.5) | 0;
    rgba[p] = v;
    rgba[p + 1] = v;
    rgba[p + 2] = v;
    rgba[p + 3] = 255;
  }
}
