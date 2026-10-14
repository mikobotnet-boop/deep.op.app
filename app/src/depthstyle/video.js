/**
 * video.js — utilidades de video: abrir, buscar un fotograma, elegir códec, tamaños.
 */

import { SEEK_TIMEOUT_MS, CODECS } from './config.js';

export const even = (n) => Math.max(2, Math.round(n / 2) * 2);
export const multipleOf14 = (n) => Math.max(14, Math.round(n / 14) * 14);

export function abortError() {
  return new DOMException('Conversión cancelada.', 'AbortError');
}

export function seek(video, time) {
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

export function openVideo(url) {
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


export async function pickCodec(width, height, bitrate, framerate) {
  for (const codec of CODECS) {
    const cfg = { codec, width, height, bitrate, framerate };
    try {
      const { supported } = await VideoEncoder.isConfigSupported(cfg);
      if (supported) return cfg;
    } catch { /* se prueba el siguiente */ }
  }
  throw new Error('Este dispositivo no puede codificar video H.264.');
}
