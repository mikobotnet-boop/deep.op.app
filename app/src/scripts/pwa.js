/**
 * pwa.js — registro del service worker (necesario para instalar la app y usarla sin conexión).
 *
 * El service worker está en la raíz de la app (sw.js). La ruta se calcula desde este
 * módulo, no desde la URL de la página, para que funcione igual en /app/, en /app/index.html
 * o si la app se mueve a la raíz del sitio.
 */

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;   // navegador antiguo o contexto no seguro (se necesita https o localhost)

  const swUrl = new URL('../../sw.js', import.meta.url).href;
  const register = () => navigator.serviceWorker.register(swUrl)
    .catch((err) => console.warn('[sw] no se pudo registrar:', err));

  // Se espera a `load` para que el registro no compita con la carga inicial de la interfaz.
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
