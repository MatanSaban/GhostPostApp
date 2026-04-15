/**
 * AI Model Pricing Configuration
 * 
 * Prices are per 1M tokens in USD.
 * Source: Google Cloud Vertex AI pricing.
 * Last updated: 2025-07
 */

export const AI_PRICING = {
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

// Fallback mapping for generic model names used in AI_OPERATIONS
const MODEL_ALIASES = {
  pro: 'gemini-2.5-pro',
  flash: 'gemini-2.5-flash',
  vision: 'gemini-2.5-pro',
  image: 'gemini-2.5-pro',
};

/**
 * Get pricing config for a model identifier.
 * Falls back to gemini-2.5-pro if unknown.
 */
export function getModelPricing(modelId) {
  if (!modelId) return AI_PRICING['gemini-2.5-pro'];
  const normalized = modelId.toLowerCase().trim();
  if (AI_PRICING[normalized]) return AI_PRICING[normalized];
  if (MODEL_ALIASES[normalized]) return AI_PRICING[MODEL_ALIASES[normalized]];
  return AI_PRICING['gemini-2.5-pro'];
}

/**
 * Calculate the USD cost for a given token usage.
 * @param {number} inputTokens
 * @param {number} outputTokens
 * @param {string} model - model identifier
 * @returns {number} cost in USD
 */
export function calculateTokenCost(inputTokens, outputTokens, model) {
  const pricing = getModelPricing(model);
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPer1M;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPer1M;
  return inputCost + outputCost;
}
