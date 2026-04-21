/**
 * AI Model Pricing Configuration
 *
 * Text models: prices are per 1M tokens in USD (Google Cloud Vertex AI).
 * Image models: prices are per generated image in USD (default 4K tier).
 * Last updated: 2026-04-21
 */

export const AI_PRICING = {
  // Gemini 3.x (text)
  'gemini-3-pro': {
    inputPer1M: 2.00,
    outputPer1M: 12.00,
    label: 'Gemini 3 Pro',
  },
  'gemini-3.1-pro-preview': {
    inputPer1M: 2.00,
    outputPer1M: 12.00,
    label: 'Gemini 3.1 Pro (Preview)',
  },
  'gemini-3-flash': {
    inputPer1M: 0.30,
    outputPer1M: 2.50,
    label: 'Gemini 3 Flash',
  },
  'gemini-3-flash-preview': {
    inputPer1M: 0.30,
    outputPer1M: 2.50,
    label: 'Gemini 3 Flash (Preview)',
  },

  // Gemini 3.x (image generation - billed per image, default 4K tier)
  'gemini-3-pro-image-preview': {
    perImage: 0.134,
    // Tier table kept for reference; callers can override by passing imageTier
    imageTiers: { '1k': 0.039, '2k': 0.060, '4k': 0.134 },
    label: 'Gemini 3 Pro Image (Preview)',
    isImageModel: true,
  },

  // Gemini 2.x
  'gemini-2.5-pro': {
    inputPer1M: 1.25,
    outputPer1M: 10.00,
    label: 'Gemini 2.5 Pro',
  },
  'gemini-2.5-flash': {
    inputPer1M: 0.15,
    outputPer1M: 0.60,
    label: 'Gemini 2.5 Flash',
  },
  'gemini-2.0-flash': {
    inputPer1M: 0.10,
    outputPer1M: 0.40,
    label: 'Gemini 2.0 Flash',
  },

  // Gemini 1.x
  'gemini-1.5-pro': {
    inputPer1M: 1.25,
    outputPer1M: 5.00,
    label: 'Gemini 1.5 Pro',
  },
  'gemini-1.5-flash': {
    inputPer1M: 0.075,
    outputPer1M: 0.30,
    label: 'Gemini 1.5 Flash',
  },
};

// Generic aliases used by AI_OPERATIONS and older callers. Resolved to a concrete model ID.
const MODEL_ALIASES = {
  pro: 'gemini-2.5-pro',
  flash: 'gemini-2.5-flash',
  vision: 'gemini-2.5-pro',
  image: 'gemini-3-pro-image-preview',
};

const DEFAULT_MODEL = 'gemini-2.5-pro';

/**
 * Get pricing config for a model identifier. Returns null if unknown so callers
 * can decide how to handle it (prev behavior silently charged at 2.5-pro rates).
 */
export function getModelPricing(modelId) {
  if (!modelId) return AI_PRICING[DEFAULT_MODEL];
  const normalized = String(modelId).toLowerCase().trim();
  if (AI_PRICING[normalized]) return AI_PRICING[normalized];
  if (MODEL_ALIASES[normalized]) return AI_PRICING[MODEL_ALIASES[normalized]];
  if (typeof console !== 'undefined') {
    console.warn(`[pricing] Unknown model "${modelId}", falling back to ${DEFAULT_MODEL}`);
  }
  return AI_PRICING[DEFAULT_MODEL];
}

/**
 * Resolve a model identifier to its canonical ID (after alias lookup).
 */
export function resolveModelId(modelId) {
  if (!modelId) return DEFAULT_MODEL;
  const normalized = String(modelId).toLowerCase().trim();
  if (AI_PRICING[normalized]) return normalized;
  if (MODEL_ALIASES[normalized]) return MODEL_ALIASES[normalized];
  return DEFAULT_MODEL;
}

/**
 * Calculate USD cost for a given usage.
 * - Text models: pass inputTokens + outputTokens.
 * - Image models: pass imageCount (tokens ignored). Optional imageTier ('1k'|'2k'|'4k').
 * @param {number} inputTokens
 * @param {number} outputTokens
 * @param {string} model
 * @param {object} [opts]
 * @param {number} [opts.imageCount]
 * @param {'1k'|'2k'|'4k'} [opts.imageTier]
 * @returns {number} cost in USD
 */
export function calculateTokenCost(inputTokens, outputTokens, model, opts = {}) {
  const pricing = getModelPricing(model);

  if (pricing.isImageModel) {
    const count = opts.imageCount ?? 0;
    if (!count) return 0;
    const tierPrice = opts.imageTier && pricing.imageTiers?.[opts.imageTier];
    const perImage = tierPrice ?? pricing.perImage ?? 0;
    return count * perImage;
  }

  const inputCost = ((inputTokens || 0) / 1_000_000) * (pricing.inputPer1M || 0);
  const outputCost = ((outputTokens || 0) / 1_000_000) * (pricing.outputPer1M || 0);
  return inputCost + outputCost;
}
