# Reglas de animación

Todo el movimiento de Deep Op vive en `src/styles/motion.css`. Los tiempos y las curvas viven en `src/styles/tokens.css`. Estas reglas se aplican a cualquier animación nueva.

## 1. Solo `transform` y `opacity`

El navegador tiene tres etapas para dibujar un cambio: **layout → paint → composite**. Para mantener 60 FPS cada fotograma debe caber en **16,6 ms**; las propiedades que obligan a recalcular layout o repintar rara vez lo consiguen en móviles modestos.

| Propiedad | Etapas | ¿Se anima? |
|---|---|---|
| `transform`, `translate`, `scale`, `rotate`, `opacity` | solo composite (GPU) | **Sí** |
| `color`, `background-color`, `border-color` | paint | Solo en elementos diminutos (iconos, ítems) |
| `width`, `height`, `top`, `left`, `margin`, `padding` | layout + paint + composite | **Nunca** |
| `box-shadow`, `filter`, `border-radius` | paint (caro) | **Nunca** animados; se mantienen estáticos |

Consecuencias ya aplicadas en el proyecto:

- El tirador se mueve con `transform: translateX(...)`, no con `left`.
- El tirador crece al pasar el ratón con `scaleY(1.3)`, no con `height`.
- El dock se centra con `margin-inline: auto`, no con `transform`, para dejar `transform` libre.
- El resplandor del botón crear es un `box-shadow` estático; se mueve el botón entero, no la sombra.

- La página principal no anima `padding-left` para apartarse del menú: reserva el hueco y se desplaza con `translate` (ver `decisions.md`, D16). La barra de selección del recorte y la franja azul se mueven con `translate`/`scaleX`, no con `left`/`width`.
- El carrusel es un video con el desenfoque ya incorporado; no se usa `backdrop-filter` ni `filter` sobre una animación.

Se usan las propiedades individuales `translate`, `scale` y `rotate` en vez de `transform` cuando varios efectos conviven en el mismo elemento (por ejemplo, la cascada de entrada y el efecto de pulsar un ítem) para que no se pisen entre sí.

## 2. Duraciones

Definidas como tokens. No se escriben milisegundos sueltos en `motion.css`.

| Token | Valor | Uso |
|---|---|---|
| `--dur-instant` | 100 ms | Respuesta al pulsar (`:active`) |
| `--dur-fast` | 150 ms | Hover, color, foco, tooltips |
| `--dur-base` | 240 ms | Elementos pequeños que aparecen o cambian |
| `--dur-menu-open` | 380 ms | Drawer y tirador al **abrir** |
| `--dur-menu-close` | 260 ms | Drawer y tirador al **cerrar** |
| `--dur-intro` | 560 ms | Entrada inicial de la página |
| `--dur-intro-cta` | 900 ms | Los botones de la pantalla de inicio aparecen despacio |
| `--dur-intro-exit` | 700 ms | La pantalla de inicio se disuelve y deja ver la interfaz |
| `--dur-intro-content` | 320 ms | Logotipo y botones salen antes que el fondo |
| `--dur-fade` | 220 ms | Fundido corto con movimiento reducido |
| `--stagger` | 26 ms | Retardo entre elementos consecutivos de una lista |

**Entrar es más lento que salir.** Una apertura que se toma su tiempo se percibe fluida; un cierre largo se percibe como un retraso. Por eso el cierre dura aproximadamente dos tercios de la apertura.

## 3. Curvas

| Token | Curva | Uso |
|---|---|---|
| `--ease-out` | `cubic-bezier(.22, 1, .36, 1)` | Entradas: arranca rápido y frena suave |
| `--ease-in-out` | `cubic-bezier(.65, 0, .35, 1)` | Salidas |
| `--ease-standard` | `cubic-bezier(.4, 0, .2, 1)` | Cambios de color y opacidad |
| `--ease-spring` | `cubic-bezier(.34, 1.56, .64, 1)` | Rebote leve en pulsaciones e indicadores |

Se evita `linear` (se siente mecánico) y `ease` por defecto del navegador. El rebote de `--ease-spring` solo se usa en elementos pequeños; nunca en paneles grandes.

## 4. Coreografía del menú

Al abrir:

1. El drawer entra con `translateX(-100%) → 0` y el tirador se mueve **a la vez**, con los mismos tiempos y curva, para que parezcan una sola pieza.
2. El contenido del drawer entra en cascada: cada elemento espera `min(--i, 8) × --stagger + 70 ms` y aparece con fundido + desplazamiento de 12 px en `--dur-base`. El tope de 8 pasos evita que una lista larga tarde más en aparecer que el propio panel (con la lista actual, la cascada completa termina en unos 520 ms).
3. La insignia de la barra de iconos desaparece rápido, para no solaparse con el drawer.

Al cerrar:

1. El contenido desaparece enseguida (sin cascada).
2. El drawer y el tirador salen juntos, más rápido que al entrar.
3. La insignia reaparece cuando el drawer ya casi ha salido.

