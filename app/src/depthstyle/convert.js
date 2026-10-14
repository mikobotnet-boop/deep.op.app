/**
 * convert.js — la conversión completa: fotograma → profundidad → gris → MP4.
 */

import { MUXER_URL, OUT_LONG_SIDE, KEYFRAME_EVERY_S, MAX_QUEUE } from './config.js';
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
