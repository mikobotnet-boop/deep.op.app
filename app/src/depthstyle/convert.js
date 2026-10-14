/**
 * convert.js — la conversión completa: fotograma → profundidad → gris → MP4.
 */

import { MUXER_URL, OUT_LONG_SIDE, KEYFRAME_EVERY_S, MAX_QUEUE, TARGET_PROCESSING_S, MAX_KEY_GAP_S } from './config.js';
import { chooseStride } from './pacing.js';
import { detectFps } from './fps.js';
import { checkSupport, loadDepthModel } from './model.js';
import { normalizeDepth, paintDepth } from './look.js';
import { even, multipleOf14, abortError, seek, openVideo, pickCodec } from './video.js';

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
 * @param {(e: {phase: 'model'|'prepare'|'frames'|'finish', fraction: number|null, frame?: number,
 *             total?: number, stride?: number, fps?: number, secondsPerFrame?: number, etaSeconds?: number,
 *             profile?: string}) => void} [o.onProgress]
 * @param {{estimate: Function, profile: object}} [o.depth]  estimador ya cargado (para pruebas)
 * @param {number}   [o.fps]            fps de salida (por defecto se miden en el video original)
 * @param {number}   [o.targetSeconds]  tiempo de cálculo que se intenta no superar (ver config.js)
 */
export async function convertToDepthStyle({ url, start, end, signal, onProgress = () => {}, depth, targetSeconds = TARGET_PROCESSING_S, fps: fpsOverride }) {
  const check = checkSupport();
  if (!check.ok) throw new Error(check.reason);
  if (signal?.aborted) throw abortError();

  const model = depth ?? await loadDepthModel(onProgress, signal);
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

    // La salida va a los mismos fps que el video original (con tope); se mide en el propio video
    const fps = fpsOverride ?? await detectFps(video, start, end);
    const maxStride = Math.max(1, Math.round(fps * MAX_KEY_GAP_S));
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

    // Fotograma a fotograma. La profundidad se calcula solo en los fotogramas «clave» (cada `stride`)
    // y los de en medio se interpolan: con un dispositivo rápido stride = 1 (se calculan todos).
    const range = { lo: null, hi: null };
    const prev = new Float32Array(dW * dH).fill(-1);
    const blend = new Float32Array(dW * dH);
    const keyEvery = Math.max(1, Math.round(KEYFRAME_EVERY_S * fps));
    const last = total - 1;
    let stride = 1;
    let secondsPerKey = 0;           // media reciente de lo que tarda un fotograma clave
    let estimates = 0;
    let A = null; let aIdx = -1;     // clave anterior
    let B = null; let bIdx = -1;     // clave siguiente

    const depthAt = async (idx) => {
      const t = Math.min(start + idx / fps, Math.max(start, end - 0.001));
      await seek(video, t);
      inCtx.drawImage(video, 0, 0, dW, dH);
      const rgba = inCtx.getImageData(0, 0, dW, dH).data;
      const s0 = performance.now();
      const raw = await model.estimate(rgba, dW, dH, signal);
      const sec = (performance.now() - s0) / 1000;
      estimates++;
      if (estimates >= 2) {          // el primero incluye la compilación del modelo: no cuenta
        secondsPerKey = secondsPerKey ? secondsPerKey * 0.6 + sec * 0.4 : sec;
        stride = chooseStride({ secondsPerKey, total, targetSeconds, maxStride });
      }
      return normalizeDepth(raw, range);
    };

    // El primer fotograma tarda más (el dispositivo compila el modelo): se avisa antes de empezar
    onProgress({ phase: 'frames', fraction: 0, frame: 0, total, stride, fps, profile: profile.name });

    for (let i = 0; i < total; i++) {
      if (signal?.aborted) throw abortError();
      if (encoderError) throw encoderError;

      while (bIdx < i) {
        A = B; aIdx = bIdx;
        const next = bIdx < 0 ? 0 : Math.min(bIdx + stride, last);
        B = await depthAt(next);
        bIdx = next;
      }
      let norm = B;
      if (A && bIdx > aIdx) {
        const w = (i - aIdx) / (bIdx - aIdx);
        for (let k = 0; k < blend.length; k++) blend[k] = A[k] + (B[k] - A[k]) * w;
        norm = blend;
      }

      paintDepth(norm, prev, gray.data);
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
      onProgress({
        phase: 'frames',
        fraction: done / total,
        frame: done,
        total,
        stride,
        fps,
        secondsPerFrame: secondsPerKey || undefined,     // por fotograma calculado
        etaSeconds: estimates >= 3 ? Math.ceil((total - done) / stride) * secondsPerKey : undefined,
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
