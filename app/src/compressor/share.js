/**
 * share.js — compartir el video con el menú de compartir del sistema (TikTok aparece ahí si está instalada).
 *
 * Deep Op no puede abrir TikTok directamente: el navegador solo ofrece el menú de compartir del sistema.
 * `navigator.share` exige un toque de la persona justo antes, así que se llama desde un botón propio y no
 * al terminar la compresión (que puede tardar minutos y el permiso del toque ya habría caducado).
 */

export function fileFromBlob(blob, name) {
  return new File([blob], name, { type: 'video/mp4' });
}

/** ¿Este navegador puede compartir este archivo? */
export function canShareFile(file) {
  try {
    return typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** Abre el menú de compartir. Devuelve 'shared' o 'cancelled' (la persona lo cerró); cualquier otro fallo se lanza. */
export async function shareFile(file) {
  try {
    await navigator.share({ files: [file], title: 'Video para TikTok' });
    return 'shared';
  } catch (err) {
    if (err?.name === 'AbortError') return 'cancelled';
    throw err;
  }
}
