/**
 * screens.js — qué pantalla se ve dentro del panel: Inicio, Overlays (catálogo), Compresor o Ajustes.
 *
 * Todas viven en `.stage` y se alternan con `hidden`. Antes cada pantalla ocultaba a la otra a
 * mano; con varias, un único punto decide cuál se ve y avisa del cambio (`onChange`) para que cada
 * módulo haga lo suyo (el catálogo cancela sus descargas al salir, Ajustes mide el almacenamiento
 * al entrar, el menú marca el ítem activo).
 *
 * No sabe nada del contenido de las pantallas: solo muestra una y oculta las demás.
 */

export function initScreens({ app }) {
  const screens = {
    home: app.querySelector('#home'),
    catalog: app.querySelector('#catalog'),
    compressor: app.querySelector('#compressor'),
    depthstyle: app.querySelector('#depthstyle'),
    settings: app.querySelector('#settings'),
  };
  const listeners = new Set();
  let current = 'home';
  let previous = null;

  return {
    current: () => current,
    /** Pantalla desde la que se llegó a la actual (para el botón Volver). */
    previous: () => previous,

    /** Muestra una pantalla. Devuelve false si ya estaba a la vista o no existe. */
    show(name) {
      if (name === current || !screens[name]) return false;
      previous = current;
      current = name;
      for (const [key, el] of Object.entries(screens)) if (el) el.hidden = key !== name;
      for (const fn of listeners) fn(name, previous);
      return true;
    },

    /** `fn(nueva, anterior)` se llama después de cada cambio. Devuelve la función para dejar de escuchar. */
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
