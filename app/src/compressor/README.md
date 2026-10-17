# Compresor

Prepara un video para subirlo a TikTok: 1080×1920, H.264, fps constantes y bitrate alto. Todo ocurre en el
dispositivo. La pantalla está en `src/scripts/compressor.js`; esta carpeta es el motor.

## Archivos

| Archivo | Qué hace | Cuándo lo tocas |
|---|---|---|
| `config.js` | Todos los ajustes: tamaño, fps máximo, bitrate, codecs, audio, encuadres | Para cambiar la salida |
| `analyze.js` | Lee tamaño, duración y fps del original | Si cambia lo que se analiza |
| `frames.js` | Dibuja cada fotograma en 1080×1920 (fondo desenfocado o recorte) | Para cambiar el encuadre |
| `encode.js` | Bucle fotograma a fotograma → H.264 → MP4 (`compressForTikTok`) | Para cambiar el proceso |
| `audio.js` | Sonido original → AAC 48 kHz | Si falla el audio |
| `share.js` | Menú de compartir del sistema | Rara vez |
| `errors.js`, `version.js` | Error propio en español; versión | Al subir de versión |
| `index.js` | Único punto de entrada: el resto de la app solo importa de aquí | — |

Reutiliza de DepthStyle `video.js` (abrir y buscar en un video), `fps.js` (medir fps) y la URL de mp4-muxer.
Si cambias algo que altere el resultado, sube la versión en `version.js` y anótalo en `CHANGELOG.md`.
