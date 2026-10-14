# Changelog de DepthStyle

## 1.0.4 — 14 oct 2026
- La salida va a los mismos fps que el video original (`fps.js`), con tope de 30: 24 → 24, 30 → 30,
  60 → 30, 50 → 25. Antes era fija (12 fps sin GPU, 24 con GPU) y no dependía del video.
- Los fps se miden reproduciendo un instante el fragmento (requestVideoFrameCallback); si no se puede,
  se usa 30 (`OUTPUT_FPS_DEFAULT` en `config.js`).
- El ritmo adaptativo ahora limita el hueco entre fotogramas con profundidad a 0,5 s (`MAX_KEY_GAP_S`),
  no a un número fijo de fotogramas: el tiempo de conversión no sube al subir los fps.
- El estado y el mensaje final indican los fps de salida.

## 1.0.3 — 14 oct 2026
- Ritmo adaptativo (`pacing.js`): si el dispositivo es lento (sobre todo sin GPU) se calcula la profundidad
  solo en 1 de cada 2–6 fotogramas y los de en medio se interpolan, para no pasar de ~90 s de cálculo.
  Con GPU rápida se calculan todos. Límites en `config.js` (`TARGET_PROCESSING_S`, `MAX_STRIDE`).
- Antes de culpar a la GPU de un bloqueo se comprueba la conexión: si no hay red, el mensaje es de conexión
  y no se fija el modo CPU.
- El modo CPU recordado va ligado a la versión: con una versión nueva se vuelve a probar la GPU.

## 1.0.2 — 14 oct 2026
- Si la GPU del teléfono no responde (preparación del modelo o primer fotograma), la app cambia sola al modo
  CPU y lo recuerda. `?cpu=1` fuerza la CPU y `?cpu=0` vuelve a probar la GPU.
- Los tiempos agotados ya no se confunden: «el modelo tardó en cargarse» (conexión) vs «un fotograma tardó»
  (dispositivo) vs «la GPU no respondió».
- `sw.js` (v7): los archivos propios se revalidan siempre con el servidor, para que no se mezclen versiones
  (causa del error «does not provide an export named ESTIMATE_TIMEOUT_MS»).
- La salida float16 del modelo se lee bien tanto si llega como Uint16Array como Float16Array.

## 1.0.1 — 14 oct 2026
- El modelo corre en un worker (`worker.js`): la pantalla y «Cancelar» ya no se congelan.
- Estados claros: descarga del modelo, preparación del modelo y «primer fotograma»; % de descarga real
  (antes marcaba 100 % antes de empezar el archivo grande).
- Tiempos máximos (120 s sin señales de vida del modelo, 90 s por fotograma) con mensaje claro.
- Errores en español, con aviso específico de «sin conexión».
- Se muestra el perfil (GPU/CPU) y los segundos por fotograma para diagnosticar en el teléfono.

## 1.0.0 — 14 oct 2026
- Primera versión real: conversión en el dispositivo, sin servidor.
- Modelo Depth Anything V2 small (transformers.js 3.8.1); WebGPU si existe, si no WASM.
- Aspecto: gris, cercano oscuro / lejano claro con niebla; suavizado temporal entre fotogramas.
- Salida: MP4 H.264 con WebCodecs + mp4-muxer 5.2.2, sin sonido, hasta 720p.
- Pendiente de probar con el modelo real en un teléfono (ver ../../docs/decisions.md).
