/**
 * pacing.js — cada cuántos fotogramas se calcula la profundidad (funciones puras).
 *
 * La salida es solo el mapa de profundidad, que cambia despacio entre fotogramas. Si el dispositivo
 * es lento, se calcula 1 de cada `stride` fotogramas y los de en medio se interpolan.
 * Con un dispositivo rápido (GPU) el resultado es 1: se calculan todos.
 */

/**
 * @param {number} secondsPerKey  lo que tarda calcular un fotograma (media reciente)
 * @param {number} total          fotogramas de salida
 * @param {number} targetSeconds  tiempo que se quiere no superar
 * @param {number} maxStride      límite (más allá se notaría demasiado la interpolación)
 */
export function chooseStride({ secondsPerKey, total, targetSeconds, maxStride }) {
  if (!(secondsPerKey > 0) || !(total > 0)) return 1;
  return Math.min(maxStride, Math.max(1, Math.ceil((secondsPerKey * total) / targetSeconds)));
}
