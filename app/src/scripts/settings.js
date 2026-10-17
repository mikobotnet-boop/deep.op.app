/**
 * settings.js — pantalla «Ajustes».
 *
 *  - Navegación: ocupa el lugar de la página principal (ver screens.js). Se abre con el ítem «Ajustes»
 *    del menú; «Volver» regresa a la pantalla anterior.
 *  - Cuenta: muestra el correo de la sesión local (session.js) y permite cerrarla. La sesión es solo
 *    una marca en este dispositivo: no hay servidor, así que «Eliminar cuenta» borra esa marca y todo
 *    lo que la app guardó aquí (no hay nada más que borrar).
 *  - Tema: Oscuro, Claro o Sistema (theme.js).
 *  - Interruptores: reducir animaciones (motion.js), usar la GPU (la lee depthstyle/model.js) y avisar
 *    al terminar (notify.js). Cada uno hace de verdad lo que dice.
 *  - Almacenamiento: lo que la app guarda en el navegador, medido al abrir la pantalla: el modelo de
 *    profundidad descargado, la copia de la app para usarla sin conexión y el resto.
 *  - Privacidad: resumen de qué se guarda y a dónde se conecta la app; borrar los datos locales.
 *
 * Todo el texto dinámico se inserta con textContent (nunca como HTML).
 */

import { storage, KEYS } from './storage.js';
import { session } from './session.js';
import { motion } from './motion.js';
import { theme } from './theme.js';
import { notifications } from './notify.js';
import { DEPTHSTYLE_VERSION } from '../depthstyle/version.js';

/** La misma que anuncia el carrusel de la página principal. */
const APP_VERSION = '1.0.1';

const MOBILE_QUERY = '(max-width: 760px)';   // debe coincidir con menu.js
const MODEL_CACHE = 'transformers-cache';    // donde transformers.js guarda el modelo descargado
const APP_CACHE_PREFIX = 'deepop-';          // copia de la app para usarla sin conexión (sw.js)
const OWN_KEY_PREFIXES = ['deepop-', 'depthstyle.'];
const TOAST_MS = 2400;

const nameOf = (item) => item.dataset.tip ?? item.dataset.x ?? null;

