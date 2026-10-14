/**
 * session.js — sesión del usuario.
 *
 * IMPORTANTE: por ahora la sesión es LOCAL. Deep Op todavía no tiene servidor, así que
 * `signIn` solo comprueba que el correo tenga forma de correo y guarda en el dispositivo
 * quién es. No hay contraseña ni verificación: no protege nada.
 *
 * Cuando exista un servidor, `signIn` es el único punto que hay que cambiar (que llame
 * a la API y guarde lo que devuelva); el resto de la app solo usa `isSignedIn()`.
 */

import { storage, KEYS } from './storage.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Respaldo en memoria por si localStorage no está disponible (modo privado, bloqueado). */
let memory = null;

function read() {
  const raw = storage.get(KEYS.session);
  if (raw === null) return memory;
  try {
    const data = JSON.parse(raw);
    return data && typeof data.email === 'string' ? data : null;
  } catch {
    return null;
  }
}

export const session = {
  isSignedIn: () => read() !== null,

  user: () => read(),

  /** Inicia sesión. Devuelve el usuario o lanza un Error con un mensaje listo para mostrar. */
  async signIn({ email } = {}) {
    const clean = String(email ?? '').trim().toLowerCase();
    if (!clean) throw new Error('Escribe tu correo electrónico.');
    if (!EMAIL_RE.test(clean)) throw new Error('Revisa el correo: parece que le falta algo.');

    const user = { email: clean, since: Date.now() };
    memory = user;
    storage.set(KEYS.session, JSON.stringify(user));
    return user;
  },

  signOut() {
    memory = null;
    storage.remove(KEYS.session);
  },
};
