/**
 * catalog.js — pantalla «Overlays»: catálogo con búsqueda, categorías y hoja de detalle.
 *
 *  - Navegación: la pantalla ocupa el lugar de la página principal (ambas viven en `.stage`; se
 *    alterna con `hidden`). Se abre con el ítem «Overlays» del menú o con «Explorar Overlays»;
 *    «Inicio» (menú) y la pestaña Inicio del dock vuelven a la página principal.
 *  - Datos: `src/overlays/catalog.json` (ver el README de esa carpeta). Se pide la primera vez que
 *    se abre la pantalla, no al arrancar la app. `base` permite apuntar los archivos a otro sitio
 *    (por ejemplo, otro repositorio de GitHub Pages) sin tocar el código.
 *  - Lista: PAGE_SIZE tarjetas por página, con botones Anterior / Siguiente. 100 overlays o 1000
 *    cuestan lo mismo al abrir: solo se preparan las 10 de la página que se ve.
 *  - Vista previa: si el overlay no trae miniatura (`thumb`), la tarjeta pide solo el principio del
 *    video (preload="metadata" + un salto al segundo 0,1), pinta ese primer cuadro en un <canvas> y
 *    suelta el video: queda una imagen fija, sin ningún video vivo gastando red ni decodificador.
 *    Se piden pocas a la vez (CONCURRENCY). Al cambiar de página, o al salir del catálogo, se cancela
 *    todo lo pendiente de la página anterior. Los cuadros ya obtenidos se guardan en memoria (los
 *    últimos FRAME_CACHE), así que volver a una página vista es instantáneo y no descarga nada.
 *  - Detalle: hoja inferior (<dialog>) con el video completo (se descarga mientras se reproduce)
 *    y la descarga del overlay.
 *
 * Todo el texto del catálogo se inserta con textContent (nunca como HTML).
 */

const CATALOG_URL = new URL('../overlays/catalog.json', import.meta.url);
const PAGE_SIZE = 10;                     // overlays por página (par: la cuadrícula del móvil es de 2 columnas)
const CONCURRENCY = 4;                    // vistas previas que se piden a la vez
const PREVIEW_TIMEOUT_MS = 12000;         // si un video no da su primer cuadro en este tiempo, se abandona
const FRAME_W = 400;                      // tamaño del cuadro guardado (16:9): cubre una tarjeta a 3× de densidad
const FRAME_H = 225;
const FRAME_CACHE = 30;                   // cuadros que se guardan en memoria (3 páginas)
const ALL = 'Todos';
const MOBILE_QUERY = '(max-width: 760px)';   // debe coincidir con menu.js

const nameOf = (item) => item.dataset.tip ?? item.dataset.x ?? null;

