/**
 * notify.js — aviso cuando termina una conversión («Avisarme al terminar» en Ajustes).
 *
 * Hace falta que se cumplan las tres cosas: el interruptor está activo, el navegador dio permiso y
 * la app no está a la vista (si la estás mirando, el propio panel ya te lo dice).
 *
 * Límite real: la notificación la envía la propia página. Si el sistema congela o cierra Deep Op en
 * segundo plano (algo habitual en móviles con poca memoria), la conversión se detiene y no hay aviso.
 * Por eso el texto del interruptor dice «solo llega si Deep Op sigue abierto en segundo plano».
 *
 * En Android, Chrome no permite `new Notification()`: se muestra a través del service worker.
 */

import { storage, KEYS } from './storage.js';

const supported = () => 'Notification' in window && 'serviceWorker' in navigator;
const permission = () => (supported() ? Notification.permission : 'denied');

export const notifications = {
  supported,

  /** 'granted' | 'denied' | 'default' (todavía no se ha preguntado). */
  permission,

  /** El interruptor está activo Y hay permiso. */
  enabled: () => storage.get(KEYS.notify) === '1' && permission() === 'granted',

  /** Debe llamarse desde un gesto del usuario (un toque). Devuelve true si queda activado. */
  async enable() {
    if (!supported()) return false;
    let result = permission();
    if (result === 'default') {
      try { result = await Notification.requestPermission(); } catch { result = 'denied'; }
    }
    if (result !== 'granted') return false;
    storage.set(KEYS.notify, '1');
    return true;
  },

  disable() {
    storage.remove(KEYS.notify);
  },

  /** Muestra el aviso si procede. Nunca lanza: un aviso que falla no debe romper la conversión. */
  async done(title, body) {
    if (!notifications.enabled() || !document.hidden) return;
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) return;
      await registration.showNotification(title, {
        body,
        icon: new URL('../icons/app/icon-192.png', import.meta.url).href,
        tag: 'deepop-done',   // un aviso nuevo sustituye al anterior, no se apilan
      });
    } catch (err) {
      console.warn('[notify] no se pudo avisar:', err);
    }
  },
};
