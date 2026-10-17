# Decisiones de arquitectura

Registro breve de las decisiones tomadas al separar el HTML original (un solo archivo) en módulos y al añadir la fase de animación. Cada una indica el motivo, para poder revisarla si cambia el contexto.

## D1. HTML, CSS y JS separados; `index.html` solo con el esqueleto

**Decisión.** `index.html` contiene únicamente marcado semántico, enlaces a hojas de estilo y un `<script type="module">`. Sin estilos ni lógica en línea.

**Motivo.** Cada archivo cambia por una razón distinta (estructura, apariencia, comportamiento). Permite revisiones más pequeñas en GitHub y que el navegador cachee cada archivo por separado.

## D2. Fases: la animación es opcional (`motion.css`)

**Decisión.** Los archivos de componentes definen el estado final de cada pieza (abierto, cerrado, hover) **sin transiciones**. `motion.css` añade todo el movimiento encima.

**Motivo.** Es la "fase 2" del plan: se puede quitar un único `<link>` y la app sigue siendo completamente funcional. También facilita el soporte de `prefers-reduced-motion`, ya que el modo sin movimiento es simplemente el estado base.

## D3. Tokens como única fuente de valores

**Decisión.** Colores, medidas, duraciones y curvas están en `tokens.css`, como variables CSS en `:root`. Los demás archivos no repiten valores.

**Motivo.** Cambiar la identidad visual o el "tacto" de la animación pasa por un único archivo. Los colores sueltos del original (por ejemplo `#17181b`, `#1f2023`) se nombraron por su función.

## D4. Un archivo CSS por pieza, más uno compartido

**Decisión.** `components/` contiene `rail.css`, `drawer.css`, `handle.css`, `dock.css` y `nav-items.css`.

**Motivo.** Los ítems, grupos, etiquetas, punto e insignia se usan tanto en la barra de iconos como en el drawer. Duplicarlos habría creado dos fuentes de verdad; `nav-items.css` es el quinto "componente" y evita eso.

## D5. JavaScript con módulos ES, sin empaquetador

**Decisión.** `main.js` → `menu.js` → `storage.js`, cargados con `<script type="module">`. Sin Vite ni dependencias.

**Motivo.** La app es pequeña y no necesita compilación. Se puede abrir en GitHub Pages tal cual.

**Consecuencia.** Los módulos y el sprite SVG externo no funcionan abriendo `index.html` con doble clic (`file://`); hace falta un servidor local (ver README). Si el proyecto crece, migrar a Vite no exige cambiar el código.

## D6. Un único sprite de iconos

**Decisión.** `src/icons/icons.svg` contiene todos los `<symbol>`, incluido el logotipo. Se usan con `<use href="src/icons/icons.svg#i-nombre">`.

**Motivo.** Una sola petición, cacheable, y el HTML deja de cargar con kilobytes de rutas SVG. Los trazos usan `currentColor`, así el color lo decide el CSS.

## D7. El drawer se oculta con `transform`, no con `display: none`

**Decisión.** Cerrado: `translateX(-100%)` + `visibility: hidden` + atributo `inert`.

**Motivo.** `display: none` no se puede animar. `visibility: hidden` (que cambia al terminar la salida) y `inert` (inmediato) garantizan que el menú cerrado no reciba foco ni lo lean los lectores de pantalla.

## D8. El tirador y el drawer comparten `--drawer-w` expresado en `vw`

**Decisión.** `--drawer-w = min(260px, 100vw − rail − gap − ancho del tirador)`.

**Motivo.** En el original el ancho se calculaba con `100%`. Para mover el tirador con `translateX` ese `%` se resolvería respecto al propio tirador (22 px), no respecto al panel. Con `vw` el valor es el mismo para ambos y el resultado visual es idéntico.

## D9. `localStorage` conserva la clave y la semántica originales

**Decisión.** Clave `deepop-menu`; `'1'` significa "menú cerrado".

