/**
 * AI Keyword Intent Analysis
 * 
 * Analyzes keywords to determine their search intent(s).
 * A keyword can have multiple intents.
 * 
 * Intent Types:
 * - INFORMATIONAL: User wants to learn something (e.g., "how to", "what is")
 * - NAVIGATIONAL: User wants to find a specific site/page (e.g., "facebook login")
 * - COMMERCIAL: User is researching options before purchase (e.g., "best laptops 2024")
 * - TRANSACTIONAL: User wants to make a purchase/action (e.g., "buy iphone", "download")
 */

import { generateStructuredResponse } from './gemini.js';
import { z } from 'zod';

// Valid intent values matching Prisma enum
const INTENTS = ['INFORMATIONAL', 'NAVIGATIONAL', 'COMMERCIAL', 'TRANSACTIONAL'];

// Schema for single keyword analysis
const KeywordIntentSchema = z.object({
  keyword: z.string(),
  intents: z.array(z.enum(INTENTS)).describe('Array of search intents for this keyword'),
  confidence: z.number().min(0).max(1).describe('Confidence score between 0 and 1'),
  reasoning: z.string().optional().describe('Brief explanation of the intent classification'),
});

// Schema for batch analysis
const BatchIntentSchema = z.object({
  results: z.array(KeywordIntentSchema),
});

/**
 * Analyze the search intent(s) for a single keyword
 * 
 * @param {string} keyword - The keyword to analyze
 * @param {Object} context - Optional context about the website/business
 * @param {string} context.businessType - Type of business (e.g., "e-commerce", "blog")
 * @param {string} context.industry - Industry/niche
 * @returns {Promise<{intents: string[], confidence: number, reasoning?: string}>}
 */
export async function analyzeKeywordIntent(keyword, context = {}, { accountId, userId, siteId } = {}) {
  const contextInfo = context.businessType || context.industry
    ? `Website context: ${[context.businessType, context.industry].filter(Boolean).join(', ')}`
    : '';

  const result = await generateStructuredResponse({
    system: `You are an expert SEO analyst specializing in search intent classification.
Analyze keywords and determine their search intent(s). A keyword can have multiple intents.

Intent definitions:
- INFORMATIONAL: User wants to learn or understand something. Keywords often include "how to", "what is", "guide", "tutorial", "tips".
- NAVIGATIONAL: User wants to find a specific website or page. Keywords often include brand names, specific product names, or "login", "home page".
- COMMERCIAL: User is researching before making a purchase decision. Keywords often include "best", "review", "comparison", "vs", "top 10".
- TRANSACTIONAL: User wants to complete an action (buy, sign up, download). Keywords often include "buy", "price", "discount", "coupon", "order", "download".

Important:
- Keywords can have MULTIPLE intents (e.g., "best running shoes" is both COMMERCIAL and potentially TRANSACTIONAL)
- Always return at least one intent
- Be precise - only assign intents that clearly apply
- Consider the user's likely goal behind the search`,
    prompt: `Analyze the search intent(s) for this keyword: "${keyword}"
${contextInfo}

Return the intent classification with confidence score.`,
    schema: KeywordIntentSchema,
    operation: 'KEYWORD_INTENT_ANALYSIS',
    metadata: { keyword },
    accountId,
    userId,
    siteId,
  });

  return {
    intents: result.intents,
    confidence: result.confidence,
    reasoning: result.reasoning,
  };
}

/**
 * Analyze search intents for multiple keywords in batch
 * More efficient than analyzing one by one
 * 
 * @param {string[]} keywords - Array of keywords to analyze
 * @param {Object} context - Optional context about the website/business
 * @returns {Promise<Map<string, {intents: string[], confidence: number}>>}
 */
export async function analyzeKeywordIntentsBatch(keywords, context = {}, { accountId, userId, siteId } = {}) {
  if (!keywords.length) return new Map();

  // For small batches (1-3), analyze individually for better accuracy
  if (keywords.length <= 3) {
    const results = new Map();
    for (const kw of keywords) {
      const result = await analyzeKeywordIntent(kw, context, { accountId, userId, siteId });
      results.set(kw, result);
    }
    return results;
  }

  const contextInfo = context.businessType || context.industry
    ? `Website context: ${[context.businessType, context.industry].filter(Boolean).join(', ')}`
    : '';

  const result = await generateStructuredResponse({
    system: `You are an expert SEO analyst specializing in search intent classification.
Analyze keywords and determine their search intent(s). A keyword can have multiple intents.

Intent definitions:
- INFORMATIONAL: User wants to learn or understand something. Keywords often include "how to", "what is", "guide", "tutorial", "tips".
- NAVIGATIONAL: User wants to find a specific website or page. Keywords often include brand names, specific product names, or "login", "home page".
- COMMERCIAL: User is researching before making a purchase decision. Keywords often include "best", "review", "comparison", "vs", "top 10".
- TRANSACTIONAL: User wants to complete an action (buy, sign up, download). Keywords often include "buy", "price", "discount", "coupon", "order", "download".

Important:
- Keywords can have MULTIPLE intents
- Always return at least one intent per keyword
- Be precise - only assign intents that clearly apply
- Analyze each keyword independently based on user search behavior`,
    prompt: `Analyze the search intent(s) for these keywords:
${keywords.map((kw, i) => `${i + 1}. "${kw}"`).join('\n')}

${contextInfo}

Return the intent classification for each keyword.`,
    schema: BatchIntentSchema,
    operation: 'KEYWORD_INTENT_ANALYSIS',
    metadata: { keywordCount: keywords.length },
    accountId,
    userId,
    siteId,
    creditsMultiplier: keywords.length,
  });

  const resultsMap = new Map();
  for (const item of result.results) {
    resultsMap.set(item.keyword, {
      intents: item.intents,
      confidence: item.confidence,
    });
  }

  // Ensure all keywords have results (fallback for any missed by AI)
  for (const kw of keywords) {
    if (!resultsMap.has(kw)) {
      resultsMap.set(kw, {
        intents: ['INFORMATIONAL'], // Default fallback
        confidence: 0.5,
      });
    }
  }

  return resultsMap;
}

export { INTENTS as KEYWORD_INTENTS };