La transición que cuenta es siempre la **del estado de destino**: por eso abrir y cerrar tienen reglas distintas (`.app.open .drawer` y `.drawer`).

## 5. `will-change`

`will-change: transform` reserva memoria de GPU. Dejarlo siempre activo en varios elementos consume memoria sin necesidad.

- `menu.js` añade la clase `is-animating` a `.app` al empezar el movimiento.
- Se quita en `transitionend` del drawer, con un temporizador de seguridad de 700 ms.
- `motion.css` solo aplica `will-change` con esa clase.

## 6. Arranque sin saltos

El estado del menú se restaura de `localStorage`. Para que no se vea el menú abriéndose al cargar la página:

- `<html class="preload">` oculta la app (`visibility: hidden`) y desactiva las transiciones.
- `main.js` aplica el estado del menú nada más arrancar y quita `preload` cuando se entra desde la pantalla de inicio (sección 7). Para entonces el estado ya está aplicado y calculado, así que nada restaurado se anima.
- La entrada inicial (dock que sube, iconos que entran en cascada) empieza cuando se quita `preload`, no antes.
- `preload` solo afecta a la app (`.preload .app`): la pantalla de inicio tiene sus propias transiciones (sección 7).
- Si el script no llegara a cargar (no se añade `js-ready` a `<html>`), a los 1,5 s se oculta la pantalla de inicio y se muestra la app.

## 7. Pantalla de inicio y paso a la interfaz

La intro (`#intro`, fija a pantalla completa) tapa la app hasta que se entra. Para que el paso no sea brusco:

1. Al entrar (Continuar, inicio de sesión o fin de la animación con sesión) pasan **a la vez** dos cosas: `main.js` quita `preload` (la interfaz empieza su entrada habitual) y la intro recibe `.is-leaving`.
2. Primero salen el logotipo y los botones (`--dur-intro-content`, con un leve `scale` de 1 → 1,04) y, justo detrás, el fondo se desvanece (`--dur-intro-exit`, con 80 ms de retardo). Solo `opacity` y `scale`.
3. `visibility` cambia al terminar el fundido, así que la intro no recibe clics ni foco mientras se va (además lleva `inert`).
4. Al terminar (`transitionend`, con un temporizador de seguridad), la intro se elimina del DOM y se detiene el bucle `requestAnimationFrame`.

El fondo y el logotipo los anima `intro.js` fotograma a fotograma: las manchas solo con `transform`; el logotipo cambia atributos de un SVG pequeño (es la única excepción a "solo transform y opacity", ver `decisions.md` D13).

## 8. Accesibilidad

- **Todo el movimiento** (desplazamientos, escalas, rebotes, la animación de la intro) está dentro de `@media (prefers-reduced-motion: no-preference)`. Si se añade un movimiento nuevo, va dentro de ese bloque.
- **El video del carrusel** se detiene con "reducir movimiento" (se ve el póster) y cuando no está a la vista.
- **Con "reducir movimiento" activado** solo hay fundidos cortos (`--dur-fade`, `--dur-fast`) en un bloque `@media (prefers-reduced-motion: reduce)` al final de `motion.css`: la pantalla de inicio se disuelve en lugar de desaparecer de golpe y el ítem activo cambia de color con un fundido. Un cambio de opacidad o de color no es movimiento. Lo que **no** debe haber ahí: `translate`, `scale`, `rotate` ni animaciones continuas. Con movimiento reducido el logotipo aparece ya completo y el fondo queda fijo.
- Los efectos de elevación al pasar el ratón van dentro de `@media (hover: hover)` para que en pantallas táctiles no se queden "pegados" tras tocar.
- El drawer cerrado está fuera de la tabulación: `inert` (inmediato) y `visibility: hidden` (al terminar la salida).

## 9. Cómo comprobar los 60 FPS

1. Abre Chrome DevTools → **Performance** → pulsa grabar → abre y cierra el menú varias veces → detén.
2. En la fila **Frames** no debe haber fotogramas rojos ni amarillos durante el movimiento.
3. En la fila **Main** no debe haber tareas largas (bandas rojas en la esquina) mientras se anima.
4. Activa **Rendering → Paint flashing**: el drawer y el tirador **no** deben parpadear en verde mientras se mueven (si lo hacen, se está repintando y hay una propiedad que no debería animarse).
5. Activa **Rendering → Layer borders** para ver qué capas ha promovido el navegador.
6. Repite con **CPU throttling 4×** (pestaña Performance): es una buena aproximación de un móvil de gama media.

## 10. Lista de comprobación para animaciones nuevas

- [ ] ¿Solo anima `transform` / `opacity`?
- [ ] ¿Usa tokens de duración y curva?
- [ ] ¿Entrar es más lento que salir?
- [ ] ¿Está dentro de `prefers-reduced-motion: no-preference`? (con movimiento reducido, como mucho un fundido)
- [ ] ¿Si lleva `will-change`, solo mientras dura?
- [ ] ¿Se ha comprobado en DevTools sin *paint flashing*?
