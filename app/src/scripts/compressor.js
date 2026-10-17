/**
 * compressor.js — pantalla «Compresor»: prepara un video para subirlo a TikTok.
 *
 *  - Navegación: ocupa el lugar de la página principal (ver screens.js). Se abre con el ítem «Compresor»
 *    del menú (antes «Analítica»).
 *  - Flujo: elegir el video → se analiza (tamaño, duración, fps) → elegir el encuadre → «Preparar para TikTok»
 *    → 1080×1920, H.264, fps constantes y bitrate alto, todo en el dispositivo (carpeta src/compressor/) →
 *    vista previa, compartir y descargar.
 *  - El motor se carga solo al elegir un video (`import()` dinámico): no pesa al abrir la app.
 *
 * Todo el texto dinámico se inserta con textContent (nunca como HTML).
 */

import { COMPRESSOR_VERSION } from '../compressor/version.js';
import { MAX_SECONDS, DEFAULT_LAYOUT, OUT_W, OUT_H } from '../compressor/config.js';
import { notifications } from './notify.js';

const MOBILE_QUERY = '(max-width: 760px)';   // debe coincidir con menu.js
const VIDEO_EXT = /\.(mp4|m4v|mov|webm)$/i;   // por si el dispositivo no informa el tipo del archivo

const nameOf = (item) => item.dataset.tip ?? item.dataset.x ?? null;
const isVideo = (file) => file.type.startsWith('video/') || (!file.type && VIDEO_EXT.test(file.name));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const pad = (n) => String(n).padStart(2, '0');

/** 75 → «1:15». */
function formatTime(seconds) {
  const t = Math.max(0, Math.round(seconds));
  return `${Math.floor(t / 60)}:${pad(t % 60)}`;
}

/** Bytes → «12,3 MB». */
function formatMB(bytes) {
  return `${(bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0).replace('.', ',')} MB`;
}

const formatMbps = (bitrate) => `${(bitrate / 1e6).toFixed(1).replace('.', ',')} Mbps`;
const formatEta = (s) => (s < 60 ? `${Math.max(1, Math.round(s))} s` : `${Math.ceil(s / 60)} min`);

/** «Mi video (1).MOV» → «Mi-video-1»: para el nombre del archivo que se descarga. */
function baseName(name) {
  const base = name.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return base || 'video';
}

