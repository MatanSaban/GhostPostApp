/**
 * Canonical Gemini model identifiers.
 *
 * All AI calls in the audit feature (and beyond) should import from here
 * so that swapping model versions is a single-line change.
 *
 * Gemini 3.1 Pro preview only runs on the Vertex `global` endpoint,
 * so callers must use `googleGlobal` from `vertex-provider.js`, not `google`.
 */

export const GEMINI_MODEL = 'gemini-3.1-pro-preview';
export const GEMINI_VISION_MODEL = 'gemini-3.1-pro-preview';
