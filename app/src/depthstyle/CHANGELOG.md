# Changelog de DepthStyle

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