/** 1 234 567 → «1,2 MB». */
function formatBytes(bytes) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1).replace('.', ',')} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0).replace('.', ',')} MB`;
  if (bytes >= 1e3) return `${Math.round(bytes / 1e3)} KB`;
  return `${Math.round(bytes)} B`;
}

/** ¿El usuario permite la GPU y no se ha desactivado sola en esta versión de DepthStyle? */
const gpuAutoOff = () => storage.get(KEYS.gpuAuto) === DEPTHSTYLE_VERSION;
const gpuAllowed = () => storage.get(KEYS.gpu) !== '0' && !gpuAutoOff();

/**
 * Tamaño de una caché del navegador. `trustHeader`: para archivos grandes (el modelo) se usa la cabecera
 * Content-Length, para no leer decenas de MB en memoria solo por mirar el tamaño; si falta, se lee el cuerpo.
 */
async function cacheBytes(match, { trustHeader = false } = {}) {
  try {
    let total = 0;
    for (const name of await caches.keys()) {
      if (!match(name)) continue;
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        const response = await cache.match(request);
        if (!response) continue;
        const length = trustHeader ? Number(response.headers.get('content-length')) : 0;
        total += length > 0 ? length : (await response.blob()).size;
      }
    }
    return total;
  } catch {
    return 0;
  }
}

export function initSettings({ app, menu, screens }) {
  const root = app.querySelector('#settings');
  if (!root) return null;

  const $ = (id) => document.getElementById(id);
  const title = $('settingsTitle');
  const mobile = window.matchMedia(MOBILE_QUERY);

  // Entrada escalonada de los bloques (la regla está en motion.css)
  [...root.querySelector('.settings-inner').children].forEach((el, i) => el.style.setProperty('--i', i));

  /* =========================================================
     Navegación
     ========================================================= */

  function showSettings() {
    if (mobile.matches && menu.isOpen()) menu.close();   // en el móvil el menú se superpone: se aparta
    screens.show('settings');
  }

  app.addEventListener('click', (e) => {
    const item = e.target.closest('.item');
    if (item && nameOf(item) === 'Ajustes') showSettings();
  });

  $('settingsBack').addEventListener('click', () => screens.show(screens.previous() ?? 'home'));

  screens.onChange((name) => {
    if (name !== 'settings') return;
    root.scrollTop = 0;
    title.focus({ preventScroll: true });
    renderAccount();
    renderTheme();
    renderSwitches();
    drawStorage();
  });

  /* =========================================================
     Aviso breve
     ========================================================= */

  const toastEl = $('toast');
  let toastTimer = 0;
  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), TOAST_MS);
  }

  /* =========================================================
     Cuenta
     ========================================================= */

  const avatar = $('meAvatar');
  const initial = $('meInitial');
  const avatarIcon = $('meIcon');
  const meName = $('meName');
  const meDetail = $('meDetail');
  const meAction = $('meAction');
  const deleteGroup = $('deleteGroup');

  function renderAccount() {
    const user = session.user();
    avatar.classList.toggle('is-empty', !user);
    initial.hidden = !user;
    avatarIcon.toggleAttribute('hidden', Boolean(user));   // un <svg> no tiene la propiedad `hidden`: se usa el atributo
    deleteGroup.hidden = !user;
    if (user) {
      initial.textContent = user.email.charAt(0).toUpperCase();
      meName.textContent = 'Tu cuenta';
      meDetail.textContent = user.email;
      meAction.textContent = 'Cerrar sesión';
    } else {
      meName.textContent = 'Sin cuenta';
      meDetail.textContent = 'Estás usando Deep Op sin iniciar sesión.';
      meAction.textContent = 'Iniciar sesión';
    }
  }

  // Cerrar sesión (o iniciarla) vuelve a la pantalla de inicio recargando la app: allí están los botones de acceso.
  meAction.addEventListener('click', () => {
    if (session.isSignedIn()) session.signOut();
    location.reload();
  });

  /* =========================================================
     Tema
     ========================================================= */

  const themeSeg = $('themeSeg');
  const themeButtons = [...themeSeg.querySelectorAll('button')];
  const THEME_HINT = {
    dark: 'Fondo oscuro.',
    light: 'Fondo claro.',
    system: 'Sigue la configuración del teléfono.',
  };

  function renderTheme() {
    const current = theme.choice();
    for (const b of themeButtons) {
      const on = b.dataset.v === current;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;          // un solo tope de tabulación; las flechas mueven la elección
    }
    $('hintTheme').textContent = THEME_HINT[current];
  }

  function pickTheme(value) {
    theme.set(value);
    renderTheme();
  }

  for (const b of themeButtons) b.addEventListener('click', () => pickTheme(b.dataset.v));
  themeSeg.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = themeButtons[(themeButtons.indexOf(document.activeElement) + step + themeButtons.length) % themeButtons.length];
    pickTheme(next.dataset.v);
    next.focus();
  });

  /* =========================================================
     Interruptores
     ========================================================= */

  const swMotion = $('swMotion');
  const swGpu = $('swGpu');
  const swNotify = $('swNotify');
  const hintMotion = $('hintMotion');
  const hintGpu = $('hintGpu');
  const hintNotify = $('hintNotify');

  const HINT = {
    motion: 'Menos movimiento en menús y paneles.',
    motionSystem: 'Tu teléfono ya tiene activada la reducción de movimiento.',
    gpu: 'Convierte más rápido si el teléfono la admite.',
    gpuAuto: 'Se desactivó sola porque la GPU no respondió. Actívala para volver a probar.',
    gpuMissing: 'Este navegador no admite la GPU para esto: se usa el procesador.',
    notify: 'Solo llega si Deep Op sigue abierto en segundo plano.',
    notifyBlocked: 'Los avisos están bloqueados en el navegador. Permítelos desde los ajustes del sitio.',
    notifyMissing: 'Este navegador no admite avisos.',
  };

  function setSwitch(el, hint, { on, disabled = false, text }) {
    el.setAttribute('aria-checked', String(on));
    el.disabled = disabled;
    hint.textContent = text;
  }

  function renderSwitches() {
    setSwitch(swMotion, hintMotion, {
      on: motion.reduced(),
      disabled: motion.system(),       // si lo pide el sistema, la app no puede quitarlo
      text: motion.system() ? HINT.motionSystem : HINT.motion,
    });

    const hasGpu = 'gpu' in navigator;
    setSwitch(swGpu, hintGpu, {
      on: hasGpu && gpuAllowed(),
      disabled: !hasGpu,
      text: !hasGpu ? HINT.gpuMissing : gpuAutoOff() ? HINT.gpuAuto : HINT.gpu,
    });

    const canNotify = notifications.supported();
    const blocked = canNotify && notifications.permission() === 'denied';
    setSwitch(swNotify, hintNotify, {
      on: notifications.enabled(),
      disabled: !canNotify || blocked,
      text: !canNotify ? HINT.notifyMissing : blocked ? HINT.notifyBlocked : HINT.notify,
    });
  }

  swMotion.addEventListener('click', () => {
    motion.setForced(!motion.forced());
    renderSwitches();
  });

  swGpu.addEventListener('click', () => {
    if (gpuAllowed()) {
      storage.set(KEYS.gpu, '0');
    } else {                            // al activarla también se olvida la desactivación automática
      storage.set(KEYS.gpu, '1');
      storage.remove(KEYS.gpuAuto);
    }
    renderSwitches();
  });

  swNotify.addEventListener('click', async () => {
    if (notifications.enabled()) {
      notifications.disable();
    } else if (!(await notifications.enable())) {
      toast('No se concedió el permiso para los avisos.');
    }
    renderSwitches();
  });

  // Si el sistema cambia la preferencia con la pantalla abierta, el interruptor lo refleja.
  motion.onChange(renderSwitches);

  /* =========================================================
     Almacenamiento
     ========================================================= */

  const el = {
    total: $('storeTotal'),
    meter: $('storeMeter'),
    model: $('storeModel'),
    app: $('storeApp'),
    other: $('storeOther'),
    free: $('storeFree'),
    note: $('storeNote'),
    clear: $('clearModel'),
  };
  const segments = [...el.meter.children];   // modelo, app, otros (mismo orden que `parts`)
  let drawing = 0;                            // la medición es asíncrona: solo cuenta la última

  async function drawStorage() {
    const run = ++drawing;
    const [model, appCopy, estimate] = await Promise.all([
      cacheBytes((name) => name === MODEL_CACHE, { trustHeader: true }),
      cacheBytes((name) => name.startsWith(APP_CACHE_PREFIX)),
      navigator.storage?.estimate?.().catch(() => null) ?? null,
    ]);
    if (run !== drawing) return;

    const used = estimate?.usage ?? model + appCopy;
    const other = Math.max(used - model - appCopy, 0);
    const parts = [model, appCopy, other];

    el.total.textContent = formatBytes(used);
    segments.forEach((seg, i) => {
      seg.hidden = parts[i] <= 0;
      seg.style.flexGrow = String(parts[i]);
    });
    el.model.textContent = formatBytes(model);
    el.app.textContent = formatBytes(appCopy);
    el.other.textContent = formatBytes(other);
    el.free.textContent = estimate?.quota ? formatBytes(Math.max(estimate.quota - used, 0)) : '—';
    el.note.textContent = estimate
      ? 'Cifras aproximadas, medidas por el navegador.'
      : 'Tu navegador no permite medir el almacenamiento total; solo se muestran el modelo y la copia de la app.';
    el.clear.disabled = model <= 0;
  }

  el.clear.addEventListener('click', async () => {
    const before = await cacheBytes((name) => name === MODEL_CACHE, { trustHeader: true });
    try {
      await caches.delete(MODEL_CACHE);
      toast(`Modelo borrado: ${formatBytes(before)} liberados. Se descargará de nuevo en la próxima conversión.`);
    } catch {
      toast('No se pudo borrar el modelo.');
    }
    drawStorage();
  });

  /* =========================================================
     Hojas: confirmación y privacidad
     ========================================================= */

  const confirmSheet = $('confirmSheet');
  const confirmTitle = $('confirmTitle');
  const confirmText = $('confirmText');
  const confirmYes = $('confirmYes');
  const privacySheet = $('privacySheet');

  /** Pide confirmación antes de una acción que no se puede deshacer. Devuelve true si se acepta. */
  function ask({ title: heading, text, label }) {
    return new Promise((resolve) => {
      confirmTitle.textContent = heading;
      confirmText.textContent = text;
      confirmYes.textContent = label;
      let accepted = false;
      confirmYes.onclick = () => { accepted = true; confirmSheet.close(); };
      $('confirmNo').onclick = () => confirmSheet.close();
      confirmSheet.addEventListener('close', () => resolve(accepted), { once: true });   // Escape y el velo también cierran
      confirmSheet.showModal();
    });
  }

  for (const sheet of [confirmSheet, privacySheet]) {
    sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });   // clic en el velo
  }
  $('privacyClose').addEventListener('click', () => privacySheet.close());
  $('openPrivacy').addEventListener('click', () => privacySheet.showModal());

  /* =========================================================
     Borrar datos
     ========================================================= */

  /**
   * Borra lo que la app guardó en este teléfono y recarga: ajustes, modelo descargado, copia sin conexión
   * y service worker (al recargar se registra de nuevo y vuelve a preparar su copia). Con `keepSession`
   * la sesión se conserva. Solo toca lo propio: el origen puede compartirse con otros proyectos.
   */
  async function wipeLocalData({ keepSession }) {
    storage.removeMatching(OWN_KEY_PREFIXES, keepSession ? [KEYS.session] : []);
    if (!keepSession) session.signOut();   // también limpia el respaldo en memoria
    try {
      for (const name of await caches.keys()) {
        if (name.startsWith(APP_CACHE_PREFIX) || name === MODEL_CACHE) await caches.delete(name);
      }
    } catch { /* sin Cache API: no hay nada más que borrar */ }
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      await registration?.unregister();
    } catch { /* idem */ }
    location.reload();
  }

  $('wipeData').addEventListener('click', async () => {
    const ok = await ask({
      title: '¿Borrar tus datos locales?',
      text: 'Se borrarán tus ajustes, el modelo de profundidad descargado y la copia de la app para usarla sin conexión. Mantendrás tu sesión. Esto no se puede deshacer.',
      label: 'Borrar datos',
    });
    if (ok) wipeLocalData({ keepSession: true });
  });

  $('deleteAccount').addEventListener('click', async () => {
    const ok = await ask({
      title: '¿Eliminar tu cuenta?',
      text: 'Se cerrará tu sesión y se borrará todo lo que Deep Op guardó en este teléfono. Deep Op todavía no tiene servidor, así que no hay datos en otro sitio. Esto no se puede deshacer.',
      label: 'Eliminar cuenta',
    });
    if (ok) wipeLocalData({ keepSession: false });
  });

  /* =========================================================
     Versión
     ========================================================= */

  $('appVersion').textContent = `Deep Op · versión ${APP_VERSION} · DepthStyle ${DEPTHSTYLE_VERSION}`;

  return { showSettings };
}
