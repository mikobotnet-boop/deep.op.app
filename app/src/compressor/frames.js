/**
 * frames.js — dibuja cada fotograma del video original en el lienzo de salida 1080×1920 (9:16).
 *
 * Encuadres:
 *  - `crop`: el video llena el cuadro y se recorta lo que sobra.
 *  - `blur`: el video entero, centrado, sobre su propia imagen desenfocada y oscurecida.
 *
 * El desenfoque no usa `ctx.filter` (muy lento en un teléfono, un fotograma tras otro): el fondo se dibuja
 * en un lienzo 12 veces más pequeño y se estira al tamaño final, que suaviza igual y cuesta casi nada.
 *
 * Un video que ya es 9:16 se dibuja a cuadro completo en cualquier encuadre (no hay nada que desenfocar).
 */

import { OUT_W, OUT_H, NEAR_VERTICAL, BLUR_DIVISOR, BLUR_SCRIM } from './config.js';

/** Rectángulo de destino (en píxeles enteros) para llenar (`cover`) o contener (`contain`) un origen sw×sh en dw×dh. */
function fit(sw, sh, dw, dh, how) {
  const scale = how === 'cover' ? Math.max(dw / sw, dh / sh) : Math.min(dw / sw, dh / sh);
  const w = Math.round(sw * scale);
  const h = Math.round(sh * scale);
  return { x: Math.round((dw - w) / 2), y: Math.round((dh - h) / 2), w, h };
}

function smoothCanvas(width, height, options) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', options);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return { canvas, ctx };
}

/**
 * @param {{srcW: number, srcH: number, layout: 'blur'|'crop'}} o
 * @returns {{canvas: HTMLCanvasElement, mode: 'blur'|'cover', draw: (video: HTMLVideoElement) => void}}
 */
export function createFrameDrawer({ srcW, srcH, layout }) {
  const { canvas, ctx } = smoothCanvas(OUT_W, OUT_H, { alpha: false });

  const alreadyVertical = Math.abs(srcW / srcH / (OUT_W / OUT_H) - 1) < NEAR_VERTICAL;
  const mode = layout === 'blur' && !alreadyVertical ? 'blur' : 'cover';

  if (mode === 'cover') {
    const r = fit(srcW, srcH, OUT_W, OUT_H, 'cover');
    return { canvas, mode, draw: (video) => ctx.drawImage(video, r.x, r.y, r.w, r.h) };
  }

  const small = smoothCanvas(Math.round(OUT_W / BLUR_DIVISOR), Math.round(OUT_H / BLUR_DIVISOR));
  const bg = fit(srcW, srcH, small.canvas.width, small.canvas.height, 'cover');
  const fg = fit(srcW, srcH, OUT_W, OUT_H, 'contain');
  const scrim = `rgba(0, 0, 0, ${BLUR_SCRIM})`;

  return {
    canvas,
    mode,
    draw(video) {
      small.ctx.drawImage(video, bg.x, bg.y, bg.w, bg.h);
      ctx.drawImage(small.canvas, 0, 0, OUT_W, OUT_H);
      ctx.fillStyle = scrim;
      ctx.fillRect(0, 0, OUT_W, OUT_H);
      ctx.drawImage(video, fg.x, fg.y, fg.w, fg.h);
    },
  };
}
