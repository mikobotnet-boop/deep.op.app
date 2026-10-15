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

**Motivo.** Hay 100 overlays en 1080p y la cifra crecerá con las actualizaciones: añadir uno debe ser añadir una línea al JSON, sin tocar código ni `PRECACHE`. Los archivos pesados no se guardan en el repo de la app: `base` permite apuntarlos a un bucket de almacenamiento de objetos (gratuito y sin tarjeta; GitHub Pages queda descartado para esto). Solo hay una calidad (1080p) más la miniatura.

**Detalles.** Cuadrícula de 2 columnas con tarjetas 16:9 que se desplaza hacia abajo; se pintan 12 tarjetas y se piden más al llegar al final (`IntersectionObserver`), así que 100 o 1000 cuestan lo mismo al abrir. Las imágenes usan `loading="lazy"`; el video de 1080p solo se pide al abrir el detalle y se suelta al cerrarlo. Un solo video activo a la vez. El catálogo se pide la primera vez que se abre la pantalla, no al arrancar. Todo el texto del catálogo se inserta con `textContent`. La cabecera es `sticky` con `top: -20px` para compensar el padding de la capa (con `top: 0` Chrome la bajaba 20 px y tapaba la primera fila). Reutiliza `.overlay`, `.btn`, `.status` y los tokens de la app (texto 14/13 px, títulos 20 px/500, insignias 11 px/600, números con `tabular-nums`); los dos tokens nuevos son `--badge-media` y `--scrim`.

## Pendiente / deuda conocida

- **Menú duplicado en el HTML.** La barra de iconos y el drawer repiten la misma lista de ítems (como en el original). Cuando la navegación sea real, conviene generarla desde un único arreglo de datos.
- **Overlays.** Las 5 casillas de la home esperan las imágenes que subirá el propietario a `src/overlays/`. El catálogo (D20) tiene 8 entradas de ejemplo sin miniatura ni video: falta elegir el bucket de almacenamiento, subir los 100 videos 1080p (WebM con alfa) y sus miniaturas, y rellenar `catalog.json` con `base`, `thumb` y `video`.
- **Conversión a DepthStyle.** Falta probarla con el modelo real en un teléfono Android (en el entorno de desarrollo no hay acceso a jsDelivr ni a Hugging Face), ajustar el aspecto a la referencia, añadir overlays encima y el audio original.
- **Sesión sin servidor.** `session.js` es local y no hay forma de cerrar sesión desde la interfaz (existe `signOut()`, falta el botón).
- **Submenú "Actividad".** Tiene `aria-expanded="true"` y un chevron, pero no se pliega. Sin cambios respecto al original.
