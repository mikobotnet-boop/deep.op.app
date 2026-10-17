/**
 * theme.js — tema de la app: Oscuro, Claro o Sistema.
 *
 * La preferencia (`KEYS.theme`) es 'dark' | 'light' | 'system'; sin valor, 'dark' (la app nació oscura).
 * Lo que se pinta es siempre 'dark' o 'light': se escribe en <html data-theme="…"> y tokens.css hace
 * el resto. Con «Sistema» se sigue al teléfono y se reacciona si cambia con la app abierta.
 *
 * El primer pintado lo resuelve un script mínimo dentro de index.html (si no, la app parpadearía en
 * oscuro antes de que este módulo cargue). Debe usar las mismas reglas que `resolve()` de aquí.
 */

import { storage, KEYS } from './storage.js';

const CHOICES = ['dark', 'light', 'system'];
const SYSTEM_LIGHT = window.matchMedia('(prefers-color-scheme: light)');
/** Color de la barra del navegador / ventana instalada: el del marco exterior de cada tema. */
const BAR_COLOR = { dark: '#000000', light: '#e8e8ee' };

const listeners = new Set();

const read = () => {
  const value = storage.get(KEYS.theme);
  return CHOICES.includes(value) ? value : 'dark';
};
let choice = read();

const resolve = () => (choice === 'system' ? (SYSTEM_LIGHT.matches ? 'light' : 'dark') : choice);

function apply() {
  const shown = resolve();
  const root = document.documentElement;
  root.setAttribute('data-theme', shown);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR_COLOR[shown]);
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', shown);
  for (const fn of listeners) fn(shown);
}

SYSTEM_LIGHT.addEventListener('change', () => { if (choice === 'system') apply(); });
apply();

export const theme = {
  /** La elección del usuario: 'dark' | 'light' | 'system'. */
  choice: () => choice,
  /** Lo que se ve ahora: 'dark' | 'light'. */
  shown: resolve,

  set(value) {
    if (!CHOICES.includes(value)) return;
    choice = value;
    if (value === 'dark') storage.remove(KEYS.theme);   // el valor por defecto no se guarda
    else storage.set(KEYS.theme, value);
    apply();
  },

  /** Avisa cuando cambia lo que se ve. Devuelve la función para dejar de escuchar. */
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
