/**
 * Gemini AI Service using Vercel AI SDK v6
 * 
 * Uses Google Gemini for:
 * - Text generation: gemini-2.5-pro
 * - Image generation: gemini-2.0-flash-preview-image-generation (Gemini native image generation)
 * 
 * All AI calls across the platform should use this centralized service.
 */

import { google } from '@ai-sdk/google';
import { generateText, streamText, Output, jsonSchema } from 'ai';
import { z } from 'zod';
import { toJSONSchema } from 'zod/v4';
import { logAIUsage, AI_OPERATIONS } from './credits.js';

// Model configurations - Change these to update AI models across the entire platform
// TEXT uses Gemini 2.5 Pro - high-quality text generation
// IMAGE uses Gemini 2.0 Flash - fast multimodal model (supports image generation via generateContent)
// PRO_PREVIEW uses Gemini 3 Pro Preview - maximum reasoning for complex semantic tasks
export const MODELS = {
  TEXT: 'gemini-2.5-pro',
  IMAGE: 'gemini-2.0-flash',
  PRO_PREVIEW: 'gemini-3-pro-preview',
};

// Create the Gemini model instance
export function getTextModel() {
  return google(MODELS.TEXT);
}

// Nano Banana uses generateContent (language model API), not the Imagen predict API
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
 * @param {string} options.operation - AI operation type for credits tracking (optional)
 * @param {Object} options.metadata - Additional metadata for logging (optional)
 * @returns {Promise<string>} Generated text
 */
export async function generateTextResponse({
  system,
  prompt,
  messages = [],
  maxTokens = 2048,
  temperature = 0.7,
  operation = 'GENERIC',
  metadata = {},
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

  // Log AI usage with credits information
  const usage = result.usage || {};
  logAIUsage({
    operation,
    inputTokens: usage.promptTokens || 0,
    outputTokens: usage.completionTokens || 0,
    totalTokens: usage.totalTokens || 0,
    model: MODELS.TEXT,
    metadata: {
      promptLength: prompt?.length || 0,
      responseLength: result.text?.length || 0,
      ...metadata,
    },
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
 * @param {string} options.operation - AI operation type for credits tracking (optional)
 * @param {Object} options.metadata - Additional metadata for logging (optional)
 * @returns {Promise<Object>} Generated object matching schema
 */
export async function generateStructuredResponse({
  system,
  prompt,
  schema,
  temperature = 0.5,
  maxTokens,
  operation = 'GENERIC',
  metadata = {},
  modelOverride = null,
}) {
  // Allow model override for advanced operations requiring specific models
  const modelName = modelOverride || MODELS.TEXT;
  const model = google(modelName);
  
  // Convert Zod v4 schema to JSON Schema ourselves to avoid compatibility issues
  // with @ai-sdk/provider-utils' internal Zod detection (which may fail in Next.js bundling)
  const jsonSchemaObj = toJSONSchema(schema, { target: 'draft-7', io: 'input', reused: 'inline' });
  
  const result = await generateText({
    model,
    system,
    prompt,
    output: Output.object({ 
      schema: jsonSchema(jsonSchemaObj, {
        validate: async (value) => {
          const parsed = await schema.safeParseAsync(value);
          return parsed.success
            ? { success: true, value: parsed.data }
            : { success: false, error: parsed.error };
        },
      }),
    }),
    temperature,
    ...(maxTokens ? { maxTokens } : {}),
  });

  // Log AI usage with credits information
  const usage = result.usage || {};
  logAIUsage({
    operation,
    inputTokens: usage.promptTokens || 0,
    outputTokens: usage.completionTokens || 0,
    totalTokens: usage.totalTokens || 0,
    model: modelName,
    metadata: {
      promptLength: prompt?.length || 0,
      schemaType: schema?.description || 'structured',
      ...metadata,
    },
  });

  return result.output;
}

/**
 * Generate an image using Nano Banana 2 (Gemini native image generation)
 * 
 * Uses generateText() with responseModalities: ['IMAGE'] to leverage
 * Gemini's native image generation capabilities (Nano Banana).
 * 
 * @param {Object} options - Generation options
 * @param {string} options.prompt - Image description
 * @param {string} options.aspectRatio - Aspect ratio (default: '16:9')
 * @param {number} options.n - Number of images (default: 1)
 * @param {string} options.operation - AI operation type for credits tracking
 * @param {Object} options.metadata - Additional metadata for logging
 * @returns {Promise<{ base64: string, mimeType: string }[]>} Array of generated images
 */
export async function generateImage({
  prompt,
  aspectRatio = '16:9',
  n = 1,
  operation = 'GENERATE_IMAGE',
  metadata = {},
}) {
  const model = getImageModel();
  
  // Nano Banana uses generateText with responseModalities: ['IMAGE']
  // This calls the Gemini generateContent API (not the Imagen predict API)
  const result = await generateText({
    model,
    prompt,
    providerOptions: {
      google: {
        responseModalities: ['IMAGE'],
        imageConfig: {
          aspectRatio,
        },
      },
    },
  });

  // Extract images from the response files
  const images = (result.files || [])
    .filter(f => f.mediaType?.startsWith('image/'))
    .map(f => ({
      base64: f.base64,
      mimeType: f.mediaType || 'image/png',
    }));

  if (images.length === 0) {
    throw new Error('No image generated by Nano Banana');
  }

  // Log AI usage
  const usage = result.usage || {};
  logAIUsage({
    operation,
    inputTokens: usage.promptTokens || 0,
    outputTokens: usage.completionTokens || 0,
    totalTokens: usage.totalTokens || 0,
    model: MODELS.IMAGE,
    metadata: {
      promptLength: prompt?.length || 0,
      imageCount: images.length,
      aspectRatio,
      ...metadata,
    },
  });

  return images;
}

const geminiAI = {
  generateTextResponse,
  streamTextResponse,
  generateStructuredResponse,
  generateImage,
  MODELS,
};

export default geminiAI;
