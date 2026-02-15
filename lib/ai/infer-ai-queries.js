/**
 * AI Query Inference Engine
 *
 * Reverse-engineers the probable user prompts that led AI engines
 * (ChatGPT, Perplexity, Claude, Gemini) to cite specific site pages.
 *
 * Flow: GA4 AI landing pages → match SiteEntity in DB → Gemini inference
 */

import prisma from '@/lib/prisma';
import { generateStructuredResponse } from './gemini.js';
import { z } from 'zod';

// ─── Step 1: Match landing page paths to DB entities ───────────────────────

/**
 * Given a siteId and an array of GA4 landing-page paths, find matching
 * SiteEntity records so we can pass rich context (title, excerpt) to Gemini.
 *
 * @param {string} siteId
 * @param {{ page: string, sessions: number }[]} landingPages
 * @returns {Promise<Array<{ page: string, sessions: number, title: string|null, excerpt: string|null, slug: string|null }>>}
 */
export async function matchLandingPagesToEntities(siteId, landingPages) {
  if (!landingPages?.length) return [];

  // Extract slugs from paths: "/blog/seo-tips/" → "seo-tips"
  const pathSlugs = landingPages.map(lp => {
    const clean = lp.page.replace(/^\/|\/$/g, '');          // trim slashes
    const parts = clean.split('/');
    return parts[parts.length - 1] || clean;                 // last segment
  });

  // Batch-fetch all entities for this site that match any slug
  const entities = await prisma.siteEntity.findMany({
    where: {
      siteId,
      slug: { in: pathSlugs },
      status: 'PUBLISHED',
    },
    select: { slug: true, title: true, excerpt: true, url: true },
  });

  // Build a slug → entity map for fast lookup
  const slugMap = {};
  for (const e of entities) {
    slugMap[e.slug] = e;
  }

  return landingPages.map(lp => {
    const clean = lp.page.replace(/^\/|\/$/g, '');
    const parts = clean.split('/');
    const slug = parts[parts.length - 1] || clean;
    const entity = slugMap[slug] || null;

    return {
      page: lp.page,
      sessions: lp.sessions,
      title: entity?.title || humanizeSlug(slug),
      excerpt: entity?.excerpt || null,
      slug,
    };
  });
}

/**
 * Fallback: turn a URL slug into a human-readable string.
 * "best-running-shoes-2026" → "Best Running Shoes 2026"
 */
function humanizeSlug(slug) {
  if (!slug || slug === '/' || slug === '') return null;
  return slug
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim() || null;
}

// ─── Step 2: Call Gemini to infer probable prompts ─────────────────────────

const inferredQuerySchema = z.object({
  pages: z.array(z.object({
    page: z.string().describe('The landing page path'),
    prompts: z.object({
      direct:     z.string().describe('A direct how-to / informational question'),
      comparison: z.string().describe('A comparison or "best of" query'),
      discovery:  z.string().describe('A broad discovery / exploratory prompt'),
    }),
  })),
});

/**
 * Send page data to Gemini and get back 3 inferred prompts per page.
 *
 * @param {Array<{ page: string, sessions: number, title: string|null, excerpt: string|null }>} pagesData
 * @param {string} locale - User's locale code (e.g. 'en', 'he')
 * @returns {Promise<Record<string, { direct: string, comparison: string, discovery: string }>>}
 *          Map: page path → inferred prompts
 */
export async function generateInferredAiPrompts(pagesData, locale = 'en') {
  if (!pagesData?.length) return {};

  // Only send the top 10 pages to keep the prompt concise
  const topPages = pagesData.slice(0, 10);

  const LOCALE_NAMES = {
    en: 'English',
    he: 'Hebrew',
    ar: 'Arabic',
    fr: 'French',
    de: 'German',
    es: 'Spanish',
    pt: 'Portuguese',
    ru: 'Russian',
    ja: 'Japanese',
    zh: 'Chinese',
  };
  const langName = LOCALE_NAMES[locale] || 'English';

  const pagesDescription = topPages.map((p, i) =>
    `${i + 1}. Path: "${p.page}" | Title: "${p.title || 'N/A'}" | Excerpt: "${(p.excerpt || '').slice(0, 120)}" | AI Sessions: ${p.sessions}`
  ).join('\n');

  const system = `You are an AI SEO Analyst. Below is a list of website pages that received traffic citations from AI engines (like ChatGPT, Perplexity, Claude, Gemini).

For each page, reverse engineer 3 distinct types of user prompts that an end-user would type into an AI chatbot, and that would cause the LLM to cite this page as a source:

1. **Direct Question** – A specific how-to or informational question (e.g., "How do I fix X?")
2. **Comparison** – A comparison or "best of" query (e.g., "Best tools for Y")
3. **Broad Discovery** – An exploratory prompt (e.g., "Tell me about Z")

Rules:
- Write ALL prompts in ${langName}.
- Make prompts realistic and natural — as a real ${langName}-speaking user would type them.
- Use the page title and excerpt for context; do NOT invent unrelated topics.
- Keep each prompt concise (under 80 characters).
- Return results for every page provided.`;

  const prompt = `Here are the pages:\n\n${pagesDescription}`;

  try {
    const result = await generateStructuredResponse({
      system,
      prompt,
      schema: inferredQuerySchema,
      temperature: 0.6,
      operation: 'AI_QUERY_INFERENCE',
      metadata: { pageCount: topPages.length },
    });

    // Convert array → map keyed by page path
    const map = {};
    for (const item of (result?.pages || [])) {
      map[item.page] = item.prompts;
    }
    return map;
  } catch (err) {
    console.error('[InferAiQueries] Gemini inference failed:', err.message);
    return {};
  }
}

// ─── Step 3: Orchestrator — ties everything together ───────────────────────

/**
 * Full pipeline: GA4 AI pages → DB match → Gemini inference.
 *
 * @param {string} siteId           – The site's DB id
 * @param {{ page: string, sessions: number }[]} topLandingPages – from fetchAITrafficStats
 * @param {string} locale           – User's locale code (e.g. 'en', 'he')
 * @returns {Promise<Array<{ page: string, sessions: number, title: string|null, prompts: { direct: string, comparison: string, discovery: string } | null }>>}
 */
export async function inferAiQueries(siteId, topLandingPages, locale = 'en') {
  if (!topLandingPages?.length) return [];

  // 1. Enrich with DB content
  const enriched = await matchLandingPagesToEntities(siteId, topLandingPages);

  // 2. Call Gemini (with locale for output language)
  const promptsMap = await generateInferredAiPrompts(enriched, locale);

  // 3. Merge
  return enriched.map(p => ({
    page: p.page,
    sessions: p.sessions,
    title: p.title,
    prompts: promptsMap[p.page] || null,
  }));
}
