/**
 * intro.js — pantalla de inicio: animación del logotipo, fondo en movimiento y acceso.
 *
 *  Sin sesión:  se muestran «Continuar» e «Iniciar sesión». Cualquiera de los dos entra a la app.
 *  Con sesión:  no hay botones; al terminar la animación entra sola.
 *
 * La salida es un fundido (ver motion.css): la intro se disuelve mientras la interfaz entra
 * por debajo, así no hay corte entre pantallas. `onEnter` avisa a main.js para mostrar la app
 * justo en ese momento.
 *
 * Qué se anima y cómo:
 *  - Fondo: 4 manchas con `transform` (compositor). Un solo bucle requestAnimationFrame.
 *  - Logotipo: atributos de un SVG pequeño (la bolita se retira y deja un canal), actualizados
 *    en el mismo bucle. Es la única animación que no es transform/opacity de CSS; es la que
 *    pide el diseño (la forma cambia) y su coste es el repintado de un SVG de ~240 px.
 *  - El bucle se detiene y la intro se elimina del DOM cuando termina la salida.
 */

import { session } from './session.js';
import { motion } from './motion.js';

/* =========================================================
   Ajustes
   ========================================================= */

/** true = con «reducir movimiento» activado (en el sistema o en Ajustes) no hay animación (pose final fija). */
const RESPECT_REDUCED_MOTION = true;

// Línea de tiempo del logotipo (segundos)
const T_IN = 0.25, IN_DUR = 1.1;       // entrada suave del logotipo compacto
const T_RET = 1.8, RET_DUR = 1.7;      // la bolita se retira
const T_WORD = 3.2, WORD_DUR = 0.7;    // aparece el nombre
const TOTAL = 4.0;

/** Con sesión iniciada: pausa con el logotipo completo antes de entrar sola. */
const HOLD_BEFORE_ENTER = 0.7;          // s (con animación)
const HOLD_BEFORE_ENTER_STATIC_MS = 1200; // (con movimiento reducido)

/** Segundos que tardan las manchas en acercarse y chocar (más alto = más lento). */
const T_COLLIDE = 18;

/** Si `transitionend` no llega (sin motion.css, pestaña oculta), la intro se limpia igualmente. */
const LEAVE_FALLBACK_MS = 1200;

/* =========================================================
   Utilidades
   ========================================================= */

const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Rectángulo redondeado (centro cx, cy) con 4 radios [arriba-izq, arriba-der, abajo-der, abajo-izq]. */
function roundedRect(cx, cy, w, h, radii) {
  const hw = w / 2, hh = h / 2, lim = Math.min(hw, hh);
  const [tl, tr, br, bl] = radii.map((r) => Math.min(r, lim));
  const x = cx - hw, y = cy - hh, X = cx + hw, Y = cy + hh;
  const f = (n) => n.toFixed(2);
  let d = `M${f(x + tl)} ${f(y)}H${f(X - tr)}`;
  if (tr) d += `A${f(tr)} ${f(tr)} 0 0 1 ${f(X)} ${f(y + tr)}`;
  d += `V${f(Y - br)}`;
  if (br) d += `A${f(br)} ${f(br)} 0 0 1 ${f(X - br)} ${f(Y)}`;
  d += `H${f(x + bl)}`;
  if (bl) d += `A${f(bl)} ${f(bl)} 0 0 1 ${f(x)} ${f(Y - bl)}`;
  d += `V${f(y + tl)}`;
  if (tl) d += `A${f(tl)} ${f(tl)} 0 0 1 ${f(x + tl)} ${f(y)}`;
  return d + 'Z';
}

/* =========================================================
   Intro
   ========================================================= */

