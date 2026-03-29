/**
 * AI Module Index
 * 
 * Exports all AI-related functionality.
 * 
 * Environment Variables Required:
 * - GOOGLE_GENERATIVE_AI_API_KEY: Your Google AI API key for Gemini
 * 
 * Models Used:
 * - Text: gemini-2.5-pro
 * - Image: gemini-3-pro-image-preview (Nano Banana Pro - professional image generation)
 */

export {
  generateTextResponse,
  streamTextResponse,
  generateStructuredResponse,
  generateImage,
  MODELS,
} from './gemini.js';

export {
  generateInterviewResponse,
  analyzeWebsite,
  generateKeywords,
  analyzeWritingStyle,
  generateSEOStrategy,
} from './interview-ai.js';

export {
  TOKENS_PER_CREDIT,
  AI_OPERATIONS,
  tokensToCredits,
  creditsToTokens,
  getOperationConfig,
  logAIUsage,
} from './credits.js';

export {
  analyzeKeywordIntent,
  analyzeKeywordIntentsBatch,
  KEYWORD_INTENTS,
} from './keyword-intent.js';