**Motivo.** Quien ya usó la versión anterior mantiene su preferencia. La semántica es poco intuitiva, pero cambiarla borraría preferencias existentes; está documentada en `storage.js`.

## D10. Estado del menú restaurado antes de mostrar la página

**Decisión.** Clase `preload` en `<html>`: `main.js` aplica el estado y solo la quita al entrar desde la pantalla de inicio (ver `animation-rules.md`, secciones 6 y 7). Antes se quitaba tras dos fotogramas (`requestAnimationFrame` doble); ya no hace falta porque la intro da tiempo de sobra.

**Motivo.** Con un script de módulo (diferido) el navegador podría pintar el menú cerrado antes de que el script lo abra, y se vería un salto. Se evita sin necesitar un script bloqueante en el `<head>`.

## D11. El resaltado del tirador usa una clase, no `:hover`

**Decisión.** `menu.js` marca el tirador con `.is-hot` (`pointerenter` / `pointerleave`) y, al terminar el movimiento, comprueba con `document.elementFromPoint` si el cursor sigue encima.

**Motivo.** En el original el tirador se movía cambiando `left`, lo que provoca layout y el navegador recalcula `:hover`. Al pasar a `transform` (necesario para los 60 FPS) el navegador **no** recalcula `:hover` cuando el elemento se aleja de un cursor quieto: tras pulsar, el tirador quedaba blanco y alargado en su nueva posición hasta que se movía el ratón. Se detectó al comparar capturas con el original y se comprobó en Chromium.

**Consecuencia.** El efecto de resaltado del tirador necesita JavaScript (el foco con teclado sigue funcionando con `:focus-visible` solo con CSS). Cualquier otro elemento que se mueva con `transform` bajo un cursor quieto tendrá el mismo problema y puede reutilizar esta técnica.

## D12. App instalable (PWA): manifiesto, iconos y service worker "red primero"

**Decisión.** Se añaden `manifest.webmanifest`, `sw.js`, `src/scripts/pwa.js` e iconos en `src/icons/app/`. El service worker pide siempre la red primero y usa su copia solo si no hay conexión o la red tarda más de 4 s.

**Motivo.** Sin manifiesto con iconos de 192 y 512 px y sin service worker, Chrome en Android responde "This app cannot be installed" y solo permite crear un acceso directo. "Red primero" garantiza que, mientras la app se sigue desarrollando, cada despliegue se ve en la siguiente visita; una estrategia "copia primero" mostraría versiones antiguas hasta recargar dos veces.

**Detalles.**
- Todas las rutas son relativas (`start_url: "./"`, `scope: "./"`; `pwa.js` calcula la ruta de `sw.js` desde el propio módulo), por lo que funciona en `usuario.github.io/repo/app/` y también si la app pasa a la raíz del sitio.
- `sw.js` debe vivir en la raíz de la app: su alcance es su carpeta.
- El icono *maskable* lleva el logotipo dentro de la zona segura (círculo central del 80 %) para que Android pueda recortarlo en círculo o cuadrado sin cortarlo.
- Las fuentes de Google no pasan por el service worker; sin conexión se usa la tipografía del sistema.
- Comprobado en Chromium con `Page.getInstallabilityErrors` (sin errores), registro y activación del service worker, y recarga sin conexión.

## D13. Pantalla de inicio (intro) por encima de la app, con salida en fundido

**Decisión.** `<section id="intro">` va después de la app en `index.html`, fija a pantalla completa. `intro.js` mueve el fondo (4 manchas con `transform`) y el logotipo (atributos de un SVG) en un único bucle `requestAnimationFrame`. La app está `inert` y con `preload` hasta que se entra; al entrar, `main.js` quita `preload` **a la vez** que la intro empieza a disolverse (`.is-leaving`).

