/**
 * worker.js — el modelo de profundidad vive aquí, en un hilo aparte, para que la pantalla (y el
 * botón Cancelar) no se congelen mientras se calcula.
 *
 * Mensajes que recibe:   { type: 'load' }
 *                        { type: 'estimate', id, rgba: ArrayBuffer, w, h }
 * Mensajes que envía:    { type: 'progress', fraction }      descarga del modelo (0…1)
 *                        { type: 'phase', phase: 'prepare' } descarga lista; se prepara el modelo
 *                        { type: 'ready', profile }
 *                        { type: 'result', id, depth: ArrayBuffer }
 *                        { type: 'error', code, message, id? }   code: 'network' | 'load' | 'estimate'
 */

import { MODEL_ID, TRANSFORMERS_URL, PROFILES, MEAN, STD, MODEL_FILE_MIN_BYTES } from './config.js';

let model = null;
let Tensor = null;

const NETWORK_RE = /failed to fetch|networkerror|network error|load failed|dynamically imported|fetch/i;

async function pickProfile() {
  try {
    const adapter = await navigator.gpu?.requestAdapter();
    if (adapter?.features.has('shader-f16')) return { name: 'gpu', ...PROFILES.gpu };
  } catch { /* sin WebGPU: se usa la CPU */ }
  return { name: 'cpu', ...PROFILES.cpu };
}

async function load() {
  let tf;
  try {
    tf = await import(TRANSFORMERS_URL);
  } catch (err) {
    const e = new Error(String(err?.message || err));
    e.code = 'network';
    throw e;
  }
  const { AutoModelForDepthEstimation, env } = tf;
  Tensor = tf.Tensor;
  env.allowLocalModels = false;

  // Progreso: solo cuentan los archivos grandes (el modelo); los .json terminan al instante y
  // darían un 100 % falso antes de empezar la descarga de verdad.
  const files = new Map();
  let prepared = false;
  const progress_callback = (p) => {
    if (p.status !== 'progress' || !p.total || p.total < MODEL_FILE_MIN_BYTES) return;
    files.set(p.file, { loaded: p.loaded, total: p.total });
    let loaded = 0;
    let total = 0;
    for (const f of files.values()) { loaded += f.loaded; total += f.total; }
    const fraction = Math.min(1, loaded / total);
    self.postMessage({ type: 'progress', fraction });
    if (fraction >= 1 && !prepared) { prepared = true; self.postMessage({ type: 'phase', phase: 'prepare' }); }
  };

  const first = await pickProfile();
  const attempts = first.name === 'gpu' ? [first, { name: 'cpu', ...PROFILES.cpu }] : [first];
  let profile = null;
  let lastError = null;
  for (const p of attempts) {
    try {
      model = await AutoModelForDepthEstimation.from_pretrained(MODEL_ID, {
        device: p.device, dtype: p.dtype, progress_callback,
      });
      profile = p;
      break;
    } catch (err) {
      lastError = err;
      files.clear();
      prepared = false;
    }
  }
  if (!model) {
    const e = new Error(String(lastError?.message || lastError || 'No se pudo cargar el modelo.'));
    e.code = NETWORK_RE.test(e.message) ? 'network' : 'load';
    throw e;
  }
  return profile;
}

async function estimate(rgbaBuffer, w, h) {
  const rgba = new Uint8ClampedArray(rgbaBuffer);
  // Lienzo RGBA → tensor [1, 3, h, w] normalizado
  const plane = w * h;
  const data = new Float32Array(3 * plane);
  for (let i = 0, p = 0; i < plane; i++, p += 4) {
    data[i] = (rgba[p] / 255 - MEAN[0]) / STD[0];
    data[plane + i] = (rgba[p + 1] / 255 - MEAN[1]) / STD[1];
    data[2 * plane + i] = (rgba[p + 2] / 255 - MEAN[2]) / STD[2];
  }
  const out = await model({ pixel_values: new Tensor('float32', data, [1, 3, h, w]) });
  const t = out.predicted_depth;
  const depth = t.type === 'float16' ? halfToFloat(t.data) : Float32Array.from(t.data);
  t.dispose?.();
  return depth;
}

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'load') {
    try {
      const profile = await load();
      self.postMessage({ type: 'ready', profile });
    } catch (err) {
      self.postMessage({ type: 'error', code: err.code || 'load', message: String(err.message || err) });
    }
  } else if (m.type === 'estimate') {
    try {
      const depth = await estimate(m.rgba, m.w, m.h);
      self.postMessage({ type: 'result', id: m.id, depth: depth.buffer }, [depth.buffer]);
    } catch (err) {
      self.postMessage({ type: 'error', code: 'estimate', id: m.id, message: String(err.message || err) });
    }
  }
};

/** float16 (guardado en Uint16Array) → Float32Array. */
function halfToFloat(src) {
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) {
    const h = src[i];
    const e = (h >> 10) & 0x1f;
    const m = h & 0x3ff;
    const v = e === 0 ? m * 2 ** -24 : e === 31 ? (m ? NaN : Infinity) : (1 + m / 1024) * 2 ** (e - 15);
    out[i] = h & 0x8000 ? -v : v;
  }
  return out;
}
