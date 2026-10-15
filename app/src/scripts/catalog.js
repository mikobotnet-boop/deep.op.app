/**
 * catalog.js — pantalla «Overlays»: catálogo con búsqueda, categorías y hoja de detalle.
 *
 *  - Navegación: la pantalla ocupa el lugar de la página principal (ambas viven en `.stage`; se
 *    alterna con `hidden`). Se abre con el ítem «Overlays» del menú o con «Explorar Overlays»;
 *    «Inicio» (menú) y la pestaña Inicio del dock vuelven a la página principal.
 *  - Datos: `src/overlays/catalog.json` (ver el README de esa carpeta). Se pide la primera vez que
 *    se abre la pantalla, no al arrancar la app. `base` permite apuntar los archivos a otro sitio
 *    (por ejemplo, un bucket) sin tocar el código.
 *  - Lista: se pinta por tramos de PAGE tarjetas conforme se desplaza, así 100 overlays o 1000
 *    cuestan lo mismo al abrir. Las imágenes se piden solo cuando se acercan a la pantalla.
 *  - Detalle: hoja inferior (<dialog>) con la vista previa y la descarga del overlay.
 *
 * Todo el texto del catálogo se inserta con textContent (nunca como HTML).
 */

const CATALOG_URL = new URL('../overlays/catalog.json', import.meta.url);
const PAGE = 12;                          // tarjetas por tramo (par: la cuadrícula del móvil es de 2 columnas)
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
  const sentinel = $('catalogSentinel');

  const mobile = window.matchMedia(MOBILE_QUERY);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Entrada escalonada de los bloques (la regla está en motion.css)
  [...root.querySelector('.catalog-inner').children].forEach((el, i) => el.style.setProperty('--i', i));

  const state = { phase: 'idle', items: [], category: ALL, query: '', shown: 0 };

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
     Lista por tramos
     ========================================================= */

  function card(o) {
    const li = make('li');
    const btn = make('button', 'ov-card');
    btn.type = 'button';
    btn.setAttribute('aria-label', `${o.name}, ${o.category}, ${formatDuration(o.duration)}${o.isNew ? ', nuevo' : ''}`);

    const thumb = make('span', 'overlay');
    if (o.thumbUrl) {
      const img = new Image();
      img.alt = '';
      img.width = 640;
      img.height = 360;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.addEventListener('load', () => thumb.classList.remove('is-empty'));
      img.addEventListener('error', () => thumb.classList.add('is-empty'));
      img.src = o.thumbUrl;
      thumb.append(img);
    } else {
      thumb.classList.add('is-empty');           // sin miniatura todavía: marcador con el número
    }
    const num = make('span', 'overlay-num', String(o.n));
    num.setAttribute('aria-hidden', 'true');
    thumb.append(num);
    if (o.isNew) thumb.append(make('span', 'ov-new', 'Nuevo'));
    if (o.duration) thumb.append(make('span', 'ov-dur', formatDuration(o.duration)));

    btn.append(thumb, make('span', 'ov-name', o.name), make('span', 'ov-cat', o.category));
    btn.addEventListener('click', () => openSheet(o));
    li.append(btn);
    return li;
  }

  const supportsObserver = 'IntersectionObserver' in window;
  const observer = supportsObserver
    ? new IntersectionObserver(([entry]) => { if (entry.isIntersecting) loadMore(); }, { root, rootMargin: '300px' })
    : null;

  function loadMore() {
    const list = matches();
    const next = supportsObserver ? Math.min(list.length, state.shown + PAGE) : list.length;
    grid.append(...list.slice(state.shown, next).map(card));
    state.shown = next;
    if (!observer) return;
    // Si el centinela sigue a la vista no habrá un nuevo aviso: se vuelve a observar para que lo envíe.
    observer.unobserve(sentinel);
    if (state.shown < list.length) observer.observe(sentinel);
  }

  function render() {
    const list = matches();
    grid.replaceChildren();
    state.shown = 0;
    count.textContent = list.length === 1 ? '1 overlay' : `${list.length} overlays`;
    empty.hidden = list.length > 0;
    empty.textContent = state.items.length ? 'No hay overlays con ese nombre.' : 'Todavía no hay overlays.';
    if (list.length) loadMore();
    else observer?.unobserve(sentinel);
  }

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
      const video = document.createElement('video');
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.controls = true;
      video.preload = 'metadata';
      if (o.thumbUrl) video.poster = o.thumbUrl;
      video.src = o.videoUrl;
      preview.replaceChildren(video);
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
