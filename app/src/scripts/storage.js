/**
 * storage.js — acceso seguro a localStorage.
 *
 * localStorage puede lanzar excepciones (modo privado, cookies bloqueadas, cuota llena)
 * o no existir. Todo pasa por aquí para que el resto de la app nunca tenga que
 * preocuparse: si falla, se devuelve el valor por defecto y la app sigue funcionando.
 */

/** Claves usadas por la app. Cambiar un valor invalida lo que ya guardaron los usuarios. */
export const KEYS = Object.freeze({
  /** '1' = menú cerrado. Semántica heredada de la primera versión: se conserva por compatibilidad. */
  menuClosed: 'deepop-menu',
  /** Sesión iniciada (JSON). Si existe, la pantalla de inicio no muestra botones y entra sola. */
  session: 'deepop-session',
  /** '1' = reducir animaciones aunque el sistema no lo pida (Ajustes). Ver motion.js. */
  reduceMotion: 'deepop-reduce-motion',
  /** '0' = no usar la GPU para convertir (Ajustes). Cualquier otro valor = se intenta la GPU si existe. */
  gpu: 'deepop-gpu',
  /** Versión de DepthStyle con la que la GPU se desactivó SOLA (se colgó). Con otra versión se vuelve a probar. */
  gpuAuto: 'depthstyle.forceCpu',
  /** 'dark' | 'light' | 'system' (Ajustes). Sin valor = oscuro. Ver theme.js. */
  theme: 'deepop-theme',
  /** '1' = avisar cuando termine una conversión (si además hay permiso de notificaciones). Ver notify.js. */
  notify: 'deepop-notify',
});

export const storage = {
  get(key, fallback = null) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch {
      return fallback;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(key, String(value));
      return true;
    } catch {
      return false;
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Borra todas las claves que empiecen por alguno de los prefijos, salvo las de `keep`.
   * El sitio puede compartir origen con otros proyectos (usuario.github.io): solo se tocan las propias.
   */
  removeMatching(prefixes, keep = []) {
    try {
      const names = [];
      for (let i = 0; i < localStorage.length; i++) names.push(localStorage.key(i));
      for (const name of names) {
        if (name && prefixes.some((p) => name.startsWith(p)) && !keep.includes(name)) localStorage.removeItem(name);
      }
      return true;
    } catch {
      return false;
    }
  },
};
