/**
 * main.js — punto de entrada. Solo orquesta: cada módulo hace una cosa.
 */

import { initMenu } from './menu.js';

const root = document.documentElement;

initMenu({
  app: document.getElementById('app'),
  rail: document.getElementById('side'),
  drawer: document.getElementById('drawer'),
  handle: document.getElementById('handle'),
});

/*
 * Fin del arranque. `preload` (en <html>) desactiva las transiciones y oculta la app
 * mientras se aplica el estado inicial. Se retira tras dos fotogramas: así el navegador
 * calcula una vez el estilo final con transiciones desactivadas y no anima el estado
 * restaurado. A partir de aquí, cada cambio de estado se anima con normalidad.
 */
requestAnimationFrame(() => {
  requestAnimationFrame(() => root.classList.remove('preload'));
});
