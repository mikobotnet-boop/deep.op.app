/**
 * audio.js — el sonido del video original, recodificado a AAC-LC estéreo a 48 kHz.
 *
 * El navegador decodifica el sonido del archivo entero (`decodeAudioData`, que además lo pasa a 48 kHz) y
 * WebCodecs lo codifica en trozos de 1 s. Es «lo mejor posible»: si algo falla, el video sale sin sonido y
 * el motivo se devuelve para decírselo a la persona (nunca se oculta).
 *
 *  - `unsupported`: este navegador no tiene AudioEncoder o no sabe codificar AAC.
 *  - `too-big`: el archivo supera MAX_AUDIO_FILE_BYTES (se lee entero en memoria).
 *  - `none`: el video no tiene sonido o el navegador no pudo decodificarlo.
 *  - `failed`: el codificador de audio falló.
 *
 * Los trozos codificados se devuelven en memoria (son pocos KB por segundo); encode.js los reparte entre los
 * fotogramas para que el MP4 quede intercalado por tiempo.
 */

import { abortError } from '../depthstyle/video.js';
import { AUDIO, AUDIO_CHUNK_FRAMES, MAX_AUDIO_FILE_BYTES } from './config.js';

/**
 * @param {File} file
 * @param {number} duration  segundos de video: el sonido se recorta a esa duración
 * @param {AbortSignal} [signal]
 * @returns {Promise<{chunks: Array<{chunk: EncodedAudioChunk, meta: object}>|null, reason: string|null}>}
 */
export async function encodeAudioTrack(file, duration, signal) {
  if (typeof AudioEncoder === 'undefined' || typeof AudioData === 'undefined' || typeof OfflineAudioContext === 'undefined') {
    return { chunks: null, reason: 'unsupported' };
  }
  if (file.size > MAX_AUDIO_FILE_BYTES) return { chunks: null, reason: 'too-big' };

  let supported = false;
  try { ({ supported } = await AudioEncoder.isConfigSupported(AUDIO)); } catch { /* se trata como no soportado */ }
  if (!supported) return { chunks: null, reason: 'unsupported' };

  let decoded;
  try {
    const bytes = await file.arrayBuffer();
    decoded = await new OfflineAudioContext(2, AUDIO.sampleRate, AUDIO.sampleRate).decodeAudioData(bytes);
  } catch {
    return { chunks: null, reason: 'none' };
  }
  if (signal?.aborted) throw abortError();

  const frames = Math.min(decoded.length, Math.round(duration * AUDIO.sampleRate));
  if (frames <= 0) return { chunks: null, reason: 'none' };
  const left = decoded.getChannelData(0);
  const right = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : left;   // mono → los dos lados iguales

  const chunks = [];
  let encoderError = null;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => chunks.push({ chunk, meta }),
    error: (e) => { encoderError = e; },
  });

  try {
    encoder.configure(AUDIO);
    for (let offset = 0; offset < frames && !encoderError; offset += AUDIO_CHUNK_FRAMES) {
      if (signal?.aborted) throw abortError();
      const n = Math.min(AUDIO_CHUNK_FRAMES, frames - offset);
      const planar = new Float32Array(n * 2);          // formato «planar»: primero todo el canal izquierdo, luego el derecho
      planar.set(left.subarray(offset, offset + n), 0);
      planar.set(right.subarray(offset, offset + n), n);
      const data = new AudioData({
        format: 'f32-planar',
        sampleRate: AUDIO.sampleRate,
        numberOfFrames: n,
        numberOfChannels: 2,
        timestamp: Math.round((offset * 1e6) / AUDIO.sampleRate),
        data: planar,
      });
      encoder.encode(data);
      data.close();
    }
    if (!encoderError) await encoder.flush();
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    return { chunks: null, reason: 'failed' };
  } finally {
    if (encoder.state !== 'closed') { try { encoder.close(); } catch { /* ya cerrado */ } }
  }

  if (encoderError || chunks.length === 0) return { chunks: null, reason: 'failed' };
  return { chunks, reason: null };
}

/** Frase para la persona: por qué el video salió sin sonido. */
export function audioReasonText(reason) {
  switch (reason) {
    case 'unsupported': return 'este navegador no puede codificar audio AAC';
    case 'too-big': return 'el archivo es demasiado grande para leer su sonido';
    case 'none': return 'el video no tiene sonido o no se pudo leer';
    default: return 'falló la codificación del sonido';
  }
}
