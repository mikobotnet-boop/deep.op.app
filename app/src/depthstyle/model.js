/**
 * model.js — compatibilidad del navegador y cliente del modelo de profundidad.
 *
 * El modelo se ejecuta en un worker (worker.js) que se crea una sola vez por sesión y se reutiliza
 * entre conversiones. Aquí se gestionan los tiempos máximos y los mensajes de error en español.
 */

import { STALL_TIMEOUT_MS, ESTIMATE_TIMEOUT_MS, TRANSFORMERS_URL, PROBE_TIMEOUT_MS } from './config.js';
import { DEPTHSTYLE_VERSION } from './version.js';

/* =========================================================
   Errores y compatibilidad
   ========================================================= */

export class DepthStyleError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DepthStyleError';
    this.code = code;
  }
}

const MESSAGES = {
  network: 'Sin conexión con el servidor de librerías. La primera conversión necesita internet para descargar el modelo (≈50 MB). Conéctate y vuelve a intentarlo.',
  timeoutLoad: 'El modelo tardó demasiado en cargarse (descarga o preparación). Revisa tu conexión y vuelve a intentarlo.',
  timeoutFrame: 'Un fotograma tardó demasiado en calcularse. Cierra otras apps, prueba con un fragmento más corto y vuelve a intentarlo.',
  gpuTimeout: 'La GPU del teléfono no respondió a tiempo. Cambié al modo sin GPU (más lento, pero más compatible): pulsa «Procesar video» otra vez. Para volver a probar la GPU, abre la app con ?cpu=0 al final de la dirección.',
  worker: 'No se pudo iniciar el motor de conversión en este navegador. Prueba con Chrome actualizado.',
};

function modelError(code, detail) {
  return new DepthStyleError(code, MESSAGES[code] ?? `No se pudo cargar el modelo de profundidad${detail ? ` (${detail})` : ''}.`);
}

/* Preferencia «sin GPU»: se activa sola si la GPU se cuelga, o a mano con ?cpu=1 (y ?cpu=0 la quita).
   Se guarda junto con la versión de DepthStyle: en cuanto sale una versión nueva se vuelve a probar la GPU. */
const CPU_KEY = 'depthstyle.forceCpu';
function readCpuPref() {
  try {
    const q = new URLSearchParams(location.search).get('cpu');
    if (q === '1') localStorage.setItem(CPU_KEY, DEPTHSTYLE_VERSION);
    if (q === '0') localStorage.removeItem(CPU_KEY);
    return localStorage.getItem(CPU_KEY) === DEPTHSTYLE_VERSION;
  } catch { return false; }
}
let forceCpu = readCpuPref();
function preferCpu() {
  forceCpu = true;
  try { localStorage.setItem(CPU_KEY, DEPTHSTYLE_VERSION); } catch { /* sin almacenamiento: solo esta sesión */ }
}