**Motivo.** Si la intro se quitara primero y la app apareciera después, o al revés, habría un instante de corte. Con las dos cosas a la vez, la interfaz hace su entrada normal (dock que sube, iconos en cascada) debajo de una intro que se desvanece, y el cambio es continuo. En el primer fotograma de la salida el logotipo y los botones ya se están apagando (320 ms) y el fondo tarda un poco más (700 ms).

**Excepción a la regla de "solo transform y opacity".** El logotipo cambia de forma (la bolita se estira al retirarse), así que sus atributos SVG se actualizan por fotograma. Es un SVG de ~240 px que vive unos 4 s y se elimina del DOM al salir; el fondo y la salida sí cumplen la regla.

**Detalles.**
- `intro.js` y `intro.css` no se tocan desde fuera: lo único que sabe `main.js` es `initIntro({ onEnter })`. Si `initIntro` lanza, `main.js` elimina la intro y muestra la app.
- Si `main.js` ni siquiera llega a ejecutarse (por ejemplo, un módulo que no carga), `layout.css` oculta la intro y muestra la app a los 1,5 s.
- La intro se elimina del DOM al terminar (`transitionend` + temporizador de seguridad), liberando el bucle y las capas de GPU.
- Con "reducir movimiento" (`RESPECT_REDUCED_MOTION = true` en `intro.js`) el logotipo aparece completo, el fondo queda fijo y la salida es un fundido corto. Si se quisiera que la animación del logotipo se reproduzca siempre, basta poner esa constante en `false`.

## D14. Sesión local (`session.js`), preparada para un servidor

**Decisión.** `session.js` expone `isSignedIn()`, `user()`, `signIn({ email })` y `signOut()`. Guarda `{ email, since }` en `localStorage` (`deepop-session`), con respaldo en memoria si el almacenamiento está bloqueado.

**Motivo.** El diseño pide que quien ya inició sesión no vea botones. Sin servidor no se puede verificar a nadie, así que la sesión es solo una marca local: **no es seguridad**. Mantener `signIn` como única función que cambiaría con un servidor evita tocar el resto de la app.

**Continuar no crea sesión.** Quien pulsa Continuar vuelve a ver la pantalla con botones la próxima vez.

## D15. Ítem activo en `nav.js`; el CSS ya estaba preparado

**Decisión.** Un único listener delegado en `.app`. Menú: al elegir un ítem se marca en la barra de iconos **y** en el drawer (se emparejan por `data-tip` / `data-x`). Barra inferior: independiente del menú; el botón central `+` es una acción y no se marca. Se mantiene `aria-current="page"` junto a la clase `.on`.

**Motivo.** El indicador del dock y el fondo de `.item.on` ya se animaban en cuanto cambiara la clase, así que no hubo que tocar el CSS de los componentes. Con movimiento reducido el cambio es un fundido de color (bloque `reduce` de `motion.css`).

**Todavía no navega.** Cambia qué ítem se ve como activo, pero no hay pantallas detrás; eso queda para cuando la navegación sea real.

## D16. Página principal en el panel, con el hueco del menú reservado

**Decisión.** El contenido (`.home`) es una capa que se desplaza por dentro del panel, por debajo del drawer, del tirador y del dock. En escritorio, donde el menú empieza abierto, el hueco que ocupa (`--drawer-w` + tirador) está **reservado siempre en el padding**; con el menú cerrado el contenido se desplaza media anchura del menú con `translate` para quedar centrado. En móvil el menú se superpone.

**Motivo.** Con el menú abierto en escritorio, un contenido a pantalla completa queda tapado por el menú (se comprobó: los tiradores del recorte caían debajo). La salida obvia —animar `padding-left`— obliga al navegador a recalcular el layout (y a redimensionar el video) en cada fotograma, lo que va contra la regla de «solo transform y opacity». Reservando el hueco, el contenido **nunca cambia de tamaño** y solo se mueve con `translate`, con los mismos tiempos y curva que el drawer.

