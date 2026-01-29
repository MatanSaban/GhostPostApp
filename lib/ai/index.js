/**
 * AI Module Index
 * 
 * Exports all AI-related functionality.
 * 
 * Environment Variables Required:
 * - GOOGLE_GENERATIVE_AI_API_KEY: Your Google AI API key for Gemini
 * 
 * Models Used:
 * - Text: gemini-2.5-pro-preview-05-06 (Gemini Pro 3 Preview)
 * - Image: imagen-3.0-generate-002 (Imagen 3)
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
