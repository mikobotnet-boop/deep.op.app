# Deep Op

Interfaz de navegación de Deep Op: pantalla de inicio animada, barra de iconos (*rail*), menú completo (*drawer*), tirador (*handle*) y barra inferior (*dock*). HTML, CSS y JavaScript puros, sin dependencias ni paso de compilación, con animaciones pensadas para 60 FPS.

## Ejecutar en local

La app usa módulos ES y un sprite SVG externo, así que **no funciona con doble clic** sobre `index.html` (`file://`). Sirve la carpeta con cualquier servidor estático:

```bash
# Python (viene instalado en macOS y Linux)
python3 -m http.server 8080

# o con Node
npx serve .
```

Después abre <http://localhost:8080>.

## Estructura

```
app/
├─ index.html              solo el esqueleto, sin estilos ni lógica
├─ manifest.webmanifest    datos de la app instalable: nombre, iconos, colores
├─ sw.js                   service worker: copia sin conexión (debe estar junto a index.html)
├─ src/
│  ├─ styles/
│  │  ├─ tokens.css        colores, medidas, tiempos y curvas de animación
│  │  ├─ base.css          reinicio, tipografía, foco
│  │  ├─ layout.css        marco, panel redondeado, arranque
│  │  ├─ motion.css        animaciones (fase 2, prescindible)
│  │  └─ components/
│  │     ├─ nav-items.css  ítems, grupos, insignia (compartido por rail y drawer)
│  │     ├─ rail.css       barra de iconos
│  │     ├─ drawer.css     menú completo
│  │     ├─ handle.css     tirador que abre/cierra el menú
│  │     ├─ dock.css       barra inferior
│  │     ├─ home.css       página principal (carrusel, crear proyecto, recorte, overlays)
│  │     └─ intro.css      pantalla de inicio (logotipo, botones, formulario)
│  ├─ scripts/
│  │  ├─ main.js           punto de entrada
│  │  ├─ menu.js           abrir / cerrar
│  │  ├─ nav.js            ítem activo en el menú y en la barra inferior
│  │  ├─ home.js           página principal: carrusel, recorte de video, overlays
│  │  ├─ intro.js          pantalla de inicio: animación, Continuar / Iniciar sesión, salida
│  │  ├─ session.js        sesión del usuario (local por ahora)
│  │  ├─ storage.js        localStorage seguro
│  │  └─ pwa.js            registro del service worker
│  ├─ media/               video del carrusel (webm + mp4) y su póster
│  ├─ overlays/            aquí se suben las imágenes de overlays (ver su README)
│  └─ icons/
│     ├─ icons.svg         todos los iconos de la interfaz en un solo archivo
│     └─ app/              iconos de la app instalada (192, 512, maskable, apple-touch, favicon)
├─ docs/
│  ├─ decisions.md         decisiones de arquitectura y deuda conocida
│  └─ animation-rules.md   reglas de animación y cómo medir los 60 FPS
└─ README.md
```

El orden de las hojas de estilo en `index.html` importa: de lo más global (`tokens`) a lo más específico (`components`) y, al final, `motion`.

## Convenciones

- **Valores solo en `tokens.css`.** Colores, medidas, duraciones y curvas se definen allí; el resto los consume con `var(--…)`.
- **Un archivo por pieza** en `components/`. Una pieza nueva = un archivo nuevo + su `<link>` en `index.html`.
- **Estado final en el componente, movimiento en `motion.css`.** Los componentes no llevan `transition` ni `animation`.
- **Solo `transform` y `opacity` se animan.** Detalle en [`docs/animation-rules.md`](docs/animation-rules.md).
- **Iconos nuevos:** añadir un `<symbol id="i-nombre">` a `icons.svg` con trazos en `currentColor`.

## Accesibilidad

- Si el sistema tiene activado "reducir movimiento", la app funciona igual pero sin desplazamientos ni animación continua; solo quedan fundidos cortos (pantalla de inicio → interfaz, cambio de ítem activo). El logotipo de la pantalla de inicio aparece ya completo.
- El menú cerrado no recibe foco (`inert`) y los lectores de pantalla no lo leen.
- En pantallas pequeñas el menú arranca cerrado y `Escape` lo cierra.
- El foco siempre es visible con el teclado.

## Página principal

Es lo primero que se ve al entrar (`home.js` + `home.css`, dentro del panel):

