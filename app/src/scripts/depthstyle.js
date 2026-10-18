/**
 * depthstyle.js — pantalla «DepthStyle»: convierte un video al formato DepthStyle en el dispositivo.
 *
 *  - Su propia página (screens.js), igual que Inicio.
 *  - Flujo: elegir video → vista previa → recorte con timeline → «Procesar video» → resultado.
 *  - Recorte: dos tiradores para elegir el fragmento (máximo 60 s).
 *  - Se convierte el fragmento seleccionado a DepthStyle en el dispositivo.
 *  - El motor (depthstyle/) se carga solo al pulsar «Procesar video» (`import()` dinámico).
 *
 * Todo el texto dinámico se inserta con textContent (nunca como HTML).
 */

import { DEPTHSTYLE_VERSION } from '../depthstyle/version.js';
import { motion } from './motion.js';
import { notifications } from './notify.js';

/* =========================================================
   Ajustes
   ========================================================= */

const MAX_SECONDS = 60;                       // longitud máxima del fragmento
const INITIAL_SECONDS = 15;                  // fragmento inicial al cargar un video
const MIN_GAP = 1;                           // s mínimos entre los dos tiradores
const MOBILE_QUERY = '(max-width: 760px)';   // debe coincidir con menu.js
const VIDEO_EXT = /\.(mp4|m4v|mov|webm)$/i;  // por si el dispositivo no informa el tipo del archivo

/* =========================================================
   Utilidades
   ========================================================= */

const nameOf = (item) => item.dataset.tip ?? item.dataset.x ?? null;
const isVideo = (file) => file.type.startsWith('video/') || (!file.type && VIDEO_EXT.test(file.name));
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

const formatEta = (s) => (s < 60 ? `${Math.max(1, Math.round(s))} s` : `${Math.ceil(s / 60)} min`);

/** Los errores propios de DepthStyle ya vienen en español; el resto se envuelve. */
function friendlyError(err) {
  if (err?.name === 'DepthStyleError') return err.message;
  if (!navigator.onLine) return 'Sin conexión a internet. La primera conversión necesita internet para descargar el modelo.';
  return `No se pudo convertir el video: ${err?.message || 'error desconocido'}`;
}

