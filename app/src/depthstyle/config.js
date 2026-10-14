/**
 * config.js — todos los ajustes de DepthStyle en un solo sitio.
 *
 * Para cambiar el aspecto (gris, niebla, parpadeo) o el rendimiento (resolución, fps), edita
 * solo este archivo. Si cambias algo que altere el resultado, sube la versión en version.js.
 */

export const MODEL_ID = 'onnx-community/depth-anything-v2-small';
export const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
export const MUXER_URL = 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/+esm';

// Con GPU (WebGPU) se puede estimar a más resolución y más fotogramas por segundo.
export const PROFILES = {
  gpu: { device: 'webgpu', dtype: 'fp16', depthLong: 392, fps: 24 },
  cpu: { device: 'wasm',   dtype: 'q8',   depthLong: 308, fps: 12 },
};
export const OUT_LONG_SIDE = 1280;      // lado largo máximo del video de salida (720p)
export const KEYFRAME_EVERY_S = 2;
export const MAX_QUEUE = 6;             // fotogramas esperando al codificador antes de pausar
export const SEEK_TIMEOUT_MS = 8000;
export const MODEL_FILE_MIN_BYTES = 1e6;   // solo los archivos grandes cuentan para el % de descarga (no los .json)
export const STALL_TIMEOUT_MS = 120000;    // sin ninguna noticia del modelo durante tanto tiempo = se da por colgado
export const ESTIMATE_TIMEOUT_MS = 90000;  // máximo por fotograma

// Aspecto de DepthStyle
export const DEPTH_GAMMA = 1.35;        // >1 oscurece lo cercano y deja el fondo en niebla clara
export const FOG_FLOOR = 0.03;          // el negro nunca es 100 % negro (se parece a la referencia)
export const TEMPORAL_MIX = 0.6;        // peso del fotograma nuevo (el resto es el anterior): quita parpadeo
export const RANGE_MIX = 0.12;          // velocidad con la que se adapta el rango min/máx entre fotogramas

export const MEAN = [0.485, 0.456, 0.406];
export const STD = [0.229, 0.224, 0.225];

// Códecs H.264 que se prueban por orden (High / Main / Baseline, nivel 4.0)
export const CODECS = ['avc1.640028', 'avc1.4d0028', 'avc1.420028'];
