/**
 * home.js — página principal: carrusel, creación de proyecto y recorte de video.
 *
 *  - Carrusel: el video se detiene con «reducir movimiento» y cuando no está a la vista.
 *  - Overlays: si falta una imagen (aún no se ha subido) la casilla queda como marcador.
 *  - Proyecto: elegir un video (clic, teclado o arrastrar), recortar un fragmento de hasta
 *    60 s con dos tiradores (ratón, dedo o teclado) y ver la vista previa solo de ese fragmento.
 *
 * «Procesar video» convierte el fragmento a DepthStyle en el propio dispositivo (carpeta src/depthstyle/): barra
 * de progreso, cancelación, vista previa del resultado y descarga del MP4.
 */

import { DEPTHSTYLE_VERSION } from '../depthstyle/version.js';   // solo la versión: el motor se carga al pulsar «Procesar»

/* =========================================================
   Ajustes
   ========================================================= */

const MAX_SECONDS = 60;          // longitud máxima del fragmento
const INITIAL_SECONDS = 15;      // fragmento inicial al cargar un video
const MIN_GAP = 1;               // s mínimos entre los dos tiradores
const VIDEO_EXT = /\.(mp4|m4v|mov|webm)$/i;   // por si el dispositivo no informa el tipo del archivo

/* =========================================================
   Utilidades
   ========================================================= */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const pad = (n) => String(n).padStart(2, '0');

