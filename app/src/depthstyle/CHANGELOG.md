# Changelog de DepthStyle

## 1.0.0 — 14 oct 2026
- Primera versión real: conversión en el dispositivo, sin servidor.
- Modelo Depth Anything V2 small (transformers.js 3.8.1); WebGPU si existe, si no WASM.
- Aspecto: gris, cercano oscuro / lejano claro con niebla; suavizado temporal entre fotogramas.
- Salida: MP4 H.264 con WebCodecs + mp4-muxer 5.2.2, sin sonido, hasta 720p.
- Pendiente de probar con el modelo real en un teléfono (ver ../../docs/decisions.md).