**Consecuencia.** Con el menú cerrado el contenido es algo más estrecho de lo que podría ser (el ancho es siempre el del caso «menú abierto»). Es el precio de no animar el layout.

## D17. Carrusel como video, sin filtros en vivo

**Decisión.** El GIF original (5,9 MB, desenfoque `backdrop-filter` y velo claro encima) se convirtió con `ffmpeg` a `hero.webm` (74 KB) y `hero.mp4` (124 KB), con el desenfoque y el velo ya aplicados, más un póster `hero-poster.jpg`. Sin sonido, en bucle, `playsinline`.

**Motivo.** Un GIF de 5,9 MB es mucho para un móvil y no se puede pausar. Un `backdrop-filter` sobre una animación obliga a recalcular el desenfoque en cada fotograma, que es justo lo que los 60 FPS no perdonan. Incorporar el efecto al video da el mismo aspecto sin ese coste.

**Detalles.**
- WebM primero (más ligero), MP4 de respaldo (Safari). Solo el póster está en `PRECACHE`; sin conexión se ve el póster.
- `sw.js` no intercepta las peticiones con cabecera `Range` (el navegador pide los videos por tramos y la caché no admite respuestas parciales) y solo guarda respuestas completas (`status === 200`).
- `home.js` detiene el video con «reducir movimiento» y cuando sale de pantalla.

## D18. Recorte de video y conversión a DepthStyle en el dispositivo

**Decisión.** El recorte de hasta 60 s es real (selección, vista previa solo del fragmento, validación del límite). «Procesar video» convierte el fragmento a DepthStyle **en el propio dispositivo** (`src/depthstyle/`): estimación de profundidad con Depth Anything V2 small, aspecto gris con niebla, MP4 con WebCodecs. No hay servidor, así que el video no sale del teléfono.

**Motivo.** Encaja con GitHub Pages y la PWA, sin costes ni backend. La versión inicial simulaba un progreso falso; ahora el progreso es el real (fotogramas convertidos) y los fallos se muestran tal cual.

**Detalles.** Las librerías y el modelo se cargan solo al pulsar «Procesar» (`import()` dinámico), así que no pesan al abrir la app. Sin WebGPU se usa WASM (menor resolución y profundidad calculada solo en algunos fotogramas, interpolando el resto). La salida va a los fps del video original, con tope de 30 (se miden en `fps.js`). El modelo corre en un worker (`worker.js`) para no congelar la pantalla; hay tiempos máximos (120 s sin señales del modelo, 90 s por fotograma) y errores en español. El panel muestra la versión de DepthStyle (`v1.0.1`) y, durante la conversión, el modo (GPU/CPU) y los segundos por fotograma. Decisión: las librerías de jsDelivr NO se guardan en el service worker (evita meter decenas de MB en caché); la primera conversión requiere internet. El mapa se suaviza en el tiempo (`TEMPORAL_MIX`) y el rango min/máx se adapta despacio (`RANGE_MIX`) para evitar parpadeo; ambos y el aspecto (`DEPTH_GAMMA`, `FOG_FLOOR`) están en la cabecera de `src/depthstyle/config.js`. Los tiradores del recorte son `role="slider"` con teclado y zona táctil de 44 px. La URL del video y la del resultado se liberan al cambiar de archivo o cancelar. jsDelivr es otro dominio, así que el service worker no lo guarda: lo cachea el navegador.

## D19. Nombre: «Deep Op»

**Decisión.** El nombre se escribe «Deep Op» en toda la app, el manifiesto y la documentación. Los identificadores técnicos (`deepop-menu`, `deepop-session`, el nombre de la caché del service worker y el repositorio `deep.op.app`) no cambian, para no borrar preferencias ni sesiones existentes.

## D20. Catálogo de overlays: pantalla propia y lista en un JSON