/** ¿Hay conexión con el servidor de librerías? Se comprueba antes de culpar a la GPU de un bloqueo. */
async function serverReachable() {
  if (navigator.onLine === false) return false;
  try {
    await fetch(TRANSFORMERS_URL, { method: 'HEAD', mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    return true;
  } catch { return false; }
}

const abortError = () => new DOMException('Conversión cancelada.', 'AbortError');

/** { ok: true } o { ok: false, reason } según lo que ofrezca el navegador. */
export function checkSupport() {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    return { ok: false, reason: 'Este navegador no puede codificar video. Prueba con Chrome actualizado.' };
  }
  if (typeof WebAssembly === 'undefined' || typeof Worker === 'undefined') {
    return { ok: false, reason: 'Este navegador no admite WebAssembly ni workers, necesarios para el modelo de profundidad.' };
  }
  return { ok: true };
}

/* =========================================================
   Cliente del worker (se crea una sola vez por sesión)
   ========================================================= */

let client = null;

function stopClient(c) {
  c.dead = true;
  c.worker.terminate();
  if (client === c) client = null;
}

function startClient() {
  const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  const c = { worker, onProgress: () => {}, pending: new Map(), nextId: 1, profile: null, watchdog: 0, gpu: false, downloading: false };

  const fail = (err) => {
    if (c.dead) return;
    clearTimeout(c.watchdog);
    c.rejectReady?.(err);
    for (const p of c.pending.values()) p.reject(err);
    c.pending.clear();
    stopClient(c);
  };
  // Si el modelo no da señales de vida durante STALL_TIMEOUT_MS (descarga o preparación), se corta.
  const arm = () => {
    clearTimeout(c.watchdog);
    c.watchdog = setTimeout(async () => {
      // Con GPU y sin descarga en curso, solo se culpa a la GPU si hay conexión con el servidor
      // (si no la hay, el bloqueo es de red y no se cambia ninguna preferencia).
      const gpuHung = c.gpu && !c.downloading && await serverReachable();
      if (c.dead || c.profile) return;          // mientras se comprobaba, el modelo se cargó o ya falló
      if (gpuHung) { preferCpu(); fail(modelError('gpuTimeout')); }
      else fail(modelError('timeoutLoad'));
    }, STALL_TIMEOUT_MS);
  };

  c.ready = new Promise((resolve, reject) => { c.resolveReady = resolve; c.rejectReady = reject; });
  c.ready.catch(() => {});          // evita «unhandled rejection» si nadie la espera ya

  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'profile') { c.gpu = m.name === 'gpu'; }
    else if (m.type === 'progress') { c.downloading = m.fraction < 1; arm(); c.onProgress({ phase: 'model', fraction: m.fraction }); }
    else if (m.type === 'phase') { c.downloading = false; arm(); c.onProgress({ phase: 'prepare', fraction: null }); }
    else if (m.type === 'ready') { clearTimeout(c.watchdog); c.profile = m.profile; c.resolveReady(m.profile); }
    else if (m.type === 'result') { c.pending.get(m.id)?.resolve(new Float32Array(m.depth)); c.pending.delete(m.id); }
    else if (m.type === 'error') {
      if (m.id !== undefined) {
        c.pending.get(m.id)?.reject(new DepthStyleError('estimate', `No se pudo calcular la profundidad: ${m.message}`));
        c.pending.delete(m.id);
      } else fail(modelError(m.code, m.message));
    }
  };
  worker.onerror = (e) => fail(modelError('worker', e.message));
  worker.onmessageerror = () => fail(modelError('worker'));

  c.onProgress({ phase: 'model', fraction: null });
  arm();
  worker.postMessage({ type: 'load', cpu: forceCpu });
  return c;
}

/**
 * Carga el modelo (descarga la primera vez). Devuelve { estimate(rgba, w, h, signal) → Float32Array,
 * profile }. `estimate` recibe los píxeles RGBA de un lienzo de w×h (múltiplos de 14) y devuelve la
 * profundidad relativa (mayor = más cerca).
 *
 * onProgress({ phase: 'model', fraction: 0…1 | null }) durante la descarga y
 * onProgress({ phase: 'prepare' }) mientras el dispositivo prepara el modelo.
 */
export async function loadDepthModel(onProgress = () => {}, signal) {
  if (signal?.aborted) throw abortError();
  const c = client ?? (client = startClient());
  c.onProgress = onProgress;
  if (c.profile) onProgress({ phase: 'prepare', fraction: null });

  const abort = new Promise((_, reject) => {
    signal?.addEventListener('abort', () => reject(abortError()), { once: true });
  });
  const profile = await Promise.race([c.ready, abort]);

  const estimate = (rgba, w, h, estimateSignal) => new Promise((resolve, reject) => {
    if (estimateSignal?.aborted) { reject(abortError()); return; }
    const id = c.nextId++;
    const timer = setTimeout(() => {
      c.pending.delete(id);
      stopClient(c);                // un fotograma colgado deja el worker inservible: se descarta
      if (c.profile?.name === 'gpu') { preferCpu(); reject(modelError('gpuTimeout')); }
      else reject(modelError('timeoutFrame'));
    }, ESTIMATE_TIMEOUT_MS);
    const done = (fn) => (v) => { clearTimeout(timer); fn(v); };
    c.pending.set(id, { resolve: done(resolve), reject: done(reject) });
    estimateSignal?.addEventListener('abort', () => {
      clearTimeout(timer);
      c.pending.delete(id);
      reject(abortError());
    }, { once: true });
    c.worker.postMessage({ type: 'estimate', id, rgba: rgba.buffer, w, h }, [rgba.buffer]);
  });

  return { estimate, profile };
}
