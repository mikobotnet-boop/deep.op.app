/**
 * depthstyle.js — pantalla «DepthStyle»: convierte un video al formato DepthStyle en el dispositivo.
 *
 *  - Su propia página (screens.js). No comparte nada con Inicio: el convertidor de Inicio sigue
 *    como estaba. Mismo formato visual que el Compresor.
 *  - Flujo: elegir el video → vista previa → «Procesar video» → resultado (vista previa y descarga).
 *  - Se convierte como máximo MAX_SECONDS desde el principio. Un video más largo se recorta a eso y
 *    se avisa en la pantalla.
 *  - El motor (depthstyle/) se carga solo al pulsar «Procesar video» (`import()` dinámico).
 *
 * Todo el texto dinámico se inserta con textContent (nunca como HTML).
 */

import { DEPTHSTYLE_VERSION } from '../depthstyle/version.js';
import { notifications } from './notify.js';

const MAX_SECONDS = 60;                       // duración máxima que se convierte (igual que Inicio)
const MOBILE_QUERY = '(max-width: 760px)';    // debe coincidir con menu.js
const VIDEO_EXT = /\.(mp4|m4v|mov|webm)$/i;   // por si el dispositivo no informa el tipo del archivo

const nameOf = (item) => item.dataset.tip ?? item.dataset.x ?? null;
const isVideo = (file) => file.type.startsWith('video/') || (!file.type && VIDEO_EXT.test(file.name));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const pad = (n) => String(n).padStart(2, '0');
const formatTime = (s) => { const t = Math.max(0, Math.round(s)); return `${Math.floor(t / 60)}:${pad(t % 60)}`; };
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

  const openBtn = $('dsOpenPanel');
  const panel = $('dsPanel');
  const panelTitle = $('dsPanelTitle');
  const version = $('dsVersion');
  const drop = $('dsDrop');
  const input = $('dsInput');
  const preview = $('dsPreview');
  const nameEl = $('dsName');
  const changeBtn = $('dsChange');
  const video = $('dsVideo');
  const infoDuration = $('dsInfoDuration');
  const infoRange = $('dsInfoRange');
  const status = $('dsStatus');
  const progressWrap = $('dsProgressWrap');
  const progressBar = $('dsProgressBar');
  const progressFill = $('dsProgressFill');
  const resultBox = $('dsResult');
  const resultVideo = $('dsResultVideo');
  const downloadLink = $('dsDownload');
  const actions = $('dsActions');
  const cancelBtn = $('dsCancel');
  const processBtn = $('dsProcess');

  version.textContent = `v${DEPTHSTYLE_VERSION}`;

  const state = { file: null, url: null, duration: 0, token: 0 };
  let job = null;                       // conversión en curso: { controller }
  let resultUrl = null;                 // object URL del MP4 convertido

  function setStatus(text, kind = '') {
    status.textContent = text;
    status.className = 'status' + (kind ? ` is-${kind}` : '');
  }

  /* ----- Navegación ----- */

  function showDepthstyle() {
    if (mobile.matches && menu.isOpen()) menu.close();   // en el móvil el menú se superpone: se aparta
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
  });

  /* ----- Panel Crear proyecto ----- */

  openBtn.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      panelTitle.focus({ preventScroll: true });
    }
  });

  /* ----- Elegir el video ----- */

  changeBtn.addEventListener('click', () => input.click());

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.value = '';                   // permite volver a elegir el mismo archivo
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
    if (job) return;                    // mientras convierte no se cambia de archivo
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
    video.load();                       // suelta el archivo sin provocar un error de red
    if (state.url) URL.revokeObjectURL(state.url);
    state.url = null;
  }

  function showPreview(on) {
    preview.hidden = !on;
    drop.hidden = on;
    actions.hidden = !on;
  }

  function loadVideo(file) {
    clearResult();
    releaseVideo();
    state.file = file;
    state.duration = 0;
    const token = ++state.token;        // si se elige otro archivo mientras se lee, la lectura vieja se descarta
    processBtn.disabled = true;
    setStatus('Leyendo el video…', 'busy');

    state.url = URL.createObjectURL(file);
    video.onloadedmetadata = () => onMetadata(file, token);
    video.onerror = () => { if (token === state.token) onVideoError(); };   // antes de `src`: no se pierde ningún evento
    video.src = state.url;
  }

  function onVideoError() {
    releaseVideo();
    state.file = null;
    showPreview(false);
    setStatus('No se pudo leer este video. Prueba con un archivo MP4 o WebM.', 'error');
  }

  function onMetadata(file, token) {
    if (token !== state.token) return;
    if (!Number.isFinite(video.duration) || video.duration <= 0) { onVideoError(); return; }

    const fileName = document.createElement('span');
    fileName.className = 'file-name-text';
    fileName.textContent = file.name;
    nameEl.replaceChildren(fileName);   // el nombre se recorta con «…»
    state.duration = video.duration;
    const seconds = Math.min(state.duration, MAX_SECONDS);

    infoDuration.textContent = formatTime(state.duration);
    infoRange.textContent = `0:00 – ${formatTime(seconds)}`;
    showPreview(true);
    processBtn.disabled = false;
    setStatus(state.duration > MAX_SECONDS
      ? `El video dura más de ${MAX_SECONDS} s: se convertirán los primeros ${MAX_SECONDS} s.`
      : 'Listo para convertir.');
  }

  /* ----- Procesar ----- */

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

  function setBusy(busy) {
    processBtn.disabled = busy || !state.file;
    cancelBtn.textContent = busy ? 'Cancelar conversión' : 'Cancelar';
    changeBtn.disabled = busy;
  }

  async function process() {
    if (job || !state.file || !state.url) return;
    const end = Math.min(state.duration, MAX_SECONDS);

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
        start: 0,
        end,
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

      resultUrl = URL.createObjectURL(blob);
      resultVideo.src = resultUrl;
      downloadLink.href = resultUrl;
      resultBox.hidden = false;
      showProgress(null);
      setStatus(`Listo: DepthStyle de ${Math.round(end)} s${outFps ? ` a ${outFps} fps` : ''} (sin sonido).`, 'ok');
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

  /** Cancela la conversión en curso, o si no hay ninguna, quita el video y vuelve a la zona de carga. */
  cancelBtn.addEventListener('click', () => {
    if (job) { job.controller.abort(); return; }
    releaseVideo();
    clearResult();
    showProgress(null);
    state.file = null;
    state.duration = 0;
    showPreview(false);
    processBtn.disabled = true;
    setStatus('');
    // Cierra el panel cuando se cancela
    panel.hidden = true;
  });
}
