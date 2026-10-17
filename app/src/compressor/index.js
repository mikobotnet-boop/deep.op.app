/**
 * index.js — punto de entrada público del Compresor. El resto de la app solo importa de aquí:
 *
 *   const { analyzeVideo, compressForTikTok } = await import('../compressor/index.js');
 */
export { analyzeVideo } from './analyze.js';
export { compressForTikTok, checkSupport, pickBitrate } from './encode.js';
export { fileFromBlob, canShareFile, shareFile } from './share.js';
export { audioReasonText } from './audio.js';
export { CompressorError } from './errors.js';
export { COMPRESSOR_VERSION } from './version.js';
