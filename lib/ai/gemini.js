/**
 * Gemini AI Service using Vercel AI SDK v6
 * 
 * Uses Google Gemini for:
 * - Text generation: gemini-2.5-pro
 * - Image generation: gemini-3-pro-image-preview (Nano Banana Pro - professional image generation)
 * 
 * All AI calls across the platform should use this centralized service.
 */

import { vertex } from './vertex-provider.js';
import { generateText, streamText, Output, jsonSchema } from 'ai';
import { z } from 'zod';
import { toJSONSchema } from 'zod/v4';
import { logAIUsage, AI_OPERATIONS } from './credits.js';
import { trackAIUsage } from './credits-service.js';

// Model configurations - Change these to update AI models across the entire platform
// Using Gemini 3.1 Pro Preview for all AI tasks (Vertex AI, global endpoint only)
export const MODELS = {
  TEXT: 'gemini-3.1-pro-preview',
  FLASH: 'gemini-3-flash-preview',
  IMAGE: 'gemini-3-pro-image-preview',
  PRO_PREVIEW: 'gemini-3.1-pro-preview',
};

// Create the Gemini model instance
export function getTextModel() {
  return vertex(MODELS.TEXT);
}

export function getFlashModel() {
  return vertex(MODELS.FLASH);
}

// Gemini 3 Pro Image Preview (Nano Banana Pro) uses generateContent with responseModalities: ['IMAGE']
export function getImageModel() {
  return vertex(MODELS.IMAGE);
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
 * @param {string} options.accountId - Account ID for credit tracking (optional)
 * @param {string} options.userId - User ID for credit tracking (optional)
 * @param {string} options.siteId - Site ID for credit tracking (optional)
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
  accountId,
  userId,
  siteId,
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

  // Log AI usage with credits information (console)
  const usage = result.usage || {};
  const inputTokens = usage.inputTokens || 0;
  const outputTokens = usage.outputTokens || 0;
  const totalTokens = usage.totalTokens || 0;
  logAIUsage({
    operation,
    inputTokens,
    outputTokens,
    totalTokens,
    model: MODELS.TEXT,
    metadata: {
      promptLength: prompt?.length || 0,
      responseLength: result.text?.length || 0,
      ...metadata,
    },
  });

  // Persist to database when accountId is provided
  if (accountId) {
    trackAIUsage({
      accountId,
      userId,
      siteId,
      operation,
      inputTokens,
      outputTokens,
      totalTokens,
      metadata: { model: MODELS.TEXT, ...metadata },
    }).catch(err => console.error('[AI] trackAIUsage error:', err.message));
  } else if (operation !== 'GENERIC') {
    console.warn(`[AI] Missing accountId for operation "${operation}" - usage will not be tracked or billed!`);
  }

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
 * @param {string} options.accountId - Account ID for credit tracking (optional)
 * @param {string} options.userId - User ID for credit tracking (optional)
 * @param {string} options.siteId - Site ID for credit tracking (optional)
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
  accountId,
  userId,
  siteId,
  creditsMultiplier = 1,
}) {
  // Allow model override for advanced operations requiring specific models
  const modelName = modelOverride || MODELS.TEXT;
  const model = vertex(modelName);
  
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

  // Log AI usage with credits information (console)
  const usage = result.usage || {};
  const inputTokens = usage.inputTokens || 0;
  const outputTokens = usage.outputTokens || 0;
  const totalTokens = usage.totalTokens || 0;
  logAIUsage({
    operation,
    inputTokens,
    outputTokens,
    totalTokens,
    model: modelName,
    metadata: {
      promptLength: prompt?.length || 0,
      schemaType: schema?.description || 'structured',
      ...metadata,
    },
  });

  // Persist to database when accountId is provided
  if (accountId) {
    trackAIUsage({
      accountId,
      userId,
      siteId,
      operation,
      inputTokens,
      outputTokens,
      totalTokens,
      creditsMultiplier,
      metadata: { model: modelName, ...metadata },
    }).catch(err => console.error('[AI] trackAIUsage error:', err.message));
  } else if (operation !== 'GENERIC') {
    console.warn(`[AI] Missing accountId for operation "${operation}" - usage will not be tracked or billed!`);
  }

  return result.experimental_output;
}

/**
 * Generate images using Gemini 3 Pro Image Preview (Nano Banana Pro)
 * 
 * Uses generateText() with responseModalities: ['IMAGE'] to leverage
 * Gemini's native image generation with advanced reasoning (Thinking).
 * 
 * @param {Object} options - Generation options
 * @param {string} options.prompt - Image description
 * @param {string} options.aspectRatio - Aspect ratio (default: '16:9')
 * @param {number} options.n - Number of images (default: 1)
 * @param {string} options.operation - AI operation type for credits tracking
 * @param {Object} options.metadata - Additional metadata for logging
 * @param {string} options.accountId - Account ID for credit tracking (optional)
 * @param {string} options.userId - User ID for credit tracking (optional)
 * @param {string} options.siteId - Site ID for credit tracking (optional)
 * @returns {Promise<{ base64: string, mimeType: string }[]>} Array of generated images
 */
export async function generateImage({
  prompt,
  aspectRatio = '16:9',
  n = 1,
  referenceImages = [],
  operation = 'GENERATE_IMAGE',
  metadata = {},
  accountId,
  userId,
  siteId,
}) {
  const model = getImageModel();

  // Build request — either text-only (classic `prompt`) or multimodal messages
  // when the user attached reference images. Nano Banana treats attached images
  // as style/subject references the model should consider when composing.
  const hasRefs = Array.isArray(referenceImages) && referenceImages.length > 0;
  const request = {
    model,
    providerOptions: {
      google: {
        responseModalities: ['IMAGE'],
        imageConfig: {
          aspectRatio,
        },
      },
    },
  };
  if (hasRefs) {
    const content = [{ type: 'text', text: prompt }];
    for (const ref of referenceImages.slice(0, 2)) {
      if (!ref?.base64) continue;
      content.push({
        type: 'image',
        image: Buffer.from(ref.base64, 'base64'),
        mediaType: ref.mimeType || 'image/png',
      });
    }
    request.messages = [{ role: 'user', content }];
  } else {
    request.prompt = prompt;
  }

  const result = await generateText(request);

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

  // Log AI usage (console)
  const usage = result.usage || {};
  const inputTokens = usage.inputTokens || 0;
  const outputTokens = usage.outputTokens || 0;
  const totalTokens = usage.totalTokens || 0;
  logAIUsage({
    operation,
    inputTokens,
    outputTokens,
    totalTokens,
    model: MODELS.IMAGE,
    metadata: {
      promptLength: prompt?.length || 0,
      imageCount: images.length,
      aspectRatio,
      ...metadata,
    },
  });

  // Persist to database when accountId is provided
  if (accountId) {
    trackAIUsage({
      accountId,
      userId,
      siteId,
      operation,
      inputTokens,
      outputTokens,
      totalTokens,
      metadata: { model: MODELS.IMAGE, ...metadata },
    }).catch(err => console.error('[AI] trackAIUsage error:', err.message));
  } else if (operation !== 'GENERIC') {
    console.warn(`[AI] Missing accountId for operation "${operation}" - usage will not be tracked or billed!`);
  }

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
