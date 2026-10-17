/**
 * motion.js — ¿hay que reducir el movimiento?
 *
 * Dos orígenes, que se suman:
 *  - El sistema (`prefers-reduced-motion: reduce`): lo decide el teléfono y la app no lo puede cambiar.
 *  - El interruptor «Reducir animaciones» de Ajustes (`KEYS.reduceMotion`).
 *
 * Con el interruptor activo, <html> lleva la clase `reduce-motion`: motion.css la usa para quitar
 * todas las transiciones y animaciones (ver el último bloque de ese archivo). El código que decide
 * cosas con JavaScript (pausar el video del carrusel, no animar la intro…) pregunta aquí en vez de
 * usar matchMedia directamente, para que los dos orígenes cuenten igual.
 */

import { storage, KEYS } from './storage.js';

const query = window.matchMedia('(prefers-reduced-motion: reduce)');
const listeners = new Set();
let forced = storage.get(KEYS.reduceMotion) === '1';

const apply = () => document.documentElement.classList.toggle('reduce-motion', forced);
const notify = () => { for (const fn of listeners) fn(motion.reduced()); };

query.addEventListener('change', notify);
apply();   // se aplica al importar el módulo: antes de que se pinte nada y antes de la intro

export const motion = {
  /** true si hay que reducir el movimiento (sistema o interruptor). */
  reduced: () => forced || query.matches,
  /** true si es el propio sistema quien lo pide (en ese caso el interruptor no puede quitarlo). */
  system: () => query.matches,
  /** Estado del interruptor de la app. */
  forced: () => forced,

  setForced(on) {
    forced = Boolean(on);
    if (forced) storage.set(KEYS.reduceMotion, '1');
    else storage.remove(KEYS.reduceMotion);
    apply();
    notify();
  },

  /** Avisa cuando cambia `reduced()`. Devuelve la función para dejar de escuchar. */
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