**Decisión.** El ítem «Proyectos» del menú pasa a llamarse **Overlays** y abre el catálogo (`src/scripts/catalog.js`, `catalog.css`). La pantalla ocupa el lugar de la página principal (ambas viven en el panel y se alternan con `hidden`); «Inicio», la pestaña Inicio y el botón **+** vuelven a la principal. «Explorar Overlays» también la abre. La lista sale de `src/overlays/catalog.json`, con una dirección `base` opcional.

**Motivo.** Hay 100 overlays en 1080p y la cifra crecerá con las actualizaciones: añadir uno debe ser añadir una línea al JSON, sin tocar código ni `PRECACHE`. Los videos no se guardan en el repo de la app sino en otro, `mikobotnet-boop/Deep-Op-Overlays` (carpeta `videos/`), publicado con GitHub Pages: gratis, sin tarjeta y en el mismo origen que la app, así que no hace falta CORS. `base` apunta allí y cambiarlo mueve todo el catálogo. El service worker ignora lo que queda fuera de su alcance, por lo que esos videos no llenan la copia sin conexión. Solo hay una calidad (1080p); sin miniaturas aparte.

**Detalles.** Cuadrícula de 2 columnas con tarjetas 16:9, en **páginas de 10** (`PAGE_SIZE`) con botones Anterior / Siguiente y «Página N de M» abajo a la izquierda, al final de la lista y dentro del flujo (no flotante: así no choca con la barra inferior ni con el tirador del menú); se oculta con una sola página. Cambiar de filtro o buscar vuelve a la página 1. No hay miniaturas aparte: cada tarjeta pide solo el principio de su video (`preload="metadata"` y un salto al segundo 0,1), pinta ese primer cuadro en un `<canvas>` de 400×225 y suelta el video, así que no queda ningún video vivo gastando red ni decodificador. Máximo 4 a la vez (`CONCURRENCY`) y 12 s de límite por video. Al cambiar de página o salir del catálogo se cancela todo lo pendiente (contador `generation`); los cuadros ya obtenidos se guardan en memoria (los últimos 30) y volver a una página vista no descarga nada. Pintar el cuadro no necesita CORS (el canvas queda «contaminado», solo impide leer los píxeles, que no hacemos). El video completo solo se pide al abrir el detalle, se descarga mientras se reproduce y se suelta al cerrarlo; mientras tanto se ve de fondo el primer cuadro. La duración sale del propio video si el catálogo no la trae. El catálogo se pide la primera vez que se abre la pantalla. Todo el texto del catálogo se inserta con `textContent`. La cabecera es `sticky` con `top: -20px` para compensar el padding de la capa (con `top: 0` Chrome la bajaba 20 px y tapaba la primera fila). Reutiliza `.overlay`, `.btn`, `.status` y los tokens de la app; los dos tokens nuevos son `--badge-media` y `--scrim`.

**Pendiente de este punto.** Los videos de prueba (Deep.op002–008, H.264 con faststart) están en el repo de videos. Falta confirmar con los MP4 reales cuánto baja cada vista previa. Límite a vigilar: GitHub Pages recomienda sitios de hasta 1 GB y el historial de git crece con cada versión de un video; con los 100 videos reales habrá que revisar el tamaño total.

## D21. Tema Oscuro / Claro / Sistema

**Decisión.** Ajustes → Apariencia → Tema con tres opciones. Por defecto **Oscuro** (la app nació oscura); «Sistema» sigue al teléfono y reacciona si cambia con la app abierta. La preferencia se guarda en `deepop-theme` (el valor por defecto no se guarda).

**Cómo.** `theme.js` escribe `<html data-theme="dark|light">` y actualiza `theme-color` y `color-scheme`. `tokens.css` redefine solo valores bajo `:root[data-theme="light"]` (ninguna regla); el resto de CSS ya usaba tokens. Un script mínimo en `index.html` aplica el tema antes del primer pintado para que no parpadee (mismas reglas que `theme.js`). Valores claros tomados del diseño de Ajustes (`#e8e8ee` marco, `#fff` panel, `#f1f1f5` tarjetas, acento `#6a4bf0`), con `--violet-soft` y `--red` oscurecidos para llegar a contraste 4,5:1 como texto.

