/**
 * depthstyle.js — conversión de video a DepthStyle, entera en el dispositivo (sin servidor).
 *
 * DepthStyle = el video mostrado como mapa de profundidad en escala de grises: lo cercano oscuro,
 * lo lejano claro y con niebla.
 *
 * Tubería, fotograma a fotograma:
 *   1. Se coloca un <video> oculto en el instante del fotograma y se dibuja en un lienzo pequeño.
 *   2. Depth Anything V2 (small) estima la profundidad relativa de ese lienzo.
 *   3. Se normaliza (con memoria entre fotogramas, para que no parpadee) y se pasa a gris.
 *   4. Ese mapa se escala (suavizado) al lienzo de salida.
 *   5. WebCodecs (VideoEncoder) lo codifica en H.264 y mp4-muxer lo guarda en un MP4.
 *
 * Las librerías (transformers.js y mp4-muxer) se cargan de jsDelivr solo cuando se pulsa
 * «Procesar video». El service worker no gestiona dominios ajenos: las guarda la caché normal del
 * navegador, así que la primera conversión necesita conexión y las siguientes suelen funcionar sin ella.
 * El modelo lo descarga transformers.js la primera vez (≈27 MB sin GPU, ≈50 MB con ella) y lo
 * guarda en la caché del navegador. El MP4 sale sin sonido.
 */

/* =========================================================
   Ajustes
   ========================================================= */

export const MODEL_ID = 'onnx-community/depth-anything-v2-small';
const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
const MUXER_URL = 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/+esm';

// Con GPU (WebGPU) se puede estimar a más resolución y más fotogramas por segundo.
const PROFILES = {
  gpu: { device: 'webgpu', dtype: 'fp16', depthLong: 392, fps: 24 },
  cpu: { device: 'wasm',   dtype: 'q8',   depthLong: 308, fps: 12 },
};
const OUT_LONG_SIDE = 1280;      // lado largo máximo del video de salida (720p)
const KEYFRAME_EVERY_S = 2;
const MAX_QUEUE = 6;             // fotogramas esperando al codificador antes de pausar
const SEEK_TIMEOUT_MS = 8000;

// Aspecto de DepthStyle
const DEPTH_GAMMA = 1.35;        // >1 oscurece lo cercano y deja el fondo en niebla clara
const FOG_FLOOR = 0.03;          // el negro nunca es 100 % negro (se parece a la referencia)
const TEMPORAL_MIX = 0.6;        // peso del fotograma nuevo (el resto es el anterior): quita parpadeo
const RANGE_MIX = 0.12;          // velocidad con la que se adapta el rango min/máx entre fotogramas

const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

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

/* =========================================================
   Aspecto DepthStyle (funciones puras)
   ========================================================= */

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

/* =========================================================
   Utilidades
   ========================================================= */

const even = (n) => Math.max(2, Math.round(n / 2) * 2);
const multipleOf14 = (n) => Math.max(14, Math.round(n / 14) * 14);

function abortError() {
  return new DOMException('Conversión cancelada.', 'AbortError');
}

function seek(video, time) {
  return new Promise((resolve, reject) => {
    if (Math.abs(video.currentTime - time) < 1e-3 && video.readyState >= 2) { resolve(); return; }
    const timer = setTimeout(() => { cleanup(); reject(new Error('El video no respondió al buscar un fotograma.')); }, SEEK_TIMEOUT_MS);
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error('No se pudo leer un fotograma del video.')); };
    function cleanup() {
      clearTimeout(timer);
      video.removeEventListener('seeked', done);
      video.removeEventListener('error', fail);
    }
    video.addEventListener('seeked', done);
    video.addEventListener('error', fail);
    video.currentTime = time;
  });
}

function openVideo(url) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.onloadeddata = () => resolve(video);
    video.onerror = () => reject(new Error('No se pudo abrir el video para convertirlo.'));
    video.src = url;
  });
}

const FOLDS = ['avc1.640028', 'avc1.4d0028', 'avc1.420028'];   // H.264 High / Main / Baseline, nivel 4.0

async function pickCodec(width, height, bitrate, framerate) {
  for (const codec of FOLDS) {
    const cfg = { codec, width, height, bitrate, framerate };
    try {
      const { supported } = await VideoEncoder.isConfigSupported(cfg);
      if (supported) return cfg;
    } catch { /* se prueba el siguiente */ }
  }
  throw new Error('Este dispositivo no puede codificar video H.264.');
}

/* =========================================================
   Conversión
   ========================================================= */

