# Deep op

Interfaz de navegación de Deep op: barra de iconos (*rail*), menú completo (*drawer*), tirador (*handle*) y barra inferior (*dock*). HTML, CSS y JavaScript puros, sin dependencias ni paso de compilación, con animaciones pensadas para 60 FPS.

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
│  │     └─ dock.css       barra inferior
│  ├─ scripts/
│  │  ├─ main.js           punto de entrada
│  │  ├─ menu.js           abrir / cerrar
│  │  ├─ storage.js        localStorage seguro
│  │  └─ pwa.js            registro del service worker
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

- Si el sistema tiene activado "reducir movimiento", la app funciona igual pero sin animaciones.
- El menú cerrado no recibe foco (`inert`) y los lectores de pantalla no lo leen.
- En pantallas pequeñas el menú arranca cerrado y `Escape` lo cierra.
- El foco siempre es visible con el teclado.

## Preferencias guardadas

El estado abierto/cerrado del menú se guarda en `localStorage` (clave `deepop-menu`, solo en escritorio). Si el navegador bloquea el almacenamiento, la app sigue funcionando con el valor por defecto (menú abierto).

## Instalar como app (PWA)

Deep op se puede instalar en el móvil o el escritorio y abre sin conexión. Requiere abrirla por **https** (GitHub Pages ya lo es) o `localhost`.

- **Android (Chrome):** abre la dirección → menú ⋮ → **Instalar aplicación** (o *Añadir a la pantalla de inicio*). Si no aparece, recarga la página una vez y vuelve a abrir el menú.
- **iPhone (Safari):** botón Compartir → **Añadir a pantalla de inicio**.
- **Escritorio (Chrome/Edge):** icono de instalar en la barra de direcciones.

Piezas que lo hacen posible: `manifest.webmanifest` (nombre, iconos, colores), `sw.js` (copia sin conexión) y `src/icons/app/`. Todas las rutas son relativas, así que funciona tanto en `.../repositorio/app/` como en la raíz del sitio.

**Actualizaciones.** Con conexión, la app siempre carga la última versión publicada y renueva su copia; sin conexión usa la copia. Si añades o renombras archivos, actualiza la lista `PRECACHE` de `sw.js` y sube `VERSION` (`v1` → `v2`).

## Publicar en GitHub Pages

No hay nada que compilar: en *Settings → Pages* elige la rama y la carpeta que contenga `index.html`. Las rutas son relativas, así que funciona también bajo `usuario.github.io/repositorio/`.