/** 75 → «1:15»; 3725 → «1:02:05». */
function formatTime(seconds) {
  const t = Math.max(0, Math.round(seconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

const isVideo = (file) => file.type.startsWith('video/') || (!file.type && VIDEO_EXT.test(file.name));

/* =========================================================
   Inicio
   ========================================================= */

export function initHome({ app }) {
  const root = app.querySelector('#home');
  if (!root) return null;

  const $ = (id) => root.querySelector(`#${id}`);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Entrada escalonada de los bloques (la regla está en motion.css)
  [...root.querySelector('.home-inner').children].forEach((el, i) => el.style.setProperty('--i', i));

  /* ---------- Carrusel ---------- */
  const hero = root.querySelector('.hero-media');
  let heroVisible = true;

  function syncHero() {
    if (!hero) return;
    if (reduceMotion.matches || !heroVisible) hero.pause();
    else hero.play().catch(() => {});
  }
  if (hero) {
    reduceMotion.addEventListener('change', syncHero);
    hero.addEventListener('play', () => { if (reduceMotion.matches) hero.pause(); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        heroVisible = entry.isIntersecting;
        syncHero();
      }, { root, threshold: 0.2 }).observe(hero);
    }
    syncHero();
  }

  /* ---------- Overlays sin imagen ---------- */
  root.querySelectorAll('.overlay img').forEach((img) => {
    const item = img.closest('.overlay');
    const markEmpty = () => item.classList.add('is-empty');
    img.addEventListener('load', () => item.classList.remove('is-empty'));
    img.addEventListener('error', markEmpty);
    if (img.complete && img.naturalWidth === 0) markEmpty();
  });

  /* ---------- Proyecto ---------- */
  const openBtn = $('openProjectPanel');
  const panel = $('projectPanel');
  const title = $('projectTitle');
  const drop = $('uploadArea');
  const input = $('videoInput');
  const preview = $('videoPreview');
  const video = $('previewVideo');
  const nameEl = $('videoName');
  const changeBtn = $('changeFileBtn');
  const status = $('statusMessage');
  const track = $('timelineTrack');
  const range = $('timelineSelected');
  const thumbStart = $('handleStart');
  const thumbEnd = $('handleEnd');
  const startLabel = $('startTimeLabel');
  const endLabel = $('endTimeLabel');
  const durLabel = $('selectedDurationLabel');
  const totalLabel = $('totalDurationLabel');
  const warn = $('durationWarning');
  const processBtn = $('processBtn');
  const cancelBtn = $('cancelBtn');
  $('versionTag').textContent = `v${DEPTHSTYLE_VERSION}`;
  const progressWrap = $('progressWrap');
  const progressBar = $('progressBar');
  const progressFill = $('progressFill');
  const resultBox = $('resultBox');
  const resultVideo = $('resultVideo');
  const downloadLink = $('downloadLink');

  const state = { ready: false, duration: 0, start: 0, end: 0, url: null, trackW: 0 };
  let job = null;                       // conversión en curso: { controller }
  let resultUrl = null;                 // object URL del MP4 convertido

  function setStatus(text, kind = '') {
    status.textContent = text;
    status.className = 'status' + (kind ? ` is-${kind}` : '');
  }

  /* ----- Abrir y cerrar el panel ----- */
  function open() {
    if (panel.hidden) {
      panel.hidden = false;
      openBtn.hidden = true;
      measure();
    }
    panel.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
    title.focus({ preventScroll: true });
  }

  function close() {
    job?.controller.abort();
    clearResult();
    showProgress(null);
    releaseVideo();
    state.ready = false;
    input.value = '';
    panel.hidden = true;
    openBtn.hidden = false;
    preview.hidden = true;
    drop.hidden = false;
    warn.hidden = true;
    setStatus('');
    processBtn.disabled = true;
    openBtn.focus({ preventScroll: true });
  }

  openBtn.addEventListener('click', open);
  // Mientras se convierte, «Cancelar» detiene la conversión en vez de cerrar el panel
  cancelBtn.addEventListener('click', () => { if (job) job.controller.abort(); else close(); });
  // El botón «+» del dock crea un proyecto
  app.querySelector('.dock .add')?.addEventListener('click', open);

  /* ----- Elegir el archivo ----- */
  changeBtn.addEventListener('click', () => input.click());

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.value = '';                     // permite volver a elegir el mismo archivo
    if (file) handleFile(file);
  });

  ['dragenter', 'dragover'].forEach((type) => drop.addEventListener(type, (e) => {
    e.preventDefault();
    drop.classList.add('is-over');
  }));
  ['dragleave', 'drop'].forEach((type) => drop.addEventListener(type, () => drop.classList.remove('is-over')));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  });

  function handleFile(file) {
    if (!isVideo(file)) {
      setStatus('El archivo que elegiste no es un video. Prueba con MP4, MOV o WebM.', 'error');
      return;
    }
    loadVideo(file);
  }

  /* ----- Cargar el video ----- */
  function releaseVideo() {
    video.onloadedmetadata = null;
    video.onerror = null;
    video.pause();
    video.removeAttribute('src');
    video.load();                         // suelta el archivo sin provocar un error de red
    if (state.url) URL.revokeObjectURL(state.url);
    state.url = null;
  }

  function loadVideo(file) {
    clearResult();
    releaseVideo();
    state.ready = false;
    processBtn.disabled = true;
    setStatus('Leyendo el video…', 'busy');

    state.url = URL.createObjectURL(file);
    video.onloadedmetadata = () => onMetadata(file);
    video.onerror = onVideoError;         // se asignan antes de `src`: no se pierde ningún evento
    video.src = state.url;
  }

  function onVideoError() {
    releaseVideo();
    preview.hidden = true;
    drop.hidden = false;
    setStatus('No se pudo leer este video. Prueba con un archivo MP4 o WebM.', 'error');
  }

  function onMetadata(file) {
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      onVideoError();
      return;
    }
    state.ready = true;
    state.duration = duration;
    state.start = 0;
    state.end = Math.min(duration, INITIAL_SECONDS);

    const fileName = document.createElement('span');
    fileName.className = 'file-name-text';
    fileName.textContent = file.name;
    const fileSize = document.createElement('span');
    fileSize.className = 'file-size';
    fileSize.textContent = `(${(file.size / 1024 / 1024).toFixed(1)} MB)`;
    nameEl.replaceChildren(fileName, fileSize);   // el nombre se recorta con «…»; el tamaño siempre se ve
    totalLabel.textContent = formatTime(duration);
    drop.hidden = true;
    preview.hidden = false;
    measure();                            // el recorte acaba de aparecer: ahora se puede medir
    render();
    setStatus('Video cargado. Ajusta el fragmento que quieres usar (máximo 60 s).', 'ok');
  }

  /* ----- Línea de tiempo ----- */
  const minGap = () => Math.min(MIN_GAP, state.duration / 2);

  function measure() {
    state.trackW = track.clientWidth;
    if (state.ready) render();
  }
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(track);

  function render() {
    const { duration, start, end } = state;
    if (!state.ready || !duration) return;
    const w = state.trackW || track.clientWidth;
    const px = (t) => (t / duration) * w;

    range.style.transform = `translateX(${px(start)}px) scaleX(${(end - start) / duration})`;
    thumbStart.style.transform = `translateX(${px(start) - 12}px)`;
    thumbEnd.style.transform = `translateX(${px(end) - 12}px)`;

    for (const [thumb, value, min, max] of [
      [thumbStart, start, 0, end - minGap()],
      [thumbEnd, end, start + minGap(), duration],
    ]) {
      thumb.setAttribute('aria-valuemin', min.toFixed(1));
      thumb.setAttribute('aria-valuemax', max.toFixed(1));
      thumb.setAttribute('aria-valuenow', value.toFixed(1));
      thumb.setAttribute('aria-valuetext', formatTime(value));
    }

    const length = end - start;
    startLabel.textContent = formatTime(start);
    endLabel.textContent = formatTime(end);
    durLabel.textContent = `Duración seleccionada: ${Math.round(length)} s`;

    const tooLong = length > MAX_SECONDS + 1e-6;
    warn.hidden = !tooLong;
    processBtn.disabled = tooLong || !!job;
  }

  function moveTo(thumb, t) {
    if (!state.ready) return;
    if (thumb === thumbStart) state.start = clamp(t, 0, state.end - minGap());
    else state.end = clamp(t, state.start + minGap(), state.duration);
    if (resultUrl) clearResult();
    render();
    requestSeek(thumb === thumbStart ? state.start : Math.max(state.start, state.end - 0.1));
  }

  // Un `seek` por fotograma como mucho: arrastrar no satura al video.
  let seekRaf = 0;
  let seekTo = 0;
  function requestSeek(t) {
    seekTo = t;
    if (seekRaf) return;
    seekRaf = requestAnimationFrame(() => {
      seekRaf = 0;
      if (state.ready) video.currentTime = seekTo;
    });
  }

  const timeFromPointer = (e) => {
    const r = track.getBoundingClientRect();
    return clamp((e.clientX - r.left) / r.width, 0, 1) * state.duration;
  };

  let drag = null;
  track.addEventListener('pointerdown', (e) => {
    if (!state.ready || e.button > 0) return;
    const t = timeFromPointer(e);
    const onThumb = e.target.closest('.thumb');
    // Tocar la barra mueve el tirador más cercano
    const thumb = onThumb ?? (Math.abs(t - state.start) <= Math.abs(t - state.end) ? thumbStart : thumbEnd);
    drag = { thumb, id: e.pointerId };
    thumb.setPointerCapture(e.pointerId);
    thumb.focus({ preventScroll: true });
    e.preventDefault();
    if (!onThumb) moveTo(thumb, t);
  });
  track.addEventListener('pointermove', (e) => {
    if (drag && e.pointerId === drag.id) moveTo(drag.thumb, timeFromPointer(e));
  });
  const endDrag = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
  track.addEventListener('pointerup', endDrag);
  track.addEventListener('pointercancel', endDrag);

  // Teclado: flechas ±1 s (Mayús ±5 s), RePág/AvPág ±10 s, Inicio/Fin hasta el límite
  for (const thumb of [thumbStart, thumbEnd]) {
    thumb.addEventListener('keydown', (e) => {
      const current = thumb === thumbStart ? state.start : state.end;
      const step = e.shiftKey ? 5 : 1;
      const next = {
        ArrowLeft: current - step, ArrowDown: current - step,
        ArrowRight: current + step, ArrowUp: current + step,
        PageDown: current - 10, PageUp: current + 10,
        Home: -Infinity, End: Infinity,
      }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      moveTo(thumb, next);
    });
  }

  /* ----- La vista previa solo reproduce el fragmento elegido ----- */
  let watchRaf = 0;
  function watchPlayback() {
    watchRaf = requestAnimationFrame(() => {
      if (video.paused) return;
      if (video.currentTime >= state.end) {
        video.pause();
        video.currentTime = state.start;
        return;
      }
      watchPlayback();
    });
  }
  video.addEventListener('play', () => {
    if (!state.ready) return;
    if (video.currentTime < state.start - 0.05 || video.currentTime >= state.end - 0.05) video.currentTime = state.start;
    cancelAnimationFrame(watchRaf);
    watchPlayback();
  });
  video.addEventListener('pause', () => cancelAnimationFrame(watchRaf));

  /* ----- Procesar: conversión a DepthStyle en el dispositivo ----- */
  /** `fraction` 0…1 = barra con valor; `'wait'` = barra indeterminada; `null` = oculta. */
  function showProgress(fraction) {
    progressWrap.hidden = fraction === null;
    if (fraction === null) return;
    const indeterminate = fraction === 'wait';
    progressBar.classList.toggle('is-indeterminate', indeterminate);
    if (indeterminate) {
      progressFill.style.transform = '';
      progressBar.removeAttribute('aria-valuenow');
      return;
    }
    const pct = Math.round(clamp(fraction, 0, 1) * 100);
    progressFill.style.transform = `scaleX(${pct / 100})`;
    progressBar.setAttribute('aria-valuenow', String(pct));
  }

  function clearResult() {
    resultBox.hidden = true;
    resultVideo.pause();
    resultVideo.removeAttribute('src');
    resultVideo.load();
    downloadLink.removeAttribute('href');
    if (resultUrl) { URL.revokeObjectURL(resultUrl); resultUrl = null; }
  }

  /** Los errores propios de DepthStyle ya vienen en español; el resto se envuelve. */
  function friendlyError(err) {
    if (err?.name === 'DepthStyleError') return err.message;
    if (!navigator.onLine) return 'Sin conexión a internet. La primera conversión necesita internet para descargar el modelo.';
    return `No se pudo convertir el video: ${err?.message || 'error desconocido'}`;
  }

  const formatEta = (s) => (s < 60 ? `${Math.max(1, Math.round(s))} s` : `${Math.ceil(s / 60)} min`);

  function setBusy(busy) {
    processBtn.disabled = busy || (state.end - state.start) > MAX_SECONDS + 1e-6;
    cancelBtn.textContent = busy ? 'Cancelar conversión' : 'Cancelar';
    changeBtn.disabled = busy;
  }

  async function processSelection() {
    const seconds = state.end - state.start;
    if (job || !state.ready || seconds > MAX_SECONDS + 1e-6) return;

    video.pause();
    clearResult();
    const controller = new AbortController();
    job = { controller };
    setBusy(true);
    showProgress(0);
    setStatus('Preparando la conversión…', 'busy');

    try {
      const { convertToDepthStyle } = await import('../depthstyle/index.js');

      const blob = await convertToDepthStyle({
        url: state.url,
        start: state.start,
        end: state.end,
        signal: controller.signal,
        onProgress: (p) => {
          if (job?.controller !== controller) return;
          if (p.phase === 'model') {
            if (p.fraction === null) {
              showProgress('wait');
              setStatus('Conectando y descargando el modelo de profundidad (solo la primera vez)…', 'busy');
            } else {
              showProgress(p.fraction);
              setStatus(`Descargando el modelo de profundidad (solo la primera vez)… ${Math.round(p.fraction * 100)} %`, 'busy');
            }
          } else if (p.phase === 'prepare') {
            showProgress('wait');
            setStatus('Preparando el modelo en tu dispositivo… puede tardar un minuto la primera vez.', 'busy');
          } else if (p.phase === 'frames') {
            showProgress(p.fraction);
            const mode = p.profile === 'gpu' ? 'GPU' : 'sin GPU (más lento)';
            if (p.frame === 0) {
              setStatus(`Procesando el primer fotograma de ${p.total}… el primero tarda más. Modo: ${mode}.`, 'busy');
            } else {
              const eta = p.etaSeconds !== undefined ? ` · quedan ≈ ${formatEta(p.etaSeconds)}` : '';
              const speed = ` · ${p.secondsPerFrame.toFixed(1).replace('.', ',')} s por fotograma`;
              setStatus(`Convirtiendo a DepthStyle… ${Math.round(p.fraction * 100)} % (${p.frame}/${p.total})${eta}${speed} · ${mode}`, 'busy');
            }
          } else {
            showProgress(1);
            setStatus('Guardando el video…', 'busy');
          }
        },
      });

      resultUrl = URL.createObjectURL(blob);
      resultVideo.src = resultUrl;
      downloadLink.href = resultUrl;
      resultBox.hidden = false;
      showProgress(null);
      setStatus(`Listo: DepthStyle de ${Math.round(seconds)} s (sin sonido).`, 'ok');
    } catch (err) {
      showProgress(null);
      if (err?.name === 'AbortError') setStatus('Conversión cancelada.', 'ok');
      else setStatus(friendlyError(err), 'error');
    } finally {
      job = null;
      setBusy(false);
    }
  }

  processBtn.addEventListener('click', processSelection);

  return { open, close };
}