export function initCompressor({ app, menu, screens }) {
  const root = app.querySelector('#compressor');
  if (!root) return null;

  const $ = (id) => root.querySelector(`#${id}`);
  const title = $('cmpTitle');
  const drop = $('cmpDrop');
  const input = $('cmpInput');
  const preview = $('cmpPreview');
  const video = $('cmpVideo');
  const nameEl = $('cmpName');
  const changeBtn = $('cmpChange');
  const infoOriginal = $('cmpInfoOriginal');
  const infoDuration = $('cmpInfoDuration');
  const infoOutput = $('cmpInfoOutput');
  const layoutSeg = $('cmpLayout');
  const layoutButtons = [...layoutSeg.querySelectorAll('button')];
  const layoutHint = $('cmpLayoutHint');
  const status = $('cmpStatus');
  const progressWrap = $('cmpProgressWrap');
  const progressBar = $('cmpProgressBar');
  const progressFill = $('cmpProgressFill');
  const resultBox = $('cmpResult');
  const resultVideo = $('cmpResultVideo');
  const summary = $('cmpSummary');
  const shareBtn = $('cmpShare');
  const downloadLink = $('cmpDownload');
  const actions = $('cmpActions');
  const cancelBtn = $('cmpCancel');
  const processBtn = $('cmpProcess');
  const mobile = window.matchMedia(MOBILE_QUERY);

  $('cmpVersion').textContent = `v${COMPRESSOR_VERSION}`;
  $('cmpLimit').textContent = `Hasta ${MAX_SECONDS} s.`;

  // Entrada escalonada de los bloques (la regla está en motion.css)
  [...root.querySelector('.compressor-inner').children].forEach((el, i) => el.style.setProperty('--i', i));

  const state = { file: null, url: null, info: null, layout: DEFAULT_LAYOUT, token: 0 };
  let lib = null;            // el motor (src/compressor/index.js), cargado al elegir el primer video
  let job = null;            // compresión en curso: { controller }
  let result = null;         // { url, file }

  function setStatus(text, kind = '') {
    status.textContent = text;
    status.className = 'status' + (kind ? ` is-${kind}` : '');
  }

  /* =========================================================
     Navegación
     ========================================================= */

  function showCompressor() {
    if (mobile.matches && menu.isOpen()) menu.close();   // en el móvil el menú se superpone: se aparta
    screens.show('compressor');
  }

  app.addEventListener('click', (e) => {
    const item = e.target.closest('.item');
    if (item && nameOf(item) === 'Compresor') showCompressor();
  });

  screens.onChange((name) => {
    if (name !== 'compressor') return;
    root.scrollTop = 0;
    title.focus({ preventScroll: true });
  });

  /* =========================================================
     Elegir el video
     ========================================================= */

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
    if (job) return;                      // mientras se comprime no se cambia de archivo
    if (!isVideo(file)) {
      setStatus('El archivo que elegiste no es un video. Prueba con MP4, MOV o WebM.', 'error');
      return;
    }
    loadVideo(file);
  }

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
    state.info = null;
    state.file = file;
    const token = ++state.token;          // si se elige otro archivo mientras se analiza, el análisis viejo se descarta
    processBtn.disabled = true;
    setStatus('Leyendo el video…', 'busy');

    state.url = URL.createObjectURL(file);
    video.onloadedmetadata = () => onMetadata(file, token);
    video.onerror = () => { if (token === state.token) onVideoError(); };   // se asignan antes de `src`: no se pierde ningún evento
    video.src = state.url;
  }

  function onVideoError() {
    releaseVideo();
    state.file = null;
    showPreview(false);
    setStatus('No se pudo leer este video. Prueba con un archivo MP4 o WebM.', 'error');
  }

  function showPreview(on) {
    preview.hidden = !on;
    drop.hidden = on;
    actions.hidden = !on;
  }

  async function onMetadata(file, token) {
    if (token !== state.token) return;
    if (!Number.isFinite(video.duration) || video.duration <= 0) { onVideoError(); return; }

    const fileName = document.createElement('span');
    fileName.className = 'file-name-text';
    fileName.textContent = file.name;
    const fileSize = document.createElement('span');
    fileSize.className = 'file-size';
    fileSize.textContent = `(${formatMB(file.size)})`;
    nameEl.replaceChildren(fileName, fileSize);   // el nombre se recorta con «…»; el tamaño siempre se ve
    for (const el of [infoOriginal, infoDuration, infoOutput]) el.textContent = '—';
    showPreview(true);
    setStatus('Analizando el video…', 'busy');

    try {
      lib ??= await import('../compressor/index.js');
      const info = await lib.analyzeVideo(state.url);
      if (token !== state.token) return;
      state.info = info;
      renderInfo();
      setStatus('Listo para preparar. Elige el encuadre y pulsa «Preparar para TikTok».', 'ok');
      processBtn.disabled = false;
    } catch (err) {
      if (token !== state.token) return;
      setStatus(friendlyError(err), 'error');
    }
  }

  function renderInfo() {
    const { info } = state;
    if (!info || !lib) return;
    infoOriginal.textContent = `${info.width}×${info.height} · ${info.fps} fps`;
    infoDuration.textContent = formatTime(info.duration);
    infoOutput.textContent = `${OUT_W}×${OUT_H} · H.264 · ${info.fps} fps · ≈ ${formatMbps(lib.pickBitrate(info))}`;
  }

  /** Los errores propios del Compresor ya vienen en español; el resto se envuelve. */
  function friendlyError(err) {
    if (err?.name === 'CompressorError') return err.message;
    return `No se pudo preparar el video: ${err?.message || 'error desconocido'}`;
  }

  /* =========================================================
     Encuadre
     ========================================================= */

  const LAYOUT_HINT = {
    blur: 'El video se ve entero, centrado, sobre su propio fondo desenfocado. Un video ya vertical (9:16) llena todo el cuadro.',
    crop: 'El video llena todo el cuadro y se recorta lo que sobra por los lados o por arriba y abajo.',
  };

  function renderLayout() {
    for (const b of layoutButtons) {
      const on = b.dataset.v === state.layout;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;          // un solo tope de tabulación; las flechas mueven la elección
    }
    layoutHint.textContent = LAYOUT_HINT[state.layout];
  }

  function pickLayout(value) {
    if (job || value === state.layout) return;
    state.layout = value;
    clearResult();                        // el resultado anterior ya no corresponde a lo elegido
    renderLayout();
  }

  for (const b of layoutButtons) b.addEventListener('click', () => pickLayout(b.dataset.v));
  layoutSeg.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = layoutButtons[(layoutButtons.indexOf(document.activeElement) + step + layoutButtons.length) % layoutButtons.length];
    pickLayout(next.dataset.v);
    next.focus();
  });
  renderLayout();

  /* =========================================================
     Preparar para TikTok
     ========================================================= */

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
    summary.textContent = '';
    if (result) { URL.revokeObjectURL(result.url); result = null; }
  }

  function setBusy(busy) {
    processBtn.disabled = busy || !state.info;
    cancelBtn.textContent = busy ? 'Cancelar compresión' : 'Cancelar';
    changeBtn.disabled = busy;
    for (const b of layoutButtons) b.disabled = busy;
  }

  function describeResult(out) {
    const parts = [`${out.width}×${out.height}`, `${out.fps} fps`, 'H.264', formatMbps(out.bitrate), formatMB(out.bytes)];
    let text = parts.join(' · ');
    text += out.audio
      ? ' · con sonido (AAC)'
      : ` · sin sonido: ${lib.audioReasonText(out.audioReason)}`;
    return text;
  }

  async function process() {
    if (job || !state.info || !state.file) return;

    video.pause();
    clearResult();
    const controller = new AbortController();
    job = { controller };
    setBusy(true);
    showProgress('wait');
    setStatus('Preparando…', 'busy');

    try {
      lib ??= await import('../compressor/index.js');
      const { blob, info: out } = await lib.compressForTikTok({
        url: state.url,
        file: state.file,
        info: state.info,
        layout: state.layout,
        signal: controller.signal,
        onProgress: (p) => {
          if (job?.controller !== controller) return;
          if (p.phase === 'audio') {
            showProgress('wait');
            setStatus('Preparando el sonido…', 'busy');
          } else if (p.phase === 'frames') {
            showProgress(p.fraction);
            if (p.frame === 0) {
              setStatus(`Procesando los ${p.total} fotogramas…`, 'busy');
            } else {
              const eta = p.etaSeconds !== undefined ? ` · quedan ≈ ${formatEta(p.etaSeconds)}` : '';
              setStatus(`Preparando el video… ${Math.round(p.fraction * 100)} % (${p.frame}/${p.total})${eta}`, 'busy');
            }
          } else {
            showProgress(1);
            setStatus('Guardando el video…', 'busy');
          }
        },
      });

      const name = `deepop-tiktok-${baseName(state.file.name)}.mp4`;
      const file = lib.fileFromBlob(blob, name);
      result = { url: URL.createObjectURL(blob), file };
      resultVideo.src = result.url;
      downloadLink.href = result.url;
      downloadLink.download = name;
      shareBtn.hidden = !lib.canShareFile(file);
      summary.textContent = describeResult(out);
      resultBox.hidden = false;
      showProgress(null);
      setStatus('Listo. Tu video está preparado para TikTok.', 'ok');
      notifications.done('Tu video para TikTok está listo', 'Abre Deep Op para verlo, compartirlo o descargarlo.');   // solo si Ajustes lo permite y la app no está a la vista
    } catch (err) {
      showProgress(null);
      if (err?.name === 'AbortError') {
        setStatus('Compresión cancelada.', 'ok');
      } else {
        setStatus(friendlyError(err), 'error');
        notifications.done('No se pudo preparar el video', 'Abre Deep Op para ver el detalle.');
      }
    } finally {
      job = null;
      setBusy(false);
    }
  }

  processBtn.addEventListener('click', process);

  // Mientras se comprime, «Cancelar» detiene la compresión; si no, descarta el video elegido
  cancelBtn.addEventListener('click', () => {
    if (job) { job.controller.abort(); return; }
    reset();
  });

  function reset() {
    state.token++;                        // descarta cualquier análisis en curso
    clearResult();
    showProgress(null);
    releaseVideo();
    state.file = null;
    state.info = null;
    input.value = '';
    showPreview(false);
    processBtn.disabled = true;
    setStatus('');
  }

  /* =========================================================
     Compartir y descargar
     ========================================================= */

  // navigator.share necesita un toque justo antes: por eso es un botón y no algo automático al terminar
  shareBtn.addEventListener('click', async () => {
    if (!result || !lib) return;
    try {
      await lib.shareFile(result.file);
    } catch {
      setStatus('No se pudo abrir el menú de compartir. Usa «Descargar MP4».', 'error');
    }
  });

  showPreview(false);
  return { open: showCompressor, reset };
}
