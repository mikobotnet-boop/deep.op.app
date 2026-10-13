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
};
