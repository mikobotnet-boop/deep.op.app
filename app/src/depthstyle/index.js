/**
 * index.js — punto de entrada público de DepthStyle. El resto de la app solo importa de aquí:
 *
 *   const { convertToDepthStyle } = await import('../depthstyle/index.js');
 */
export { convertToDepthStyle } from './convert.js';
export { checkSupport, loadDepthModel } from './model.js';
export { normalizeDepth, paintDepth } from './look.js';
export { DEPTHSTYLE_VERSION } from './version.js';
