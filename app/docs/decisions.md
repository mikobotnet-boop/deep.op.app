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

**Decisión.** Clase `preload` en `<html>` + doble `requestAnimationFrame` (ver `animation-rules.md`, sección 6).

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

## Pendiente / deuda conocida

- **Menú duplicado en el HTML.** La barra de iconos y el drawer repiten la misma lista de ítems (como en el original). Cuando la navegación sea real, conviene generarla desde un único arreglo de datos.
- **Selección de ítems.** El original no cambia el ítem activo al hacer clic, y esta versión mantiene ese comportamiento. El CSS ya está preparado: el indicador del dock y el fondo de `.item.on` se animan en cuanto una clase cambie.
- **Submenú "Actividad".** Tiene `aria-expanded="true"` y un chevron, pero no se pliega. Sin cambios respecto al original.
