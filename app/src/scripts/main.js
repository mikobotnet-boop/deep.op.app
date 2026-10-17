/**
 * main.js — punto de entrada. Solo orquesta: cada módulo hace una cosa.
 */

import { initMenu } from './menu.js';
import { initNav } from './nav.js';
import { initScreens } from './screens.js';
import { initHome } from './home.js';
import { initCatalog } from './catalog.js';
import { initCompressor } from './compressor.js';
import { initSettings } from './settings.js';
import { initIntro } from './intro.js';
import { registerServiceWorker } from './pwa.js';

const root = document.documentElement;
const app = document.getElementById('app');

// Desactiva la red de seguridad de layout.css (que solo actúa si este script no llega a ejecutarse).
root.classList.add('js-ready');

const menu = initMenu({
  app,
  rail: document.getElementById('side'),
  drawer: document.getElementById('drawer'),
  handle: document.getElementById('handle'),
});

const nav = initNav({ app });

// Qué pantalla se ve (Inicio, Overlays, Compresor o Ajustes). Al cambiar, el menú marca su ítem como activo.
const screens = initScreens({ app });
const ITEM_OF = { home: 'Inicio', catalog: 'Overlays', compressor: 'Compresor', settings: 'Ajustes' };
screens.onChange((name) => nav.selectItem(ITEM_OF[name]));

// La página principal no es imprescindible para arrancar: si fallara, la app sigue funcionando.
try {
  initHome({ app });
} catch (err) {
  console.warn('[home] no se pudo iniciar:', err);
}

// El catálogo de overlays tampoco es imprescindible para arrancar.
try {
  initCatalog({ app, menu, nav, screens });
} catch (err) {
  console.warn('[catalog] no se pudo iniciar:', err);
}

// El Compresor tampoco es imprescindible para arrancar (su motor se carga solo al elegir un video).
try {
  initCompressor({ app, menu, screens });
} catch (err) {
  console.warn('[compressor] no se pudo iniciar:', err);
}

// Ajustes tampoco es imprescindible para arrancar.
try {
  initSettings({ app, menu, screens });
} catch (err) {
  console.warn('[settings] no se pudo iniciar:', err);
}

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
