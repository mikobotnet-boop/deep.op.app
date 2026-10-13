# Reglas de animación

Todo el movimiento de Deep op vive en `src/styles/motion.css`. Los tiempos y las curvas viven en `src/styles/tokens.css`. Estas reglas se aplican a cualquier animación nueva.

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
- `main.js` aplica el estado y quita `preload` tras **dos fotogramas**; el primero deja que el navegador calcule el estilo final, el segundo evita que se interprete como un cambio.
- Si el script no llegara a cargar, una animación de 0 s con retardo muestra la app a los 1,5 s.
- La entrada inicial (dock que sube, iconos que entran en cascada) empieza cuando se quita `preload`, no antes.

## 7. Accesibilidad

- **Todo el movimiento** está dentro de `@media (prefers-reduced-motion: no-preference)`. Con "reducir movimiento" activado, la app funciona igual pero de forma instantánea. Si se añade un movimiento nuevo, va dentro de ese bloque.
- Los efectos de elevación al pasar el ratón van dentro de `@media (hover: hover)` para que en pantallas táctiles no se queden "pegados" tras tocar.
- El drawer cerrado está fuera de la tabulación: `inert` (inmediato) y `visibility: hidden` (al terminar la salida).

## 8. Cómo comprobar los 60 FPS

1. Abre Chrome DevTools → **Performance** → pulsa grabar → abre y cierra el menú varias veces → detén.
2. En la fila **Frames** no debe haber fotogramas rojos ni amarillos durante el movimiento.
3. En la fila **Main** no debe haber tareas largas (bandas rojas en la esquina) mientras se anima.
4. Activa **Rendering → Paint flashing**: el drawer y el tirador **no** deben parpadear en verde mientras se mueven (si lo hacen, se está repintando y hay una propiedad que no debería animarse).
5. Activa **Rendering → Layer borders** para ver qué capas ha promovido el navegador.
6. Repite con **CPU throttling 4×** (pestaña Performance): es una buena aproximación de un móvil de gama media.

## 9. Lista de comprobación para animaciones nuevas

- [ ] ¿Solo anima `transform` / `opacity`?
- [ ] ¿Usa tokens de duración y curva?
- [ ] ¿Entrar es más lento que salir?
- [ ] ¿Está dentro de `prefers-reduced-motion: no-preference`?
- [ ] ¿Si lleva `will-change`, solo mientras dura?
- [ ] ¿Se ha comprobado en DevTools sin *paint flashing*?