- **Carrusel.** Un video corto sin sonido y en bucle (`src/media/`), con el texto de novedades. En pantallas estrechas el texto va debajo del video para no taparlo. Se detiene con «reducir movimiento» (se ve el póster) y cuando no está a la vista. El desenfoque y el velo claro están incorporados en el propio video, así que no hay ningún filtro en vivo: es lo que mantiene los 60 FPS.
- **Crear nuevo proyecto** (también con el botón **+** de la barra inferior). Elige un video (tocando, con teclado o arrastrándolo), recorta un fragmento de hasta 60 s con dos tiradores (dedo, ratón o teclado: flechas ±1 s, Mayús ±5 s, RePág/AvPág ±10 s, Inicio/Fin) y la vista previa solo reproduce ese fragmento.
- **«Procesar video» convierte a DepthStyle en tu dispositivo** (`src/depthstyle/`, sin servidor). Cada fotograma pasa por el modelo Depth Anything V2 small (transformers.js; WebGPU si existe, si no WASM), se normaliza con memoria entre fotogramas (sin parpadeo), se pasa a gris (cercano oscuro, lejano claro y con niebla) y se codifica en un MP4 H.264 con WebCodecs + mp4-muxer. Hay barra de progreso, tiempo restante, botón para cancelar y, al terminar, vista previa y descarga. El MP4 sale sin sonido y a 720p como máximo. La primera vez se descarga el modelo (≈27–50 MB, queda en la caché del navegador) y las librerías se cargan de jsDelivr: esa primera conversión necesita conexión. Sin GPU va a 12 fps de profundidad y es bastante más lenta.
- **Overlays.** La fila de 5 casillas espera las imágenes: súbelas a `src/overlays/` con los nombres `overlay-1.jpg` … `overlay-5.jpg` (ver el README de esa carpeta). Mientras no estén, cada casilla muestra su número. «Explorar Overlays» está desactivado con la nota *Próximamente*.

## Pantalla de inicio y sesión

Al abrir la app se ve primero la pantalla de inicio (`intro.js` + `intro.css`): el logotipo se forma, la bolita se retira y aparece el nombre sobre un fondo de manchas azul y negro.

- **Sin sesión:** al aparecer el logotipo se muestran **Continuar** e **Iniciar sesión**. Continuar entra sin cuenta; Iniciar sesión pide el correo y entra.
- **Con sesión:** no hay botones. Al terminar la animación hace una breve pausa y entra sola.
- **Salida sin corte:** la interfaz empieza a entrar (dock que sube, iconos en cascada) mientras la pantalla de inicio se disuelve; nunca hay un cambio brusco entre las dos.
- Si la intro fallara por cualquier motivo, la app se muestra igualmente (red de seguridad en `main.js` y `layout.css`).

**La sesión es local por ahora.** Deep Op aún no tiene servidor: `session.js` solo comprueba que el correo tenga forma de correo y lo guarda en el dispositivo. No hay contraseña y no protege nada. Cuando exista un servidor, `signIn` en `session.js` es el único punto que cambia. `session.signOut()` ya existe, pero todavía no hay botón que lo use.

## Preferencias guardadas

El estado abierto/cerrado del menú se guarda en `localStorage` (clave `deepop-menu`, solo en escritorio) y la sesión en `deepop-session`. Si el navegador bloquea el almacenamiento, la app sigue funcionando con el valor por defecto (menú abierto); la sesión se mantiene mientras la pestaña siga abierta.

## Instalar como app (PWA)

Deep Op se puede instalar en el móvil o el escritorio y abre sin conexión. Requiere abrirla por **https** (GitHub Pages ya lo es) o `localhost`.

- **Android (Chrome):** abre la dirección → menú ⋮ → **Instalar aplicación** (o *Añadir a la pantalla de inicio*). Si no aparece, recarga la página una vez y vuelve a abrir el menú.
- **iPhone (Safari):** botón Compartir → **Añadir a pantalla de inicio**.
- **Escritorio (Chrome/Edge):** icono de instalar en la barra de direcciones.

Piezas que lo hacen posible: `manifest.webmanifest` (nombre, iconos, colores), `sw.js` (copia sin conexión) y `src/icons/app/`. Todas las rutas son relativas, así que funciona tanto en `.../repositorio/app/` como en la raíz del sitio.

**Actualizaciones.** Con conexión, la app siempre carga la última versión publicada y renueva su copia; sin conexión usa la copia. Si añades o renombras archivos, actualiza la lista `PRECACHE` de `sw.js` y sube `VERSION` (`v2` → `v3`).

## Publicar en GitHub Pages

No hay nada que compilar: en *Settings → Pages* elige la rama y la carpeta que contenga `index.html`. Las rutas son relativas, así que funciona también bajo `usuario.github.io/repositorio/`.