/** 5 → «0:05»; 75 → «1:15». */
function formatDuration(seconds) {
  const t = Math.max(0, Math.round(seconds));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/** Minúsculas y sin tildes: «neon» encuentra «Glitch neón». */
const normalize = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

export function initCatalog({ app, menu, nav }) {
  const home = app.querySelector('#home');
  const root = app.querySelector('#catalog');
  if (!home || !root) return null;

  const $ = (id) => root.querySelector(`#${id}`);
  const title = $('catalogTitle');
  const count = $('catalogCount');
  const searchBtn = $('catalogSearchBtn');
  const search = $('catalogSearch');
  const chipsEl = $('catalogChips');
  const grid = $('catalogGrid');
  const empty = $('catalogEmpty');
  const errorBox = $('catalogError');
  const pager = $('catalogPager');
  const pagerInfo = $('pagerInfo');
  const pagerPrev = $('pagerPrev');
  const pagerNext = $('pagerNext');

  const mobile = window.matchMedia(MOBILE_QUERY);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Entrada escalonada de los bloques (la regla está en motion.css)
  [...root.querySelector('.catalog-inner').children].forEach((el, i) => el.style.setProperty('--i', i));

  const state = { phase: 'idle', items: [], category: ALL, query: '', page: 0 };

  /* =========================================================
     Navegación entre la página principal y el catálogo
     ========================================================= */

  function showCatalog() {
    if (mobile.matches && menu.isOpen()) menu.close();   // en el móvil el menú se superpone: se aparta
    if (!root.hidden) return;
    home.hidden = true;
    root.hidden = false;
    root.scrollTop = 0;
    title.focus({ preventScroll: true });
    if (state.phase === 'idle' || state.phase === 'error') load();
  }

  function showHome() {
    if (mobile.matches && menu.isOpen()) menu.close();
    if (root.hidden) return;
    cancelPreviews();                       // fuera del catálogo no queda ninguna descarga en marcha
    root.hidden = true;
    home.hidden = false;
  }

  // En fase de captura, para que la página principal ya esté visible cuando otros botones
  // (como «+», que abre el panel de proyecto) busquen sus elementos.
  app.addEventListener('click', (e) => {
    const item = e.target.closest('.item');
    if (item) {
      const name = nameOf(item);
      if (name === 'Overlays') showCatalog();
      else if (name === 'Inicio') showHome();
      return;
    }
    if (e.target.closest('.dock .add')) { showHome(); return; }
    const tab = e.target.closest('.dock .tab');
    if (tab && tab.getAttribute('aria-label') === 'Inicio') {
      nav.selectItem('Inicio');
      showHome();
    }
  }, true);

  app.querySelector('#exploreOverlays')?.addEventListener('click', () => {
    nav.selectItem('Overlays');
    showCatalog();
  });

  /* =========================================================
     Datos
     ========================================================= */

  async function load() {
    state.phase = 'loading';
    errorBox.hidden = true;
    count.textContent = 'Cargando…';
    try {
      const res = await fetch(CATALOG_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const base = new URL(data.base || '.', CATALOG_URL);   // rutas relativas: respecto a catalog.json o a `base`
      const resolve = (path) => (typeof path === 'string' && path ? new URL(path, base).href : null);

      state.items = (Array.isArray(data.items) ? data.items : [])
        .filter((o) => o && typeof o.name === 'string' && o.name.trim())
        .map((o, i) => ({
          n: i + 1,
          name: o.name.trim(),
          category: typeof o.category === 'string' && o.category.trim() ? o.category.trim() : 'Otros',
          duration: Number.isFinite(o.duration) ? o.duration : 0,
          isNew: o.new === true,
          thumbUrl: resolve(o.thumb),
          videoUrl: resolve(o.video),
        }));
      state.phase = 'ready';
      buildChips();
      render();
    } catch (err) {
      console.warn('[catalog] no se pudo cargar:', err);
      state.phase = 'error';
      count.textContent = '';
      grid.replaceChildren();
      empty.hidden = true;
      errorBox.hidden = false;
    }
  }
  $('catalogRetry').addEventListener('click', load);

  /* =========================================================
     Categorías y búsqueda
     ========================================================= */

  function buildChips() {
    const categories = [ALL, ...new Set(state.items.map((o) => o.category))];
    chipsEl.replaceChildren(...categories.map((name) => {
      const chip = make('button', 'chip', name);
      chip.type = 'button';
      chip.setAttribute('aria-pressed', String(name === state.category));
      chip.addEventListener('click', () => {
        state.category = name;
        for (const c of chipsEl.children) c.setAttribute('aria-pressed', String(c === chip));
        render();
      });
      return chip;
    }));
  }

  searchBtn.addEventListener('click', () => {
    const opening = search.hidden;
    search.hidden = !opening;
    searchBtn.setAttribute('aria-expanded', String(opening));
    if (opening) {
      search.focus();
    } else if (state.query) {
      search.value = '';
      state.query = '';
      render();
    }
  });
  search.addEventListener('input', () => {
    state.query = normalize(search.value.trim());
    render();
  });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') searchBtn.click();
  });

  const matches = () => state.items.filter((o) =>
    (state.category === ALL || o.category === state.category) && normalize(o.name).includes(state.query));

  /* =========================================================
     Vistas previas: el primer cuadro de cada video
     ========================================================= */

  const frames = new Map();            // n del overlay → { canvas, duration }; el orden de inserción marca la antigüedad
  const queue = [];                    // trabajos pendientes
  const running = new Set();           // trabajos en curso
  let generation = 0;                  // sube con cada cambio de página: lo que quede de la anterior se descarta

  function remember(o, canvas, duration) {
    frames.delete(o.n);
    frames.set(o.n, { canvas, duration });
    while (frames.size > FRAME_CACHE) frames.delete(frames.keys().next().value);
  }

  const label = (o) =>
    `${o.name}, ${o.category}${o.duration ? ', ' + formatDuration(o.duration) : ''}${o.isNew ? ', nuevo' : ''}`;

  /** Pone el cuadro en la tarjeta y, si el catálogo no traía la duración, usa la del video. */
  function showFrame(card, o, frame) {
    if (!o.duration && frame.duration) o.duration = frame.duration;
    card.thumb.prepend(frame.canvas);
    card.thumb.classList.remove('is-empty');
    if (o.duration && !card.thumb.querySelector('.ov-dur')) card.thumb.append(make('span', 'ov-dur', formatDuration(o.duration)));
    card.btn.setAttribute('aria-label', label(o));
  }

  function cancelPreviews() {
    generation++;
    queue.length = 0;
    for (const job of running) job.stop();
    running.clear();
  }

  function enqueue(job) {
    queue.push({ ...job, gen: generation });
    pump();
  }

  function pump() {
    while (running.size < CONCURRENCY && queue.length) {
      const job = queue.shift();
      if (job.gen === generation) runJob(job);
    }
  }

  function runJob(job) {
    const { o } = job;
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';            // solo cabecera: el navegador pide el resto cuando hace falta el cuadro

    let done = false;
    let timer = 0;
    const handle = { stop };

    function stop() {                      // suelta el archivo sin dejar el video a medias en red ni decodificador
      done = true;
      clearTimeout(timer);
      video.onloadedmetadata = video.onseeked = video.onerror = null;
      video.removeAttribute('src');
      video.load();
    }
    function end(frame) {
      if (done) return;
      stop();
      running.delete(handle);
      if (frame) {
        remember(o, frame.canvas, frame.duration);
        if (job.gen === generation) showFrame(job, o, frame);
      }
      pump();
    }

    video.onloadedmetadata = () => {
      const t = Number.isFinite(video.duration) ? Math.min(0.1, video.duration / 2) : 0.1;
      video.currentTime = t;               // pedir un instante concreto hace que baje solo lo necesario
    };
    video.onseeked = () => {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return end(null);
      const canvas = document.createElement('canvas');
      canvas.width = FRAME_W;
      canvas.height = FRAME_H;
      const scale = Math.max(FRAME_W / vw, FRAME_H / vh);   // recorte centrado, como object-fit: cover
      const sw = FRAME_W / scale;
      const sh = FRAME_H / scale;
      try {
        canvas.getContext('2d').drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, FRAME_W, FRAME_H);
      } catch {
        return end(null);
      }
      end({ canvas, duration: Number.isFinite(video.duration) ? video.duration : 0 });
    };
    video.onerror = () => end(null);
    timer = setTimeout(() => end(null), PREVIEW_TIMEOUT_MS);

    running.add(handle);
    video.src = o.videoUrl;                // sin crossOrigin: pintar el cuadro no necesita CORS (solo impide leer los píxeles)
  }

  /* =========================================================
     Lista por páginas
     ========================================================= */

  function card(o) {
    const li = make('li');
    const btn = make('button', 'ov-card');
    btn.type = 'button';
    btn.setAttribute('aria-label', label(o));

    const thumb = make('span', 'overlay');
    const num = make('span', 'overlay-num', String(o.n));
    num.setAttribute('aria-hidden', 'true');
    thumb.append(num);
    if (o.isNew) thumb.append(make('span', 'ov-new', 'Nuevo'));
    if (o.duration) thumb.append(make('span', 'ov-dur', formatDuration(o.duration)));

    const parts = { btn, thumb };
    if (o.thumbUrl) {                        // miniatura propia: se usa esa imagen
      const img = new Image();
      img.alt = '';
      img.width = 640;
      img.height = 360;
      img.decoding = 'async';
      img.addEventListener('load', () => thumb.classList.remove('is-empty'));
      img.addEventListener('error', () => thumb.classList.add('is-empty'));
      img.src = o.thumbUrl;
      thumb.prepend(img);
    } else {
      thumb.classList.add('is-empty');       // marcador con el número hasta que llegue el primer cuadro del video
      const frame = frames.get(o.n);
      if (frame) showFrame(parts, o, frame);
      else if (o.videoUrl) enqueue({ o, ...parts });
    }

    btn.append(thumb, make('span', 'ov-name', o.name), make('span', 'ov-cat', o.category));
    btn.addEventListener('click', () => openSheet(o));
    li.append(btn);
    return li;
  }

  function render() {                        // cambia el filtro o la búsqueda: vuelve a la primera página
    state.page = 0;
    renderPage();
  }

  function renderPage() {
    cancelPreviews();                        // lo pendiente de la página anterior no se descarga
    const list = matches();
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    state.page = Math.min(state.page, pages - 1);

    grid.replaceChildren(...list.slice(state.page * PAGE_SIZE, (state.page + 1) * PAGE_SIZE).map(card));
    count.textContent = list.length === 1 ? '1 overlay' : `${list.length} overlays`;
    empty.hidden = list.length > 0;
    empty.textContent = state.items.length ? 'No hay overlays con ese nombre.' : 'Todavía no hay overlays.';

    pager.hidden = pages <= 1;               // con una sola página no hace falta
    pagerInfo.textContent = `Página ${state.page + 1} de ${pages}`;
    pagerPrev.disabled = state.page === 0;
    pagerNext.disabled = state.page >= pages - 1;
  }

  function goToPage(page) {
    state.page = page;
    renderPage();
    root.scrollTop = 0;
    title.focus({ preventScroll: true });    // el lector de pantalla anuncia «Página N de M» (role="status")
  }
  pagerPrev.addEventListener('click', () => { if (state.page > 0) goToPage(state.page - 1); });
  pagerNext.addEventListener('click', () => goToPage(state.page + 1));

  /* =========================================================
     Detalle de un overlay
     ========================================================= */

  const sheet = document.getElementById('overlaySheet');
  const preview = document.getElementById('sheetPreview');
  const sheetName = document.getElementById('sheetName');
  const sheetMeta = document.getElementById('sheetMeta');
  const sheetStatus = document.getElementById('sheetStatus');
  const downloadBtn = document.getElementById('sheetDownload');
  let current = null;

  function setSheetStatus(text, isError = false) {
    sheetStatus.textContent = text;
    sheetStatus.className = 'status' + (isError ? ' is-error' : '');
  }

  function openSheet(o) {
    current = o;
    sheetName.textContent = o.name;
    sheetMeta.textContent = o.duration ? `${o.category} · ${formatDuration(o.duration)}` : o.category;

    if (o.videoUrl) {
      // El primer cuadro (ya cargado en la tarjeta) se queda de fondo hasta que el video tenga imagen propia.
      const frame = frames.get(o.n);
      const still = frame ? document.createElement('canvas') : null;
      if (still) {
        still.width = frame.canvas.width;
        still.height = frame.canvas.height;
        still.getContext('2d').drawImage(frame.canvas, 0, 0);
      }

      const video = document.createElement('video');
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.controls = true;
      video.preload = 'auto';               // aquí sí se descarga el video completo, mientras se reproduce
      if (o.thumbUrl) video.poster = o.thumbUrl;
      if (still) {
        video.classList.add('is-loading');
        video.addEventListener('loadeddata', () => video.classList.remove('is-loading'), { once: true });
      }
      video.addEventListener('loadedmetadata', () => {
        if (!o.duration && Number.isFinite(video.duration)) {
          o.duration = video.duration;
          if (current === o) sheetMeta.textContent = `${o.category} · ${formatDuration(o.duration)}`;
        }
      }, { once: true });
      video.addEventListener('error', () => {
        if (current === o) setSheetStatus('No se pudo cargar el video. Revisa tu conexión e inténtalo de nuevo.', true);
      });
      video.src = o.videoUrl;
      preview.replaceChildren(...(still ? [still, video] : [video]));
      if (!reduceMotion.matches) video.play().catch(() => {});
    } else if (o.thumbUrl) {
      const img = new Image();
      img.alt = '';
      img.src = o.thumbUrl;
      img.addEventListener('error', () => preview.replaceChildren(make('span', '', 'Vista previa próximamente')));
      preview.replaceChildren(img);
    } else {
      preview.replaceChildren(make('span', '', 'Vista previa próximamente'));
    }

    downloadBtn.disabled = !o.videoUrl;
    setSheetStatus(o.videoUrl ? '' : 'Este overlay estará disponible para descargar pronto.');
    sheet.showModal();
  }

  function releasePreview() {
    const video = preview.querySelector('video');
    if (video) {                              // suelta el archivo sin provocar un error de red
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    preview.replaceChildren();
  }

  sheet.addEventListener('close', releasePreview);
  document.getElementById('sheetClose').addEventListener('click', () => sheet.close());
  sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });   // clic en el velo

  const slug = (text) => normalize(text).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  downloadBtn.addEventListener('click', async () => {
    const o = current;
    if (!o?.videoUrl) return;
    downloadBtn.disabled = true;
    setSheetStatus('Descargando…');
    try {
      const res = await fetch(o.videoUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const ext = new URL(o.videoUrl).pathname.match(/\.[a-z0-9]+$/i)?.[0] ?? '.webm';
      const link = document.createElement('a');
      link.href = url;
      link.download = `deepop-overlay-${slug(o.name) || o.n}${ext}`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      if (current === o) setSheetStatus('Overlay descargado.');
    } catch (err) {
      console.warn('[catalog] descarga fallida:', err);
      if (current === o) setSheetStatus('No se pudo descargar el overlay. Revisa tu conexión e inténtalo de nuevo.', true);
    } finally {
      if (current === o) downloadBtn.disabled = false;
    }
  });

  return { showCatalog, showHome };
}
