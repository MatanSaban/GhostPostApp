/**
 * AI-assisted element locator resolver.
 *
 * Role: when the deterministic locator the model produced didn't match any
 * element (or the plugin returns a candidates list in diagnostic mode), call
 * Gemini 2.5 Pro against a compact candidates list and ask it to return the
 * best widget_id (or null if nothing fits). This keeps the expensive model
 * call out of the main agent loop and scoped to a single lookup.
 */

import { z } from 'zod';
import { generateStructuredResponse } from '@/lib/ai/gemini';

const MATCH_SCHEMA = z.object({
  widget_id: z.string().nullable().describe('The id of the best matching element, or null if nothing in the candidates list is a reasonable match.'),
  confidence: z.enum(['high', 'medium', 'low']).describe('Subjective confidence in the pick.'),
  reason: z.string().describe('One short sentence explaining why this candidate was picked (or why none was).'),
});

/**
 * Ask Gemini 2.5 Pro to pick the best candidate widget for a described target.
 *
 * @param {Object} params
 * @param {string} params.intent - Human-readable description of what the user wants to target (e.g. "the main heading" or "the first paragraph under the hero").
 * @param {Array<{id:string,type?:string,tag?:string,text?:string,depth?:number}>} params.candidates - Compact list of elements the plugin returned.
 * @param {string} [params.postTitle] - Page/post title for context.
 * @param {string} [params.accountId]
 * @param {string} [params.userId]
 * @param {string} [params.siteId]
 * @returns {Promise<{widget_id: string|null, confidence: string, reason: string}>}
 */
export async function resolveLocatorWithAI({ intent, candidates, postTitle, accountId, userId, siteId }) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { widget_id: null, confidence: 'low', reason: 'No candidates supplied by plugin.' };
  }

  // Keep the list compact to control token use - summarize down to useful fields only.
  const slimmed = candidates.slice(0, 80).map(c => ({
    id: c.id,
    type: c.type || undefined,
    tag: c.tag || undefined,
    text: typeof c.text === 'string' ? c.text.slice(0, 140) : undefined,
    depth: typeof c.depth === 'number' ? c.depth : undefined,
  }));

  const system = [
    'You map a human description of an on-page element to a specific widget id from a list.',
    'Pick the single candidate that best matches the described target. Prefer semantic matches (tag + text) over position unless position is explicit.',
    'If nothing fits, return widget_id=null. Never invent an id that is not in the candidates list.',
  ].join(' ');

  const prompt = [
    postTitle ? `Post/page: ${postTitle}` : null,
    `User intent: ${intent}`,
    'Candidates (JSON):',
    JSON.stringify(slimmed, null, 2),
  ].filter(Boolean).join('\n\n');

  try {
    const pick = await generateStructuredResponse({
      system,
      prompt,
      schema: MATCH_SCHEMA,
      temperature: 0,
      maxTokens: 400,
      operation: 'GENERIC',
      metadata: { usage: 'element_locator', candidateCount: slimmed.length },
      accountId,
      userId,
      siteId,
    });
    // Guard: pick.widget_id must exist in the candidates list.
    if (pick?.widget_id && !slimmed.some(c => c.id === pick.widget_id)) {
      return { widget_id: null, confidence: 'low', reason: `AI returned id ${pick.widget_id} which is not in candidates list.` };
    }
    return pick;
  } catch (err) {
    console.warn('[element-locator-ai] Gemini call failed:', err.message);
    return { widget_id: null, confidence: 'low', reason: `AI fallback failed: ${err.message}` };
  }
}
