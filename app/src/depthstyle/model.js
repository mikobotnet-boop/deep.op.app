/**
 * model.js — compatibilidad del navegador y carga del modelo de profundidad (una vez por sesión).
 */

import { MODEL_ID, TRANSFORMERS_URL, PROFILES, MEAN, STD } from './config.js';

/* =========================================================
   Compatibilidad
   ========================================================= */

/** { ok: true } o { ok: false, reason } según lo que ofrezca el navegador. */
export function checkSupport() {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    return { ok: false, reason: 'Este navegador no puede codificar video. Prueba con Chrome actualizado.' };
  }
  if (typeof WebAssembly === 'undefined') {
    return { ok: false, reason: 'Este navegador no admite WebAssembly, necesario para el modelo de profundidad.' };
  }
  return { ok: true };
}

async function pickProfile() {
  try {
    const adapter = await navigator.gpu?.requestAdapter();
    if (adapter?.features.has('shader-f16')) return { name: 'gpu', ...PROFILES.gpu };
  } catch { /* sin WebGPU: se usa la CPU */ }
  return { name: 'cpu', ...PROFILES.cpu };
}

/* =========================================================
   Modelo (se carga una sola vez por sesión)
   ========================================================= */

let modelPromise = null;

/**
 * Carga la librería y el modelo. Devuelve { estimate(rgba, w, h) → Float32Array, profile }.
 * `estimate` recibe los píxeles RGBA de un lienzo de w×h (múltiplos de 14) y devuelve la
 * profundidad relativa (mayor = más cerca).
 */
export function loadDepthModel(onProgress = () => {}) {
  if (!modelPromise) {
    modelPromise = createDepthModel(onProgress).catch((err) => {
      modelPromise = null;       // permite reintentar tras un fallo (por ejemplo, sin conexión)
      throw err;
    });
  }
  return modelPromise;
}

async function createDepthModel(onProgress) {
  const tf = await import(TRANSFORMERS_URL);
  const { AutoModelForDepthEstimation, Tensor, env } = tf;
  env.allowLocalModels = false;

  // Progreso de descarga: suma de los archivos del modelo que se están bajando
  const files = new Map();
  const progress_callback = (p) => {
    if (p.status !== 'progress' || !p.total) return;
    files.set(p.file, { loaded: p.loaded, total: p.total });
    let loaded = 0;
    let total = 0;
    for (const f of files.values()) { loaded += f.loaded; total += f.total; }
    onProgress(total ? loaded / total : 0);
  };

  const first = await pickProfile();
  const attempts = first.name === 'gpu' ? [first, { name: 'cpu', ...PROFILES.cpu }] : [first];
  let model = null;
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
    }
  }
  if (!model) throw lastError ?? new Error('No se pudo cargar el modelo.');

  async function estimate(rgba, w, h) {
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

  return { estimate, profile };
}

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
