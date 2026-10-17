/**
 * analyze.js — lee el video original y dice qué es: tamaño, duración y fotogramas por segundo.
 *
 * El navegador ya aplica la rotación del archivo: `videoWidth` / `videoHeight` son el tamaño con el que se
 * ve el video (un video grabado en vertical con el teléfono ya llega como 1080×1920, no girado).
 *
 * Los fps se miden reproduciendo un instante el video (depthstyle/fps.js). En un video de fps variable salen
 * los fps nominales (los intervalos más cortos): a ese ritmo se normaliza la salida, sin subirlos.
 */

import { detectFps } from '../depthstyle/fps.js';
import { openVideo } from '../depthstyle/video.js';
import { OUTPUT_FPS_MAX, MAX_SECONDS } from './config.js';
import { CompressorError } from './errors.js';

/**
 * @param {string} url  object URL del archivo elegido
 * @returns {Promise<{width: number, height: number, duration: number, fps: number}>}
 */
export async function analyzeVideo(url) {
  const video = await openVideo(url);
  try {
    const { videoWidth: width, videoHeight: height, duration } = video;
    if (!width || !height || !Number.isFinite(duration) || duration <= 0) {
      throw new CompressorError('No se pudo leer el tamaño o la duración del video.');
    }
    if (duration > MAX_SECONDS + 0.5) {
      throw new CompressorError(`El video dura ${Math.round(duration)} s y el Compresor admite hasta ${MAX_SECONDS} s.`);
    }
    const fps = await detectFps(video, 0, duration, OUTPUT_FPS_MAX);
    return { width, height, duration, fps };
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();      // suelta el archivo sin provocar un error de red
  }
}