export function initIntro({ onEnter }) {
  const root = document.getElementById('intro');
  if (!root) { onEnter(); return; }

  const $ = (sel) => root.querySelector(sel);
  const mark = $('.intro-mark');
  const word = $('.intro-word');
  const body = $('.intro-body');
  const dot = $('.intro-dot');
  const channel = $('.intro-channel');   // canal que deja la bolita al retirarse
  const bulb = $('.intro-bulb');         // bulbo donde nace la bolita

  const actions = $('.intro-actions');
  const home = $('.intro-home');
  const form = $('.intro-login');
  const email = $('#intro-email');
  const errorBox = $('.intro-error');
  const loginBtn = $('[data-action="login"]');

  const reduce = RESPECT_REDUCED_MOTION && motion.reduced();
  const signedIn = session.isSignedIn();

  /* ---------- Logotipo D ----------
     1) Aparece compacto y blanco (la bolita está dentro, tapando el bulbo).
     2) La bolita se retira hacia la izquierda y deja el canal abierto.
     3) Aparece el nombre. */
  const OX = 17.5, OY = 21.5;          // centra el logotipo en el viewBox
  const AXIS_Y = 85.5 + OY;            // eje de la ranura
  const BULB_X = 145 + OX;             // bulbo (donde nace la bolita)
  const DOT_END_X = 21 + OX;           // posición final de la bolita

  body.setAttribute('d', roundedRect(125.5 + OX, 78.5 + OY, 159, 157, [3, 78, 78, 50]));
  bulb.setAttribute('d', roundedRect(BULB_X, AXIS_Y, 38, 38, [19, 19, 19, 19]));

  function renderLogo(t) {
    // Entrada: fundido + escala suave del D sólido
    const a = easeOut(clamp((t - T_IN) / IN_DUR));
    mark.setAttribute('opacity', a.toFixed(3));
    mark.setAttribute('transform',
      `translate(120 100) scale(${(0.88 + 0.12 * a).toFixed(4)}) translate(-120 -100)`);

    // Retirada de la bolita (con un pequeño estiramiento líquido)
    const m = easeInOut(clamp((t - T_RET) / RET_DUR));
    const bump = Math.sin(Math.PI * m);
    const cx = lerp(BULB_X, DOT_END_X, m);
    const size = lerp(44, 42, m);   // empieza algo mayor que el bulbo para tapar su borde
    const w = size + 16 * bump;
    const h = size - 5 * bump;
    dot.setAttribute('d', roundedRect(cx, AXIS_Y, w, h, [h / 2, h / 2, h / 2, h / 2]));

    // Canal que queda detrás de la bolita (de la bolita al bulbo)
    const len = Math.max(BULB_X - cx, 0.01);
    channel.setAttribute('d', roundedRect(cx + len / 2, AXIS_Y, len, 24, [12, 12, 12, 12]));

    // Nombre
    const wo = easeOut(clamp((t - T_WORD) / WORD_DUR));
    word.setAttribute('opacity', wo.toFixed(3));
    word.setAttribute('transform', `translate(0 ${((1 - wo) * 6).toFixed(2)})`);
  }

  /* ---------- Fondo: negro y azul suave que se acercan y chocan ----------
     El choque coincide con el final de la retirada de la bolita. */
  const blobs = [
    { el: $('.intro-blob--blue-a'),  from: [0.02, 0.12], to: [0.46, 0.45], fx: 0.05, fy: 0.07, ph: 0.0, wx: 0.035, wy: 0.04 },
    { el: $('.intro-blob--black-a'), from: [1.00, 0.20], to: [0.55, 0.47], fx: 0.06, fy: 0.05, ph: 1.7, wx: 0.035, wy: 0.04 },
    { el: $('.intro-blob--blue-b'),  from: [0.98, 0.88], to: [0.54, 0.55], fx: 0.04, fy: 0.06, ph: 3.1, wx: 0.030, wy: 0.04 },
    { el: $('.intro-blob--black-b'), from: [0.00, 0.92], to: [0.45, 0.52], fx: 0.05, fy: 0.04, ph: 4.4, wx: 0.030, wy: 0.04 },
  ];
  let W = 0, H = 0;

  function measure() {
    W = root.clientWidth;
    H = root.clientHeight;
    for (const b of blobs) b.size = b.el.offsetWidth;
  }

  function renderMesh(t) {
    const c = 0.5 - 0.5 * Math.cos((TAU * t) / T_COLLIDE);   // 0 = lejos, 1 = choque
    const k = c * c * (3 - 2 * c);
    for (const b of blobs) {
      const x = lerp(b.from[0], b.to[0], k) + Math.sin(TAU * b.fx * t + b.ph) * b.wx;
      const y = lerp(b.from[1], b.to[1], k) + Math.cos(TAU * b.fy * t + b.ph) * b.wy;
      const s = (1 + 0.18 * k) * (1 + Math.sin(TAU * b.fx * 0.7 * t + b.ph) * 0.04);
      const tx = x * W - b.size / 2;
      const ty = y * H - b.size / 2;
      b.el.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) scale(${s.toFixed(4)})`;
    }
  }

  /* ---------- Bucle principal (requestAnimationFrame) ---------- */
  let running = false, last = 0, raf = 0;
  let tMesh = 0, tLogo = 0, hold = 0;
  const autoEnter = signedIn && !reduce;

  function frame(now) {
    if (!running) return;
    const dt = Math.min((now - last) / 1000, 0.05);   // evita saltos tras volver de otra pestaña
    last = now;

    tMesh += dt;
    renderMesh(tMesh);

    if (tLogo < TOTAL) {
      tLogo = Math.min(tLogo + dt, TOTAL);
      renderLogo(tLogo);
    } else if (autoEnter && !leaving) {
      hold += dt;
      if (hold >= HOLD_BEFORE_ENTER) enter();
    }
    raf = requestAnimationFrame(frame);
  }

  function play() {
    if (running) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  // Pausa automática si la pestaña queda oculta
  let autoPaused = false;
  const onVisibility = () => {
    if (document.hidden && running) { autoPaused = true; stop(); }
    else if (!document.hidden && autoPaused) { autoPaused = false; play(); }
  };
  document.addEventListener('visibilitychange', onVisibility);

  const resizeObserver = 'ResizeObserver' in window ? new ResizeObserver(measure) : null;
  resizeObserver?.observe(root);
  window.addEventListener('resize', measure);

  /* ---------- Salida ---------- */
  let leaving = false;

  function cleanup() {
    stop();
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('resize', measure);
    resizeObserver?.disconnect();
    root.remove();
  }

  function enter() {
    if (leaving) return;
    leaving = true;

    root.inert = true;                       // sin foco ni clics mientras se disuelve
    root.classList.add('is-leaving');        // motion.css lo convierte en fundido
    onEnter();                               // main.js muestra la app justo ahora

    const done = () => { clearTimeout(timer); cleanup(); };
    const timer = setTimeout(done, LEAVE_FALLBACK_MS);
    root.addEventListener('transitionend', (e) => {
      if (e.target === root && e.propertyName === 'opacity') done();
    });
  }

  /* ---------- Botones y formulario ---------- */
  function setError(message) {
    errorBox.hidden = !message;
    errorBox.textContent = message || '';
    if (message) email.setAttribute('aria-invalid', 'true');
    else email.removeAttribute('aria-invalid');
  }

  function show(view) {
    const login = view === 'login';
    home.hidden = login;
    form.hidden = !login;
    // Tras la primera aparición, los botones no esperan al volver desde el formulario.
    root.style.setProperty('--panel-delay', '0ms');
    if (login) email.focus({ preventScroll: true });
    else loginBtn.focus({ preventScroll: true });
  }

  actions.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'continue') enter();
    else if (action === 'login') show('login');
    else if (action === 'back') { setError(''); show('home'); }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setError('');
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      await session.signIn({ email: email.value });
      enter();
    } catch (err) {
      setError(err.message);
      email.focus({ preventScroll: true });
    } finally {
      submit.disabled = false;
    }
  });

  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !form.hidden) { setError(''); show('home'); }
  });

  /* ---------- Inicio ---------- */
  measure();

  if (!signedIn) actions.hidden = false;   // con sesión no hay botones: entra sola

  if (reduce) {
    // Pose final fija, sin movimiento
    tLogo = TOTAL;
    renderLogo(TOTAL);
    renderMesh(T_COLLIDE * 0.35);
    if (signedIn) setTimeout(enter, HOLD_BEFORE_ENTER_STATIC_MS);
  } else {
    renderLogo(0);
    renderMesh(0);
    play();
  }
}