**Detalles.** La pantalla de inicio (intro) es siempre oscura: es una pieza de marca con fondo propio. Lo que va sobre imagen o video (sombra del hero, insignias, velo de las hojas) sigue oscuro en los dos temas. En pantallas estrechas el texto del carrusel va debajo del video, así que usa `--text`. Nuevos tokens: `--dock-active`, `--hover-soft`, `--shadow-dock`. `manifest.webmanifest` conserva `#000000` (no puede cambiar en tiempo de ejecución).

## D22. Compresor: preparar videos para TikTok en el dispositivo

**Decisión.** El ítem «Analítica» del menú pasa a llamarse **Compresor** y abre una pantalla propia (`compressor.js`, `compressor.css`; el motor vive en `src/compressor/` con versión propia, como DepthStyle). Primera versión mínima: elegir video → analizar → 1080×1920 con fondo desenfocado o recorte → H.264 con bitrate alto → compartir o descargar.

**Motivo.** TikTok recodifica todo lo que recibe y desde Android suele quedar muy comprimido; no se puede evitar, pero sí entregarle un archivo en el formato que mejor lo sobrevive. El plan original era una app Android nativa (Media3, FFmpegKit); Deep Op es una app web, así que se traduce a WebCodecs. Se descartó ffmpeg.wasm (pesa mucho y es lento en un teléfono) y el codificador por software.

**Cómo.** Para cada instante i/fps se busca el fotograma del original y se dibuja en un lienzo 1080×1920 (`frames.js`); eso normaliza el fps variable a constante sin inventar movimiento. El desenfoque del fondo se hace dibujando en un lienzo 12 veces más pequeño y estirándolo (`ctx.filter` es lento). El codec es el primero soportado de High / Main / Baseline H.264 (`config.js`). El MP4 se arma en memoria con mp4-muxer. Compartir es un botón aparte: `navigator.share` exige un toque justo antes y la compresión puede tardar minutos.

**Límites conocidos.** Hasta 120 s (se busca cada fotograma uno a uno). El navegador decide el tone mapping de un video HDR: no hay control fino. Sin exportación en segundo plano. Que TikTok recomprima menos con 4K («truco 4K») es una hipótesis del plan: hay que medirla con pruebas A/B antes de ofrecerla.

**Pendiente.** Probar en un teléfono Android con videos reales (H.264 y AAC no se pudieron probar en el entorno de desarrollo, cuyo Chromium no los trae), perfiles, nitidez y reducción de ruido leves.

## Pendiente / deuda conocida

- **Menú duplicado en el HTML.** La barra de iconos y el drawer repiten la misma lista de ítems (como en el original). Cuando la navegación sea real, conviene generarla desde un único arreglo de datos.
- **Overlays.** Las 5 casillas de la home esperan las imágenes que subirá el propietario a `src/overlays/`. El catálogo (D20) tiene 8 entradas de prueba que apuntan a videos MP4 del repo Deep-Op-Overlays, con nombres provisionales («Overlay 001»…) y categoría «Prueba». Falta subir los 100 videos reales (si necesitan transparencia, WebM con alfa; un MP4 no la tiene) y darles nombre y categoría.
- **Conversión a DepthStyle.** Falta probarla con el modelo real en un teléfono Android (en el entorno de desarrollo no hay acceso a jsDelivr ni a Hugging Face), ajustar el aspecto a la referencia, añadir overlays encima y el audio original.
- **Sesión sin servidor.** `session.js` es local y no hay forma de cerrar sesión desde la interfaz (existe `signOut()`, falta el botón).
- **Submenú "Actividad".** Tiene `aria-expanded="true"` y un chevron, pero no se pliega. Sin cambios respecto al original.
