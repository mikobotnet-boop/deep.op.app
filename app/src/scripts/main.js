/**
 * main.js — punto de entrada. Solo orquesta: cada módulo hace una cosa.
 */

import { initMenu } from './menu.js';
import { initNav } from './nav.js';
import { initIntro } from './intro.js';
import { registerServiceWorker } from './pwa.js';

const root = document.documentElement;
const app = document.getElementById('app');

// Desactiva la red de seguridad de layout.css (que solo actúa si este script no llega a ejecutarse).
root.classList.add('js-ready');

initMenu({
  app,
  rail: document.getElementById('side'),
  drawer: document.getElementById('drawer'),
  handle: document.getElementById('handle'),
});

initNav({ app });

/*
 * Arranque. `preload` (en <html>) oculta la app y desactiva sus transiciones mientras se
 * aplica el estado inicial del menú y se ve la pantalla de inicio. La app está `inert` hasta
 * que entra: sin foco ni lectura de pantalla debajo de la intro.
 *
 * Al entrar (Continuar, sesión iniciada o fin de la animación con sesión) se quita `preload`
 * y la intro empieza a disolverse en el mismo instante: la entrada de la interfaz (dock que
 * sube, iconos en cascada) ocurre mientras el fondo se desvanece, sin corte entre pantallas.
 * El estado del menú ya se aplicó hace rato, así que no se anima nada restaurado.
 */
app.inert = true;

function showApp() {
  app.inert = false;
  root.classList.remove('preload');
}

try {
  initIntro({ onEnter: showApp });
} catch (err) {
  // Si la intro fallara, la app no puede quedar oculta.
  console.warn('[intro] no se pudo iniciar:', err);
  document.getElementById('intro')?.remove();
  showApp();
}

// Instalación como app y modo sin conexión.
registerServiceWorker();
