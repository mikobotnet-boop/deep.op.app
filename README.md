# Deep op

Interfaz de navegación de Deep op: barra de iconos, menú desplegable, tirador y barra inferior. HTML, CSS y JavaScript puros, sin dependencias, con animaciones pensadas para 60 FPS. Se puede instalar como app y abre sin conexión.

## Ver la app

**[https://mikobotnet-boop.github.io/deep.op.app/app/](https://mikobotnet-boop.github.io/deep.op.app/app/)**

### Instalarla en el móvil o el escritorio

- **Android (Chrome):** abre la dirección, recarga una vez y elige menú ⋮ → **Instalar aplicación**.
- **iPhone (Safari):** Compartir → **Añadir a pantalla de inicio**.
- **Escritorio (Chrome o Edge):** icono de instalar en la barra de direcciones.

## Estructura del repositorio

```
deep.op.app/
├─ README.md        este archivo
└─ app/             la aplicación completa (lo que publica GitHub Pages)
   ├─ index.html
   ├─ manifest.webmanifest
   ├─ sw.js
   ├─ src/          estilos, scripts e iconos
   ├─ docs/         decisiones y reglas de animación
   └─ README.md     guía técnica
```

## Documentación

- [Guía técnica de la app](app/README.md): estructura, convenciones, accesibilidad e instalación como app.
- [Decisiones de arquitectura](app/docs/decisions.md): por qué está hecho así y qué queda pendiente.
- [Reglas de animación](app/docs/animation-rules.md): qué se puede animar, tiempos, curvas y cómo medir los 60 FPS.

## Probar en local

La app usa módulos ES, así que hay que servirla con un servidor (no funciona con doble clic en `index.html`). Desde la carpeta `app/`:

```bash
cd app
python3 -m http.server 8080
```

Después abre <http://localhost:8080>.

## Publicación

La app se publica con GitHub Pages desde este repositorio. Cada cambio que se suba a `main` se ve en la dirección de arriba al cabo de uno o dos minutos. Si cambias, añades o renombras archivos de `app/`, actualiza la lista `PRECACHE` de `app/sw.js` y sube su `VERSION`, para que el modo sin conexión los incluya.
