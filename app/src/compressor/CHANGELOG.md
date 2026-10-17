# Changelog del Compresor

## 0.1.0 — 17 oct 2026
- Primera versión (mínima): elegir video (hasta 120 s) → analizar (tamaño, duración, fps) → encuadre
  (fondo desenfocado o recorte) → 1080×1920, H.264, fps constantes (los del original, tope 60) y bitrate alto
  (`BITRATE_PER_PIXEL` en `config.js`) → vista previa, compartir y descargar.
- Sonido recodificado a AAC-LC estéreo 48 kHz; si no se puede, el video sale sin sonido y se dice el motivo.
- Todo en el dispositivo con WebCodecs + mp4-muxer; sin servidor.
- Pendiente: perfiles (4K), nitidez y reducción de ruido, HDR → SDR.
