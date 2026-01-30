/**
 * Gemini AI Service using Vercel AI SDK v6
 * 
 * Uses Google Gemini for:
 * - Text generation: gemini-2.5-pro-preview-05-06 (Gemini Pro 3 Preview)
 * - Image generation: imagen-3.0-generate-002
 * 
 * All AI calls across the platform should use this centralized service.
 */

import { google } from '@ai-sdk/google';
import { generateText, generateObject, streamText } from 'ai';
import { z } from 'zod';

// Model configurations - Change these to update AI models across the entire platform
export const MODELS = {
  TEXT: 'gemini-2.0-flash',
  IMAGE: 'imagen-3.0-generate-002',
};

// Create the Gemini model instance
export function getTextModel() {
  return google(MODELS.TEXT);
}

export function getImageModel() {
  return google(MODELS.IMAGE);
}

/**
 * Generate a text response from Gemini
 * 
 * @param {Object} options - Generation options
 * @param {string} options.system - System prompt
 * @param {string} options.prompt - User prompt
 * @param {Array} options.messages - Conversation history (optional)
 * @param {number} options.maxTokens - Max tokens (default: 2048)
 * @param {number} options.temperature - Temperature (default: 0.7)
 * @returns {Promise<string>} Generated text
 */
export async function generateTextResponse({
  system,
  prompt,
  messages = [],
  maxTokens = 2048,
  temperature = 0.7,
}) {
  const model = getTextModel();
  
  const result = await generateText({
    model,
    system,
    messages: messages.length > 0 ? messages : undefined,
    prompt: messages.length === 0 ? prompt : undefined,
    maxTokens,
    temperature,
  });

  return result.text;
}

/**
 * Stream a text response from Gemini
 * 
 * @param {Object} options - Generation options
 * @param {string} options.system - System prompt
 * @param {string} options.prompt - User prompt
 * @param {Array} options.messages - Conversation history (optional)
 * @param {number} options.maxTokens - Max tokens (default: 2048)
 * @param {number} options.temperature - Temperature (default: 0.7)
 * @returns {Promise<ReadableStream>} Text stream
 */
export async function streamTextResponse({
  system,
  prompt,
  messages = [],
  maxTokens = 2048,
  temperature = 0.7,
}) {
  const model = getTextModel();
  
  const result = streamText({
    model,
    system,
    messages: messages.length > 0 ? messages : undefined,
    prompt: messages.length === 0 ? prompt : undefined,
    maxTokens,
    temperature,
  });

  return result.toDataStreamResponse();
}

/**
 * Generate a structured object response from Gemini
 * 
 * @param {Object} options - Generation options
 * @param {string} options.system - System prompt
 * @param {string} options.prompt - User prompt
 * @param {z.ZodSchema} options.schema - Zod schema for the output
 * @param {number} options.temperature - Temperature (default: 0.5)
 * @returns {Promise<Object>} Generated object matching schema
 */
export async function generateStructuredResponse({
  system,
  prompt,
  schema,
  temperature = 0.5,
}) {
  const model = getTextModel();
  
  const result = await generateObject({
    model,
    system,
    prompt,
    schema,
    temperature,
  });

  return result.object;
}

/**
 * Generate an image using Imagen
 * 
 * @param {Object} options - Generation options
 * @param {string} options.prompt - Image description
 * @param {string} options.aspectRatio - Aspect ratio (default: '1:1')
 * @returns {Promise<string>} Base64 encoded image or URL
 */
export async function generateImage({
  prompt,
  aspectRatio = '1:1',
}) {
  // Note: Imagen support may vary - check latest Vercel AI SDK docs
  const model = getImageModel();
  
  try {
    const result = await generateText({
      model,
      prompt: `Generate an image: ${prompt}`,
      // Imagen-specific options would go here
    });
    
    return result;
  } catch (error) {
    console.error('Image generation error:', error);
    throw new Error('Image generation not available');
  }
}

const geminiAI = {
  generateTextResponse,
  streamTextResponse,
  generateStructuredResponse,
  generateImage,
  MODELS,
};

export default geminiAI;
