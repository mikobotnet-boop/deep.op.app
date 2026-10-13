/**
 * menu.js — abrir y cerrar el menú (drawer).
 *
 * Responsabilidades:
 *  - Estado abierto/cerrado (clase `open` en .app) y atributos ARIA.
 *  - Recordar la preferencia en escritorio; en móvil el menú arranca siempre cerrado.
 *  - Indicar a CSS cuándo hay una animación en curso (`is-animating`) para que
 *    `will-change` solo exista mientras se anima.
 *
 * No contiene valores de animación: tiempos y curvas viven en tokens.css / motion.css.
 */

import { storage, KEYS } from './storage.js';

/** Debe coincidir con el breakpoint de rail.css. */
const MOBILE_QUERY = '(max-width: 760px)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Si `transitionend` no llega (p. ej. pestaña en segundo plano), se limpia igualmente. */
const ANIMATION_FALLBACK_MS = 700;

/**
 * Numera los elementos de un contenedor en la variable CSS `--i`.
 * motion.css la usa para escalonar las entradas (retardo = --i × --stagger).
 */
function indexForStagger(container, selector) {
  container.querySelectorAll(selector).forEach((el, i) => el.style.setProperty('--i', i));
}

export function initMenu({ app, drawer, handle, rail }) {
  const mobile = window.matchMedia(MOBILE_QUERY);
  const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY);
  let animationTimer = 0;

  indexForStagger(drawer, '.brand .name, .label, .item');
  indexForStagger(rail, '.brand, .item');

  const isOpen = () => app.classList.contains('open');

  /* ---------- Hover del tirador ----------
     El tirador se mueve con transform, y el navegador no recalcula :hover cuando un
     elemento se aleja de un cursor quieto: se quedaba resaltado hasta mover el ratón.
     Por eso el resaltado es la clase `is-hot`, y al terminar el movimiento se comprueba
     con elementFromPoint (que siempre es fiable) si el cursor sigue encima. */
  let pointer = null;
  const isMouse = (e) => e.pointerType === 'mouse' || e.pointerType === 'pen';

  document.addEventListener('pointermove', (e) => { pointer = { x: e.clientX, y: e.clientY }; }, { passive: true });
  handle.addEventListener('pointerenter', (e) => { if (isMouse(e)) handle.classList.add('is-hot'); });
  handle.addEventListener('pointerleave', () => handle.classList.remove('is-hot'));

  function syncHandleHover() {
    if (!pointer) return;
    handle.classList.toggle('is-hot', document.elementFromPoint(pointer.x, pointer.y) === handle);
  }

  /* ---------- will-change solo durante la animación ---------- */
  function endAnimating() {
    clearTimeout(animationTimer);
    app.classList.remove('is-animating');
    syncHandleHover();
  }

  function startAnimating() {
    if (reducedMotion.matches) return;
    app.classList.add('is-animating');
    clearTimeout(animationTimer);
    animationTimer = setTimeout(endAnimating, ANIMATION_FALLBACK_MS);
  }

  drawer.addEventListener('transitionend', (e) => {
    if (e.target === drawer && e.propertyName === 'transform') endAnimating();
  });

  /* ---------- Estado ---------- */
  function setOpen(open, { animate = true, persist = false } = {}) {
    if (open === isOpen()) return;

    if (animate) startAnimating();

    // Si el foco está dentro del drawer que se va a cerrar, se devuelve al tirador
    // (un elemento `inert` pierde el foco y el teclado quedaría "en ninguna parte").
    if (!open && drawer.contains(document.activeElement)) handle.focus();

    app.classList.toggle('open', open);
    drawer.inert = !open;
    handle.setAttribute('aria-expanded', String(open));
    handle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');

    if (persist && !mobile.matches) storage.set(KEYS.menuClosed, open ? '0' : '1');

    // Sin animación (movimiento reducido) no habrá `transitionend`: se sincroniza ya.
    if (animate && reducedMotion.matches) syncHandleHover();
  }

  /* ---------- Estado inicial (sin animar) ---------- */
  const startClosed = mobile.matches || storage.get(KEYS.menuClosed) === '1';
  setOpen(!startClosed, { animate: false });

  /* ---------- Eventos ---------- */
  handle.addEventListener('click', () => setOpen(!isOpen(), { persist: true }));

  // En móvil el drawer funciona como superposición: Escape lo cierra.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mobile.matches && isOpen()) {
      setOpen(false);
      handle.focus();
    }
  });

  // Al pasar a pantalla pequeña (rotar el dispositivo, redimensionar) se cierra, sin guardar.
  mobile.addEventListener('change', (e) => {
    if (e.matches) setOpen(false);
  });

  return { open: () => setOpen(true, { persist: true }), close: () => setOpen(false, { persist: true }), isOpen };
}
