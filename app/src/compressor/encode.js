/**
 * encode.js — la compresión completa: fotograma → 1080×1920 → H.264 → MP4 (con el sonido en AAC).
 *
 * Fotograma a fotograma, a fps constantes: para cada instante i/fps se busca el fotograma del original que
 * corresponde (si el original tiene fps variable, queda normalizado; si hay menos fotogramas de los que
 * piden los fps, se repite el anterior, nunca se inventa movimiento). Ver analyze.js para los fps.
 *
 * La codificación usa el codificador H.264 del dispositivo (WebCodecs, normalmente por hardware) y el MP4 se
 * arma en memoria con mp4-muxer (la misma librería que DepthStyle).
 */

import { MUXER_URL } from '../depthstyle/config.js';
import { abortError, seek, openVideo } from '../depthstyle/video.js';
import {
  OUT_W, OUT_H, BITRATE_PER_PIXEL, MIN_BITRATE, MAX_BITRATE, MAX_OUTPUT_MB,
  KEYFRAME_EVERY_S, MAX_QUEUE, CODECS, AUDIO, DEFAULT_LAYOUT,
} from './config.js';
import { CompressorError } from './errors.js';
import { createFrameDrawer } from './frames.js';
import { encodeAudioTrack } from './audio.js';

export function checkSupport() {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    return { ok: false, reason: 'Este navegador no puede codificar video (falta WebCodecs). Abre Deep Op en Chrome.' };
  }
  return { ok: true };
}

/** Bitrate alto según el tamaño y los fps, sin que el MP4 final pase de MAX_OUTPUT_MB (se arma en memoria). */
export function pickBitrate({ fps, duration }) {
  const byQuality = OUT_W * OUT_H * fps * BITRATE_PER_PIXEL;
  const bySize = (MAX_OUTPUT_MB * 8e6) / Math.max(1, duration);
  return Math.round(Math.min(MAX_BITRATE, Math.max(MIN_BITRATE, Math.min(byQuality, bySize))));
}

async function pickCodec(bitrate, framerate) {
  for (const codec of CODECS) {
    const cfg = { codec, width: OUT_W, height: OUT_H, bitrate, framerate };
    try {
      const { supported } = await VideoEncoder.isConfigSupported(cfg);
      if (supported) return cfg;
    } catch { /* se prueba el siguiente */ }
  }
  throw new CompressorError(`Este dispositivo no puede codificar video H.264 a ${OUT_W}×${OUT_H}.`);
}

/**
 * Prepara el video para TikTok y devuelve un MP4.
 *
 * @param {object}   o
 * @param {string}   o.url      object URL del archivo
 * @param {File}     o.file     el mismo archivo (para leer su sonido)
 * @param {{width: number, height: number, duration: number, fps: number}} o.info  resultado de analyzeVideo
 * @param {'blur'|'crop'} [o.layout]
 * @param {AbortSignal} [o.signal]
 * @param {(e: {phase: 'audio'|'frames'|'finish', fraction: number|null, frame?: number, total?: number,
 *             etaSeconds?: number}) => void} [o.onProgress]
 * @returns {Promise<{blob: Blob, info: {width: number, height: number, fps: number, bitrate: number,
 *           bytes: number, codec: string, mode: string, audio: string|null, audioReason: string|null}}>}
 */
export async function compressForTikTok({ url, file, info, layout = DEFAULT_LAYOUT, signal, onProgress = () => {} }) {
  const check = checkSupport();
  if (!check.ok) throw new CompressorError(check.reason);
  if (signal?.aborted) throw abortError();

  const { duration, fps } = info;
  const total = Math.max(1, Math.round(duration * fps));
  const bitrate = pickBitrate({ fps, duration });
  const config = await pickCodec(bitrate, fps);

  // El sonido va primero: es corto de codificar y el MP4 necesita saber desde el principio si lleva audio
  onProgress({ phase: 'audio', fraction: null });
  const audio = await encodeAudioTrack(file, duration, signal);
  if (signal?.aborted) throw abortError();
  const audioChunks = audio.chunks ?? [];

  const video = await openVideo(url);
  let encoder = null;
  try {
    const drawer = createFrameDrawer({ srcW: video.videoWidth, srcH: video.videoHeight, layout });

    const { Muxer, ArrayBufferTarget } = await import(MUXER_URL);
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      video: { codec: 'avc', width: OUT_W, height: OUT_H, frameRate: fps },
      ...(audio.chunks ? { audio: { codec: 'aac', numberOfChannels: AUDIO.numberOfChannels, sampleRate: AUDIO.sampleRate } } : {}),
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset',
    });
    let encoderError = null;
    encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => { encoderError = e; },
    });
    encoder.configure(config);

    // El sonido se reparte entre los fotogramas según su marca de tiempo (MP4 intercalado)
    let nextAudio = 0;
    const flushAudio = (upToUs) => {
      while (nextAudio < audioChunks.length && audioChunks[nextAudio].chunk.timestamp <= upToUs) {
        muxer.addAudioChunk(audioChunks[nextAudio].chunk, audioChunks[nextAudio].meta);
        nextAudio++;
      }
    };

    const keyEvery = Math.max(1, Math.round(KEYFRAME_EVERY_S * fps));
    const frameDuration = Math.round(1e6 / fps);
    const started = performance.now();
    onProgress({ phase: 'frames', fraction: 0, frame: 0, total });

    for (let i = 0; i < total; i++) {
      if (signal?.aborted) throw abortError();
      if (encoderError) throw encoderError;

      await seek(video, Math.min(i / fps, Math.max(0, duration - 0.001)));
      drawer.draw(video);

      const timestamp = Math.round((i * 1e6) / fps);
      const frame = new VideoFrame(drawer.canvas, { timestamp, duration: frameDuration });
      encoder.encode(frame, { keyFrame: i % keyEvery === 0 });
      frame.close();
      flushAudio(timestamp);

      // Si el codificador va por detrás, se espera para no llenar la memoria
      while (encoder.encodeQueueSize > MAX_QUEUE) {
        if (signal?.aborted) throw abortError();
        await new Promise((r) => setTimeout(r, 10));
      }

      const done = i + 1;
      const elapsed = (performance.now() - started) / 1000;
      onProgress({
        phase: 'frames',
        fraction: done / total,
        frame: done,
        total,
        etaSeconds: done >= 5 ? (elapsed / done) * (total - done) : undefined,
      });
    }

    flushAudio(Infinity);
    onProgress({ phase: 'finish', fraction: 1 });
    await encoder.flush();
    if (encoderError) throw encoderError;
    muxer.finalize();

    const blob = new Blob([target.buffer], { type: 'video/mp4' });
    return {
      blob,
      info: {
        width: OUT_W,
        height: OUT_H,
        fps,
        bitrate,
        bytes: blob.size,
        codec: config.codec,
        mode: drawer.mode,
        audio: audio.chunks ? 'aac' : null,
        audioReason: audio.reason,
      },
    };
  } finally {
    if (encoder && encoder.state !== 'closed') { try { encoder.close(); } catch { /* ya cerrado */ } }
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
}