export function initDepthstyle({ app, menu, screens }) {
  const root = document.documentElement;
  const mobile = window.matchMedia(MOBILE_QUERY);
  const $ = (id) => document.getElementById(id);

  // Panel y elementos generales
  const panel = $('dsProjectPanel');
  const panelTitle = $('dsProjectTitle');
  const version = $('dsVersion');

  // Zona de carga
  const drop = $('dsUploadArea');
  const input = $('dsVideoInput');

  // Vista previa y recorte
  const preview = $('dsVideoPreview');
  const video = $('dsPreviewVideo');
  const nameEl = $('dsVideoName');
  const changeBtn = $('dsChangeFileBtn');
  const trimHint = preview.querySelector('.trim-hint');

  // Timeline
  const track = $('dsTimelineTrack');
  const range = $('dsTimelineSelected');
  const thumbStart = $('dsHandleStart');
  const thumbEnd = $('dsHandleEnd');
  const startLabel = $('dsStartTimeLabel');
  const endLabel = $('dsEndTimeLabel');
  const durLabel = $('dsSelectedDurationLabel');
  const totalLabel = $('dsTotalDurationLabel');
  const warn = $('dsDurationWarning');

  // Estado y resultado
  const status = $('dsStatusMessage');
  const progressWrap = $('dsProgressWrap');
  const progressBar = $('dsProgressBar');
  const progressFill = $('dsProgressFill');
  const resultBox = $('dsResultBox');
  const resultVideo = $('dsResultVideo');
  const downloadLink = $('dsDownloadLink');
  const cancelBtn = $('dsCancelBtn');
  const processBtn = $('dsProcessBtn');

  version.textContent = `v${DEPTHSTYLE_VERSION}`;

  const state = { ready: false, duration: 0, start: 0, end: 0, url: null, trackW: 0, file: null, token: 0 };
  let job = null;                       // conversión en curso: { controller }
  let resultUrl = null;                 // object URL del MP4 convertido
  let seekRaf = 0;
  let seekTo = 0;

  function setStatus(text, kind = '') {
    status.textContent = text;
    status.className = 'status' + (kind ? ` is-${kind}` : '');
  }

  /* ----- Navegación ----- */

  function showDepthstyle() {
    if (mobile.matches && menu.isOpen()) menu.close();
    screens.show('depthstyle');
  }

  app.addEventListener('click', (e) => {
    const item = e.target.closest('.item');
    if (item && app.contains(item) && nameOf(item) === 'DepthStyle') showDepthstyle();
  });

  screens.onChange((name) => {
    if (name !== 'depthstyle') return;
    root.scrollTop = 0;
    panelTitle.focus({ preventScroll: true });
    measure();
  });

  /* ----- Elegir video ----- */

  changeBtn.addEventListener('click', () => input.click());

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.value = '';
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
    if (job) return;
    if (!isVideo(file)) {
      setStatus('El archivo que elegiste no es un video. Prueba con MP4, MOV o WebM.', 'error');
      return;
    }
    loadVideo(file);
  }

  function clearResult() {
    resultBox.hidden = true;
    resultVideo.pause();
    resultVideo.removeAttribute('src');
    resultVideo.load();
    downloadLink.removeAttribute('href');
    if (resultUrl) { URL.revokeObjectURL(resultUrl); resultUrl = null; }
  }

  function releaseVideo() {
    video.onloadedmetadata = null;
    video.onerror = null;
    video.pause();
    video.removeAttribute('src');
    video.load();
    if (state.url) URL.revokeObjectURL(state.url);
    state.url = null;
    state.ready = false;
  }

  function loadVideo(file) {
    clearResult();
    releaseVideo();
    state.file = file;
    state.duration = 0;
    const token = ++state.token;
    processBtn.disabled = true;
    setStatus('Leyendo el video…', 'busy');

    state.url = URL.createObjectURL(file);
    video.onloadedmetadata = () => onMetadata(file, token);
    video.onerror = () => { if (token === state.token) onVideoError(); };
    video.src = state.url;
  }

  function onVideoError() {
    releaseVideo();
    state.file = null;
    preview.hidden = true;
    drop.hidden = false;
    setStatus('No se pudo leer este video. Prueba con un archivo MP4 o WebM.', 'error');
  }

  function onMetadata(file, token) {
    if (token !== state.token) return;
    if (!Number.isFinite(video.duration) || video.duration <= 0) { onVideoError(); return; }

    const fileName = document.createElement('span');
    fileName.className = 'file-name-text';
    fileName.textContent = file.name;
    nameEl.replaceChildren(fileName);

    state.duration = video.duration;
    state.start = 0;
    state.end = Math.min(state.duration, INITIAL_SECONDS);
    state.ready = true;

    totalLabel.textContent = formatTime(state.duration);
    trimHint.hidden = false;

    preview.hidden = false;
    drop.hidden = true;
    measure();
    render();
    setStatus('');
    processBtn.disabled = false;
  }

  /* ----- Timeline y recorte ----- */

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

  // Interacción con timeline (ratón/dedo)
  let drag = null;
  track.addEventListener('pointerdown', (e) => {
    if (!state.ready || e.button > 0) return;
    const t = timeFromPointer(e);
    const onThumb = e.target.closest('.thumb');
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

  // Teclado: flechas ±1 s (Mayús ±5 s), RePág/AvPág ±10 s, Inicio/Fin
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

  /* ----- Reproducción limitada al fragmento ----- */

  function watchPlayback() {
    seekRaf = requestAnimationFrame(() => {
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
    if (video.currentTime < state.start - 0.05 || video.currentTime >= state.end - 0.05) {
      video.currentTime = state.start;
    }
    cancelAnimationFrame(seekRaf);
    watchPlayback();
  });
  video.addEventListener('pause', () => cancelAnimationFrame(seekRaf));

  /* ----- Procesar ----- */

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

  function setBusy(busy) {
    processBtn.disabled = busy || !state.ready;
    cancelBtn.textContent = busy ? 'Cancelar conversión' : 'Cancelar';
    changeBtn.disabled = busy;
  }

  async function process() {
    if (job || !state.file || !state.url || !state.ready) return;

    video.pause();
    clearResult();
    const controller = new AbortController();
    job = { controller };
    setBusy(true);
    showProgress(0);
    setStatus('Preparando la conversión…', 'busy');
    let outFps = null;

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
            outFps = p.fps;
            showProgress(p.fraction);
            const mode = p.profile === 'gpu' ? 'GPU' : 'sin GPU (más lento)';
            if (p.frame === 0) {
              setStatus(`Procesando el primer fotograma de ${p.total} (salida a ${p.fps} fps)… el primero tarda más. Modo: ${mode}.`, 'busy');
            } else {
              const eta = p.etaSeconds !== undefined ? ` · quedan ≈ ${formatEta(p.etaSeconds)}` : '';
              setStatus(`Convirtiendo a DepthStyle… ${Math.round(p.fraction * 100)} % (${p.frame}/${p.total})${eta} · ${mode}`, 'busy');
            }
          } else {
            showProgress(1);
            setStatus('Guardando el video…', 'busy');
          }
        },
      });

      const duration = state.end - state.start;
      resultUrl = URL.createObjectURL(blob);
      resultVideo.src = resultUrl;
      downloadLink.href = resultUrl;
      resultBox.hidden = false;
      showProgress(null);
      setStatus(`Listo: DepthStyle de ${Math.round(duration)} s${outFps ? ` a ${outFps} fps` : ''} (sin sonido).`, 'ok');
      notifications.done('Tu video DepthStyle está listo', 'Abre Deep Op para verlo y descargarlo.');
    } catch (err) {
      showProgress(null);
      if (err?.name === 'AbortError') {
        setStatus('Conversión cancelada.');
      } else {
        console.error('[depthstyle]', err);
        setStatus(friendlyError(err), 'error');
      }
    } finally {
      job = null;
      setBusy(false);
    }
  }

  processBtn.addEventListener('click', process);

  cancelBtn.addEventListener('click', () => {
    if (job) { job.controller.abort(); return; }
    releaseVideo();
    clearResult();
    showProgress(null);
    state.file = null;
    state.duration = 0;
    preview.hidden = true;
    drop.hidden = false;
    warn.hidden = true;
    processBtn.disabled = true;
    setStatus('');
  });
}
