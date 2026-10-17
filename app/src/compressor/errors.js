/**
 * errors.js — error propio del Compresor. Su mensaje ya está en español y se puede mostrar tal cual.
 */
export class CompressorError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CompressorError';
  }
}
