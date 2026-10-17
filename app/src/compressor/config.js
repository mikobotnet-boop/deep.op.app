/**
 * config.js — todos los ajustes del Compresor en un solo sitio.
 *
 * Para cambiar la salida (tamaño, fps, bitrate) o el encuadre, edita solo este archivo.
 * Si cambias algo que altere el resultado, sube la versión en version.js.
 */

// Salida: vertical 9:16. (El perfil «4K» llegará con los perfiles.)
export const OUT_W = 1080;
export const OUT_H = 1920;

// Fotogramas por segundo: se mantienen los del original (sin subirlos artificialmente), con este tope.
// Un video de 120 fps sale a 60; uno de 50, a 50.
export const OUTPUT_FPS_MAX = 60;

// Bitrate «alto»: bits por píxel y fotograma, con suelo y techo. Además, el archivo final no debe pasar de
// MAX_OUTPUT_MB (el MP4 se arma en memoria): en videos largos el bitrate baja lo justo para respetarlo.
export const BITRATE_PER_PIXEL = 0.25;     // 1080×1920 a 30 fps ≈ 15,5 Mbps
export const MIN_BITRATE = 8e6;
export const MAX_BITRATE = 30e6;
export const MAX_OUTPUT_MB = 250;

// Duración máxima del video de entrada. El Compresor lee los fotogramas uno a uno (buscando cada uno en el
// video), así que el tiempo de trabajo crece con la duración; con 120 s ya es largo en un teléfono.
export const MAX_SECONDS = 120;

export const KEYFRAME_EVERY_S = 2;
export const MAX_QUEUE = 6;                // fotogramas esperando al codificador antes de pausar

// Encuadres. `blur`: el video entero, centrado, sobre su propio fondo desenfocado. `crop`: llena el cuadro
// recortando lo que sobre. Con un video que ya es 9:16 los dos dan lo mismo.
export const LAYOUTS = ['blur', 'crop'];
export const DEFAULT_LAYOUT = 'blur';
export const NEAR_VERTICAL = 0.01;         // diferencia de proporción por debajo de la cual se considera ya 9:16
export const BLUR_DIVISOR = 12;            // el fondo se dibuja 12 veces más pequeño y se estira: es el desenfoque
export const BLUR_SCRIM = 0.35;            // velo oscuro sobre el fondo para que destaque el video

// H.264 a probar, por orden (High / Main / Baseline, nivel 4.2: cabe 1080×1920 a 60 fps; el último es nivel 5.1).
export const CODECS = ['avc1.64002a', 'avc1.4d002a', 'avc1.42002a', 'avc1.640033'];

// Audio: AAC-LC estéreo a 48 kHz. Solo se intenta con archivos de hasta MAX_AUDIO_FILE_BYTES (se lee
// entero en memoria para decodificar el sonido).
export const AUDIO = { codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 };
export const AUDIO_CHUNK_FRAMES = 48000;
export const MAX_AUDIO_FILE_BYTES = 300e6;
