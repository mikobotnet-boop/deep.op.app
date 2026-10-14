# DepthStyle

Convierte un video al formato DepthStyle: el video mostrado como mapa de profundidad en escala de grises
(cercano oscuro, lejano claro y con niebla). Todo ocurre en el dispositivo.

## Archivos

| Archivo | Qué hace | Cuándo lo tocas |
|---|---|---|
| `config.js` | Todos los ajustes: modelo, versiones de librerías, fps, resolución, aspecto | Para afinar el look o el rendimiento |
| `look.js` | El aspecto: normalizar profundidad y pintarla en gris (funciones puras) | Para cambiar cómo se ve |
| `model.js` | Compatibilidad del navegador y carga del modelo de profundidad | Para cambiar de modelo o de runtime |
| `video.js` | Abrir video, buscar fotogramas, elegir códec | Rara vez |
| `convert.js` | La tubería completa fotograma → profundidad → gris → MP4 | Para añadir pasos (overlays, audio) |
| `version.js` / `CHANGELOG.md` | Versión propia de DepthStyle y su historia | En cada mejora |
| `index.js` | Única puerta de entrada; `home.js` importa solo de aquí | No hace falta tocarlo |

## Cómo mejorar o actualizar una versión

1. Cambia lo que toque (casi siempre `config.js` o `look.js`).
2. Sube `DEPTHSTYLE_VERSION` en `version.js` y anota el cambio en `CHANGELOG.md`.
3. Si añades, borras o renombras archivos de esta carpeta, actualiza `PRECACHE` y sube `VERSION` en `app/sw.js`.
4. Prueba con un video corto en el teléfono.

## Ideas pendientes

- Overlays (brillos, ojos rojos…) compuestos encima del mapa.
- Audio original en el MP4.
- Ajustar `DEPTH_GAMMA` / `FOG_FLOOR` a la referencia con el modelo real.
- Probar un modelo más preciso o más rápido; cambiar de modelo es tocar `MODEL_ID` y `PROFILES`.