/**
 * Convierte el fragmento [start, end] (segundos) de `url` a DepthStyle y devuelve un Blob MP4.
 *
 * @param {object}   o
 * @param {string}   o.url        URL del video (object URL del archivo elegido)
 * @param {number}   o.start
 * @param {number}   o.end
 * @param {AbortSignal} [o.signal]
 * @param {(e: {phase: 'model'|'frames'|'finish', fraction: number, etaSeconds?: number,
 *             profile?: string}) => void} [o.onProgress]
 * @param {{estimate: Function, profile: object}} [o.depth]  estimador ya cargado (para pruebas)
 */
export async function convertToDepthStyle({ url, start, end, signal, onProgress = () => {}, depth }) {
  const check = checkSupport();
  if (!check.ok) throw new Error(check.reason);
  if (signal?.aborted) throw abortError();

  const model = depth ?? await loadDepthModel((f) => onProgress({ phase: 'model', fraction: f }));
  const { profile } = model;
  if (signal?.aborted) throw abortError();

  const video = await openVideo(url);
  let encoder = null;
  try {
    // Tamaños: el de salida (pares) y el del mapa de profundidad (múltiplos de 14)
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const k = Math.min(1, OUT_LONG_SIDE / Math.max(vw, vh));
    const outW = even(vw * k);
    const outH = even(vh * k);
    const dk = profile.depthLong / Math.max(vw, vh);
    const dW = multipleOf14(vw * dk);
    const dH = multipleOf14(vh * dk);

    const fps = profile.fps;
    const total = Math.max(1, Math.round((end - start) * fps));
    const bitrate = Math.min(12e6, Math.max(2e6, Math.round(outW * outH * fps * 0.2)));

    // Lienzos
    const inCanvas = document.createElement('canvas');
    inCanvas.width = dW; inCanvas.height = dH;
    const inCtx = inCanvas.getContext('2d', { willReadFrequently: true });
    const dCanvas = document.createElement('canvas');
    dCanvas.width = dW; dCanvas.height = dH;
    const dCtx = dCanvas.getContext('2d');
    const outCanvas = document.createElement('canvas');
    outCanvas.width = outW; outCanvas.height = outH;
    const outCtx = outCanvas.getContext('2d');
    outCtx.imageSmoothingEnabled = true;
    outCtx.imageSmoothingQuality = 'high';
    const gray = dCtx.createImageData(dW, dH);

    // Codificador + MP4
    const { Muxer, ArrayBufferTarget } = await import(MUXER_URL);
    const config = await pickCodec(outW, outH, bitrate, fps);
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      video: { codec: 'avc', width: outW, height: outH, frameRate: fps },
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset',
    });
    let encoderError = null;
    encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => { encoderError = e; },
    });
    encoder.configure(config);

    // Fotograma a fotograma
    const range = { lo: null, hi: null };
    const prev = new Float32Array(dW * dH).fill(-1);
    const keyEvery = Math.max(1, Math.round(KEYFRAME_EVERY_S * fps));
    const t0 = performance.now();

    for (let i = 0; i < total; i++) {
      if (signal?.aborted) throw abortError();
      if (encoderError) throw encoderError;

      const t = Math.min(start + i / fps, Math.max(start, end - 0.001));
      await seek(video, t);
      inCtx.drawImage(video, 0, 0, dW, dH);
      const rgba = inCtx.getImageData(0, 0, dW, dH).data;

      const raw = await model.estimate(rgba, dW, dH);
      paintDepth(normalizeDepth(raw, range), prev, gray.data);
      dCtx.putImageData(gray, 0, 0);
      outCtx.drawImage(dCanvas, 0, 0, outW, outH);

      const frame = new VideoFrame(outCanvas, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) });
      encoder.encode(frame, { keyFrame: i % keyEvery === 0 });
      frame.close();

      // Si el codificador va por detrás, se espera para no llenar la memoria
      while (encoder.encodeQueueSize > MAX_QUEUE) {
        if (signal?.aborted) throw abortError();
        await new Promise((r) => setTimeout(r, 10));
      }

      const done = i + 1;
      const elapsed = (performance.now() - t0) / 1000;
      onProgress({
        phase: 'frames',
        fraction: done / total,
        etaSeconds: done >= 3 ? (elapsed / done) * (total - done) : undefined,
        profile: profile.name,
      });
    }

    onProgress({ phase: 'finish', fraction: 1 });
    await encoder.flush();
    if (encoderError) throw encoderError;
    muxer.finalize();
    return new Blob([target.buffer], { type: 'video/mp4' });
  } finally {
    if (encoder && encoder.state !== 'closed') { try { encoder.close(); } catch { /* ya cerrado */ } }
    video.removeAttribute('src');
    video.load();
  }
}
