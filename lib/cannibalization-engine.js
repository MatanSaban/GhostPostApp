/**
 * Hybrid Cannibalization Engine v2.0
 * 
 * A sophisticated 2-track detection system with AI-powered verification layer.
 * 
 * ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•
 * TRACK 1: PROACTIVE DETECTION (Database Only)
 *   - Compares ALL posts by Title and H1 with robust text normalization
 *   - Flags pairs with >60% similarity or exact starting prefix matches
 *   - Works immediately without requiring Google Search Console data
 * 
 * TRACK 2: REACTIVE GSC DETECTION (Search Console Data)
 *   - Rule A: Impression Split - flags when secondary URL has ג‰¥25% of primary's impressions
 *   - Rule B: Position Dance - flags when two URLs rank within 10 positions of each other
 *   - Uses percentage-based thresholds, no hardcoded impression limits
 * 
 * TRACK 3: DEDUPLICATION & AI VERIFICATION (The "Brain")
 *   - Combines and deduplicates pairs from both tracks
 *   - Deep semantic verification using gemini-3.1-pro-preview
 *   - Elite SEO Strategist + Master Linguist AI analysis
 * ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•
 */

import { z } from 'zod';
import prisma from './prisma.js';
import { generateStructuredResponse, cosineSimilarity, MODELS } from './ai/gemini.js';
import { getOrComputeEmbeddings } from './ai/embedding-cache.js';

// ג”€ג”€ג”€ TYPES ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

/**
 * @typedef {'PROACTIVE' | 'REACTIVE_GSC' | 'AI_VERIFIED'} CannibalizationLayerType
 * @typedef {'MERGE' | 'CANONICAL' | '301_REDIRECT' | 'DIFFERENTIATE'} RecommendedAction
 * 
 * @typedef {Object} CandidatePair
 * @property {string} urlA - First URL
 * @property {string} urlB - Second URL
 * @property {string} source - Detection source ('PROACTIVE' | 'REACTIVE_GSC')
 * @property {number} rawScore - Initial detection score
 * @property {Object} data - Additional context data
 * 
 * @typedef {Object} CannibalizationIssue
 * @property {CannibalizationLayerType} type - Detection layer
 * @property {string[]} urlsInvolved - Competing URLs
 * @property {number} confidenceScore - 0-100 confidence
 * @property {RecommendedAction} recommendedAction - Suggested fix
 * @property {string} reason - Detailed explanation
 * @property {Object} [data] - Additional context data
 */

// ג”€ג”€ג”€ CONSTANTS ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

// Track 1: Proactive Detection.
// Thresholds were intentionally loose for v1 to maximize recall — the side
// effect was a flood of low-precision pairs that all funneled to the AI
// verifier (expensive). Now that embeddings act as a precision floor in
// Track 3, we can tighten heuristics without losing real cannibalizations.
const PROACTIVE_SIMILARITY_THRESHOLD = 0.60; // Jaccard — unchanged
const PROACTIVE_CONTAINMENT_THRESHOLD = 0.70; // was 0.40 → too permissive on long titles
const PROACTIVE_BIGRAM_MIN_SHARED = 2; // require 2+ shared bigrams (raw count, not ratio)
const PROACTIVE_FOCUS_KW_MIN_TOKENS = 2; // single-word focus keyword alone is too generic

// Track 2: Reactive GSC Detection (25% impression split, 10 position dance)
// Row cap raised from 5k → 25k so larger sites get full per-query coverage
// (GSC daily quota is 50k rows / day per site, so 25k still leaves headroom).
const GSC_ROW_LIMIT = 25000;
const GSC_PAGE_SIZE = 1000; // Per-request page size (max allowed by GSC API)
const IMPRESSION_SPLIT_THRESHOLD = 0.25; // 25% of primary's impressions = flag
const POSITION_DANCE_THRESHOLD = 10; // Within 10 positions = potential dance
const CTR_DIVERGENCE_RATIO = 2.0; // One URL converts 2× better than another → likely intent mismatch
const CTR_DIVERGENCE_MIN_IMPRESSIONS = 100; // Need real volume to trust the CTR signal
const SECONDARY_PAIR_MIN_IMPRESSIONS = 25; // Min impressions for secondary↔secondary pairing

// AI Verification Batch Size (to avoid overwhelming the API)
const AI_VERIFICATION_BATCH_SIZE = 10;

// Embedding triage thresholds.
// Anchors: `COSINE_HIGH` → the Gemini call reliably returns MERGE, `COSINE_LOW` →
// reliably returns NOT_CANNIBALIZATION. Tuned to the stricter multilingual behavior
// of `gemini-embedding-001`; revisit if we swap to a different embedding model.
const COSINE_MERGE_THRESHOLD = 0.88;
const COSINE_NOT_CANN_THRESHOLD = 0.55;
// Agglomerative grouping: two URLs join the same subgroup only if their
// cosine similarity ≥ this. Anchored just above the "AI sometimes says
// not-cannibalization" zone — below this the verifier will frequently
// disagree, so keeping URLs together would just feed bad groups to the AI.
const COSINE_GROUP_KEEP_THRESHOLD = 0.65;

// Hebrew/English stop words for normalization.
// Two layers: classic grammatical particles + content-noise tokens that show
// up in titles ("guide", "best", "how to", "מדריך", "מאמר", "טיפים") and
// would otherwise generate Jaccard hits between unrelated posts that just
// happen to be "X guide" and "Y guide". Adding these suppresses a large
// chunk of historical false positives.
const STOP_WORDS = new Set([
  // Hebrew grammatical particles
  'את', 'של', 'על', 'עם', 'או', 'גם', 'כי', 'לא', 'אם', 'כל',
  'היא', 'הוא', 'הם', 'הן', 'אני', 'אתה', 'אנחנו',
  'הזה', 'הזאת', 'זה', 'זו', 'זאת', 'אבל', 'רק', 'כבר',
  'פה', 'עוד', 'מה', 'איך', 'למה', 'מי', 'כמה',
  'יש', 'אין', 'היה', 'היו', 'יהיה', 'להיות',
  // Single Hebrew prefix letters
  'ב', 'כ', 'ל', 'מ', 'ה', 'ו', 'ש',
  // Hebrew content-noise frequently in titles
  'מדריך', 'מאמר', 'רשימה', 'בלוג', 'אתר', 'אתרים', 'טיפים', 'דוגמאות',
  'הכל', 'חשוב', 'חינם', 'לדעת', 'מומלץ', 'מומלצים', 'בעברית',
  // English grammatical
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
  'that', 'this', 'these', 'those', 'it', 'its', 'we', 'you', 'they', 'he', 'she',
  'what', 'which', 'who', 'whom', 'how', 'why', 'when', 'where', 'if', 'then', 'so',
  // English content-noise
  'guide', 'guides', 'tips', 'tip', 'best', 'top', 'ultimate', 'complete', 'simple',
  'easy', 'quick', 'free', 'new', 'review', 'reviews', 'tutorial', 'tutorials',
  'beginners', 'beginner', 'about', 'overview', 'intro', 'introduction', 'list',
  'examples', 'example', 'guide2024', 'guide2025', '2024', '2025', '2026',
]);

// ג”€ג”€ג”€ AI VERIFICATION SCHEMA (gemini-3-pro-preview) ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

/**
 * Schema for the Elite SEO Strategist AI verification response.
 * Uses gemini-3-pro-preview for maximum reasoning capabilities.
 */
const AIVerificationSchema = z.object({
  isCannibalization: z.boolean().describe('True if the pages satisfy the EXACT SAME User Search Intent. If any page serves a different intent, set false.'),
  confidenceScore: z.number().min(0).max(100).describe('AI confidence score 0-100'),
  recommendedAction: z.enum([
    'MERGE',             // Combine pages into one canonical URL; 301 the losers.
    'CANONICAL',         // Keep URLs live; mark one as rel=canonical.
    'REDIRECT_301',      // Loser URL should die entirely (no residual traffic/links).
    'DIFFERENTIATE',     // Rewrite weaker page around a different user intent; keep both live.
    'NOT_CANNIBALIZATION', // Heuristic false positive — pages serve different intents.
  ]).describe('Resolution strategy. Prefer DIFFERENTIATE when both pages have real traffic on different intents; MERGE when content heavily overlaps; CANONICAL as a soft default; REDIRECT_301 only when the loser has no traffic or inbound links; NOT_CANNIBALIZATION when the heuristic mis-flagged.'),
  sharedIntent: z.string().describe('The common search intent description if cannibalization detected, or the diverging intents if not'),
  reasoning: z.string().describe('Detailed reasoning for the decision, including linguistic analysis'),
  semanticSignals: z.array(z.string()).describe('Detected signals: synonyms, morphological_variations, contextual_equivalence, slang_match, different_intent, different_funnel_stage')
});

// ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•
// TRACK 1: PROACTIVE DETECTION (Database Only)
// ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•

/**
 * Robust text normalization for comparison.
 * Removes punctuation, normalizes Unicode, strips stop words.
 * Does NOT strip Hebrew prefixes (too error-prone without morphological analysis).
 * Plural normalization happens after punctuation removal.
 * @param {string} text - Input text
 * @returns {string[]} Array of normalized tokens
 */
function normalizeText(text) {
  if (!text) return [];
  
  return text
    // Normalize Unicode (decompose and remove diacritics)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Convert to lowercase
    .toLowerCase()
    // Remove punctuation and special characters FIRST (keep letters and numbers)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    // Basic Hebrew plural/suffix normalization (\b doesn't work with Hebrew, use space/boundary)
    .replace(/([\u05D0-\u05EA]{3,})\u05D9\u05DD(?=\s|$)/g, '$1')   // Remove ים (masculine plural)
    .replace(/([\u05D0-\u05EA]{3,})\u05D5\u05EA(?=\s|$)/g, '$1')   // Remove ות (feminine plural)
    // Split into tokens
    .split(/\s+/)
    // Remove stop words and empty strings
    .filter(token => token.length > 1 && !STOP_WORDS.has(token));
}

/**
 * Extract meaningful bigrams (2-word sequences) from text.
 * Used for detecting shared phrases like "בניית אתרים" across titles.
 * @param {string[]} tokens - Normalized tokens
 * @returns {Set<string>} Set of bigram strings
 */
function extractBigrams(tokens) {
  const bigrams = new Set();
  for (let i = 0; i < tokens.length - 1; i++) {
    bigrams.add(`${tokens[i]}|${tokens[i + 1]}`);
  }
  return bigrams;
}

/**
 * Calculate containment similarity — how much of the shorter token set
 * is "contained" in the longer one. Better than Jaccard for long titles
 * that share a core topic but diverge on specifics.
 * @param {string[]} tokensA 
 * @param {string[]} tokensB 
 * @returns {number} 0-1 containment score
 */
function containmentSimilarity(tokensA, tokensB) {
  if (!tokensA.length || !tokensB.length) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const intersection = [...setA].filter(x => setB.has(x)).length;
  const minSize = Math.min(setA.size, setB.size);
  return minSize > 0 ? intersection / minSize : 0;
}

/**
 * Check if two token sets share meaningful bigrams.
 * Returns the ratio of shared bigrams to the smaller set of bigrams.
 * @param {Set<string>} bigramsA 
 * @param {Set<string>} bigramsB 
 * @returns {number} 0-1 bigram overlap score
 */
function bigramOverlap(bigramsA, bigramsB) {
  if (!bigramsA.size || !bigramsB.size) return { ratio: 0, shared: 0 };
  const shared = [...bigramsA].filter(x => bigramsB.has(x)).length;
  const minSize = Math.min(bigramsA.size, bigramsB.size);
  return { ratio: minSize > 0 ? shared / minSize : 0, shared };
}

/**
 * Calculate Jaccard similarity between two token arrays
 * @param {string[]} tokensA 
 * @param {string[]} tokensB 
 * @returns {number} 0-1 similarity score
 */
function jaccardSimilarity(tokensA, tokensB) {
  if (!tokensA.length || !tokensB.length) return 0;
  
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  
  const intersection = [...setA].filter(x => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  
  return union > 0 ? intersection / union : 0;
}

/**
 * Check if two texts share the same starting prefix (first 2-3 words)
 * @param {string} textA 
 * @param {string} textB 
 * @returns {boolean} True if prefix matches
 */
function hasPrefixMatch(textA, textB) {
  const tokensA = normalizeText(textA);
  const tokensB = normalizeText(textB);
  
  if (tokensA.length < 2 || tokensB.length < 2) return false;
  
  // Check if first 2 words match exactly
  return tokensA[0] === tokensB[0] && tokensA[1] === tokensB[1];
}

/**
 * Extract H1 from entity metadata or SEO data
 * @param {Object} entity 
 * @returns {string}
 */
function extractH1(entity) {
  return entity.metadata?.h1 || entity.seoData?.h1 || entity.seoData?.title || entity.title || '';
}

/**
 * Extract focus keyword from SEO data
 * @param {Object} seoData
 * @returns {string|null}
 */
function extractFocusKeyword(seoData) {
  if (!seoData) return null;
  return seoData.focusKeyword || seoData.focuskw || seoData._yoast_wpseo_focuskw ||
         seoData.rank_math_focus_keyword || seoData.focus_keyword || null;
}

/**
 * Pull hreflang / language-alternate URLs out of an entity's metadata blobs.
 *
 * Two URLs declared as hreflang alternates are NOT cannibalizing — they're
 * language variants of the same page. Google treats them as one canonical
 * cluster. Before this filter, a site that auto-translates pages via Polylang
 * or WPML could accumulate dozens of /en/foo + /he/foo + /es/foo phantom
 * "cannibalization" pairs that waste the AI verifier's budget and, worse, end
 * up as suggestions users have to dismiss every run.
 *
 * We read from whatever's populated (defensive — sync layer may or may not
 * store these yet). Recognised shapes, in priority order:
 *   1. metadata.hreflangs:       [{locale, href}] OR {locale: href}
 *   2. metadata.polylang_translations: {locale: postIdOrUrl}
 *   3. metadata.wpml_translations:     {locale: postIdOrUrl}
 *   4. seoData.hreflang:              same as #1 (Yoast Premium / RankMath Pro)
 * Values that look like post IDs (pure integers) are skipped — we can't
 * resolve them to URLs without a lookup and the filter is a pure defensive
 * no-op when we can't produce URLs.
 */
function extractHreflangAlternates(entity) {
  const alternates = new Set();
  if (!entity) return alternates;

  const pushHref = (href) => {
    if (!href || typeof href !== 'string') return;
    if (/^\d+$/.test(href.trim())) return; // raw post id — skip
    alternates.add(href.trim());
  };

  const ingestCollection = (collection) => {
    if (!collection) return;
    if (Array.isArray(collection)) {
      for (const item of collection) {
        if (!item) continue;
        if (typeof item === 'string') pushHref(item);
        else if (typeof item === 'object') pushHref(item.href || item.url);
      }
    } else if (typeof collection === 'object') {
      for (const val of Object.values(collection)) {
        if (!val) continue;
        if (typeof val === 'string') pushHref(val);
        else if (typeof val === 'object') pushHref(val.href || val.url);
      }
    }
  };

  ingestCollection(entity.metadata?.hreflangs);
  ingestCollection(entity.metadata?.polylang_translations);
  ingestCollection(entity.metadata?.wpml_translations);
  ingestCollection(entity.seoData?.hreflang);

  return alternates;
}

/**
 * Build a symmetric url→set-of-alternate-urls map from a list of entities.
 * Handles missing-reverse-edges (if A declares B but B doesn't declare A,
 * we still treat them as alternates from A's perspective) and strips
 * trailing slashes so /en/foo and /en/foo/ match.
 */
function buildHreflangAlternateIndex(entities) {
  const index = new Map();
  if (!entities || !entities.length) return index;

  const canon = (u) => {
    if (!u) return '';
    try {
      return String(u).replace(/\/+$/, '').toLowerCase();
    } catch { return ''; }
  };

  const addEdge = (a, b) => {
    if (!a || !b || a === b) return;
    if (!index.has(a)) index.set(a, new Set());
    index.get(a).add(b);
  };

  for (const entity of entities) {
    const selfUrl = canon(entity.url || `/${entity.slug || ''}`);
    if (!selfUrl) continue;
    const alternates = extractHreflangAlternates(entity);
    for (const alt of alternates) {
      const altCanon = canon(alt);
      if (!altCanon) continue;
      addEdge(selfUrl, altCanon);
      addEdge(altCanon, selfUrl);
    }
  }
  return index;
}

/**
 * Are two URLs declared as hreflang alternates of each other?
 */
function areHreflangAlternates(urlA, urlB, alternateIndex) {
  if (!alternateIndex || !alternateIndex.size) return false;
  const a = String(urlA || '').replace(/\/+$/, '').toLowerCase();
  const b = String(urlB || '').replace(/\/+$/, '').toLowerCase();
  if (!a || !b || a === b) return false;
  return alternateIndex.get(a)?.has(b) === true;
}

/**
 * TRACK 1: Detect cannibalization candidates from database entities
 * Compares ALL posts by Title and H1 with robust normalization
 * 
 * @param {Array} siteEntities - Array of SiteEntity objects
 * @returns {CandidatePair[]} Array of candidate pairs
 */
export function detectProactive(siteEntities) {
  const candidates = [];

  if (!siteEntities || siteEntities.length < 2) return candidates;

  // Helper to check if URL is a homepage
  const isHomepage = (url) => {
    if (!url) return false;
    const normalized = url.replace(/^https?:\/\/[^/]+/, '').replace(/\/+$/, '');
    return normalized === '' || normalized === '/';
  };

  // Hreflang alternates should never be flagged as cannibalization — they're
  // the *same page in different languages*. Build the index once from the
  // full entity list (before filtering/mapping) so we can skip flagged pairs
  // cheaply in the inner loop below.
  const hreflangIndex = buildHreflangAlternateIndex(siteEntities);

  // Pre-process all entities for comparison, excluding homepages.
  const processedEntities = siteEntities
    .filter(entity => {
      const url = entity.url || `/${entity.slug}`;
      return !isHomepage(url);
    })
    .map(entity => {
      const titleTokens = normalizeText(entity.title);
      const h1Tokens = normalizeText(extractH1(entity));
      return {
        id: entity.id,
        url: entity.url || `/${entity.slug}`,
        title: entity.title || '',
        h1: extractH1(entity),
        focusKeyword: extractFocusKeyword(entity.seoData),
        titleTokens,
        h1Tokens,
        titleBigrams: extractBigrams(titleTokens),
        h1Bigrams: extractBigrams(h1Tokens),
        type: entity.entityType?.slug || 'post',
      };
    });

  // ─── Blocking key index ───
  // O(n²) on a 5k-post site is 12.5M comparisons. Most will share zero
  // tokens. We bucket every entity under the first 3 meaningful tokens of
  // its title (and separately of its H1) — entities that share at least
  // one bucket *might* cannibalize; entities that share none never will
  // (Jaccard requires at least one shared token; same for containment and
  // bigram overlap). This typically cuts the comparison count by 50-100×
  // on real corpora while preserving correctness.
  const buckets = new Map();
  const addToBucket = (key, idx) => {
    if (!key) return;
    if (!buckets.has(key)) buckets.set(key, new Set());
    buckets.get(key).add(idx);
  };
  for (let i = 0; i < processedEntities.length; i++) {
    const e = processedEntities[i];
    for (const t of [...e.titleTokens, ...e.h1Tokens].slice(0, 6)) addToBucket(t, i);
  }

  // Build the candidate-pair set: every (i,j) where i and j co-occur in
  // at least one bucket. Set semantics dedupes naturally.
  const candidatePairs = new Set();
  for (const idxSet of buckets.values()) {
    if (idxSet.size < 2) continue;
    const idxs = [...idxSet];
    for (let a = 0; a < idxs.length; a++) {
      for (let b = a + 1; b < idxs.length; b++) {
        const lo = Math.min(idxs[a], idxs[b]);
        const hi = Math.max(idxs[a], idxs[b]);
        candidatePairs.add(lo * 100000 + hi);
      }
    }
  }

  for (const packed of candidatePairs) {
    const i = Math.floor(packed / 100000);
    const j = packed % 100000;
    const entityA = processedEntities[i];
    const entityB = processedEntities[j];

    if (entityA.url === entityB.url) continue;

    // Skip hreflang alternates — they're language variants, not cannibalization.
    if (areHreflangAlternates(entityA.url, entityB.url, hreflangIndex)) continue;

    const titleSimilarity = jaccardSimilarity(entityA.titleTokens, entityB.titleTokens);
    const h1Similarity    = jaccardSimilarity(entityA.h1Tokens, entityB.h1Tokens);
    const titlePrefixMatch = hasPrefixMatch(entityA.title, entityB.title);
    const h1PrefixMatch    = hasPrefixMatch(entityA.h1, entityB.h1);
    const titleContainment = containmentSimilarity(entityA.titleTokens, entityB.titleTokens);
    const h1Containment    = containmentSimilarity(entityA.h1Tokens, entityB.h1Tokens);
    const titleBigram = bigramOverlap(entityA.titleBigrams, entityB.titleBigrams);
    const h1Bigram    = bigramOverlap(entityA.h1Bigrams, entityB.h1Bigrams);

    // Focus-keyword match — only counts if the keyword has ≥2 tokens. A
    // single-word focus keyword like "marketing" would otherwise pair every
    // marketing post with every other marketing post.
    const aKwTokens = entityA.focusKeyword ? normalizeText(entityA.focusKeyword) : [];
    const bKwTokens = entityB.focusKeyword ? normalizeText(entityB.focusKeyword) : [];
    const focusKeywordMatch = !!(
      aKwTokens.length >= PROACTIVE_FOCUS_KW_MIN_TOKENS &&
      bKwTokens.length >= PROACTIVE_FOCUS_KW_MIN_TOKENS &&
      aKwTokens.join(' ') === bKwTokens.join(' ')
    );

    const combinedSimilarity = (titleSimilarity + h1Similarity) / 2;
    const combinedContainment = (titleContainment + h1Containment) / 2;
    const sharedBigrams = Math.max(titleBigram.shared, h1Bigram.shared);

    const shouldFlag = (
      combinedSimilarity > PROACTIVE_SIMILARITY_THRESHOLD ||
      titlePrefixMatch ||
      h1PrefixMatch ||
      combinedContainment > PROACTIVE_CONTAINMENT_THRESHOLD ||
      sharedBigrams >= PROACTIVE_BIGRAM_MIN_SHARED ||
      focusKeywordMatch
    );
    if (!shouldFlag) continue;

    let rawScore = combinedSimilarity * 100;
    if (titlePrefixMatch) rawScore += 20;
    if (h1PrefixMatch) rawScore += 15;
    if (combinedContainment > PROACTIVE_CONTAINMENT_THRESHOLD) rawScore += 15;
    if (sharedBigrams >= PROACTIVE_BIGRAM_MIN_SHARED) rawScore += Math.min(20, sharedBigrams * 5);
    if (focusKeywordMatch) rawScore += 25;

    candidates.push({
      urlA: entityA.url,
      urlB: entityB.url,
      source: 'PROACTIVE',
      rawScore: Math.min(rawScore, 100),
      data: {
        entityA: { title: entityA.title, h1: entityA.h1, focusKeyword: entityA.focusKeyword },
        entityB: { title: entityB.title, h1: entityB.h1, focusKeyword: entityB.focusKeyword },
        titleSimilarity: Math.round(titleSimilarity * 100),
        h1Similarity: Math.round(h1Similarity * 100),
        combinedSimilarity: Math.round(combinedSimilarity * 100),
        titleContainment: Math.round(titleContainment * 100),
        h1Containment: Math.round(h1Containment * 100),
        titleBigramScore: Math.round(titleBigram.ratio * 100),
        h1BigramScore: Math.round(h1Bigram.ratio * 100),
        sharedBigrams,
        titlePrefixMatch,
        h1PrefixMatch,
        focusKeywordMatch,
      },
    });
  }

  return candidates;
}

// ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•
// TRACK 2: REACTIVE GSC DETECTION (Search Console Data)
// ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•

/**
 * Normalize URL for consistent comparison
 * @param {string} url 
 * @returns {string}
 */
function normalizeUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/$/, '')}`.toLowerCase();
  } catch {
    return url.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
  }
}

/**
 * Coarse intent bucket for a URL: the first segment of its path.
 *
 * Used to suppress reactive pairs whose URL paths almost certainly serve
 * different intents (e.g. `/blog/x-vs-y` vs `/shop/x-vs-y` — same query,
 * different funnel stage). We pair only URLs that share a bucket, OR pairs
 * where one side has no bucket (homepage / single-segment).
 *
 * Returns a normalized lowercased bucket like "blog", "shop", "guides", or
 * "" for root-level URLs. Trailing slashes and query strings stripped.
 */
function intentBucket(url) {
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').filter(Boolean)[0] || '';
    return seg.toLowerCase();
  } catch {
    const m = String(url || '').replace(/^https?:\/\/[^/]+/, '').split('/').filter(Boolean);
    return (m[0] || '').toLowerCase();
  }
}

/**
 * Lexical classifier: map a search query to one of four SEO intent buckets.
 * This is a rough, language-aware heuristic — not a model — but the verifier
 * only needs a hint, not a ground-truth label. Hebrew + English covered; other
 * languages fall through to 'unknown' and get no bias.
 *
 *   informational: the user is learning (how / why / what / guide)
 *   commercial:    the user is comparing options (best / vs / review / top)
 *   transactional: the user is buying / booking (buy / price / near me)
 *   navigational:  a brand or direct-lookup signal (login / contact / careers)
 *   unknown:       short / ambiguous — don't bias the verifier
 *
 * Returns `{ label, matched }` — `matched` lists the keywords that hit, so
 * downstream callers can reveal *why* a query got its label in the prompt.
 */
const INTENT_LEXICON = {
  informational: [
    // English
    'how', 'how to', 'what', 'what is', 'why', 'when', 'where', 'guide', 'tutorial',
    'learn', 'examples', 'meaning', 'definition', 'explained', 'introduction',
    // Hebrew
    'איך', 'מה', 'למה', 'מתי', 'היכן', 'מדריך', 'דוגמאות', 'משמעות', 'הסבר',
  ],
  commercial: [
    // English
    'best', 'top', 'vs', 'versus', 'comparison', 'compare', 'review', 'reviews',
    'rating', 'alternatives', 'alternative', 'difference between', 'which is better',
    // Hebrew
    'הטוב ביותר', 'הטובים', 'הכי טוב', 'מול', 'נגד', 'ביקורת', 'ביקורות', 'השוואה',
    'חלופות', 'חלופה', 'דירוג',
  ],
  transactional: [
    // English
    'buy', 'order', 'price', 'cost', 'cheap', 'cheapest', 'deal', 'deals',
    'discount', 'coupon', 'promo', 'sale', 'shop', 'near me', 'book', 'hire',
    'download', 'for sale',
    // Hebrew
    'לקנות', 'קונה', 'קנייה', 'רכישה', 'מחיר', 'מחירים', 'זול', 'זולים', 'בזול',
    'הזמנה', 'להזמין', 'הנחה', 'הנחות', 'קופון', 'מבצע', 'מבצעים', 'להוריד',
  ],
  navigational: [
    // English brand / admin-style signals
    'login', 'log in', 'sign in', 'contact', 'careers', 'jobs', 'about us', 'help',
    // Hebrew
    'התחברות', 'כניסה', 'יצירת קשר', 'צור קשר', 'עלינו', 'אודות', 'קריירה', 'דרושים',
  ],
};

function classifyQueryIntent(query) {
  const q = String(query || '').toLowerCase().trim();
  if (!q || q.length < 2) return { label: 'unknown', matched: [] };
  const matched = { informational: [], commercial: [], transactional: [], navigational: [] };
  for (const [label, terms] of Object.entries(INTENT_LEXICON)) {
    for (const term of terms) {
      // Word-boundary match for English terms; substring for Hebrew (no \b support)
      const isHebrew = /[\u05D0-\u05EA]/.test(term);
      const hit = isHebrew
        ? q.includes(term)
        : new RegExp(`(^|\\s)${term.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}(\\s|$)`, 'i').test(q);
      if (hit) matched[label].push(term);
    }
  }
  // Priority: transactional > commercial > informational > navigational.
  // Users signalling intent-to-buy should override a casual "best" modifier.
  for (const pref of ['transactional', 'commercial', 'informational', 'navigational']) {
    if (matched[pref].length > 0) return { label: pref, matched: matched[pref].slice(0, 3) };
  }
  return { label: 'unknown', matched: [] };
}

/**
 * Given a list of GSC query rows for a single URL, infer the page's dominant
 * user intent. Weighted by impressions so loud queries dominate over tail noise.
 *
 * Returns `{ label, confidence, breakdown }` where breakdown is the per-intent
 * impression share. confidence ∈ [0, 1] — the winning share. Below ~0.4 means
 * the URL is genuinely multi-intent and the verifier should treat it as
 * weaker signal.
 */
function inferUrlIntent(queryRows) {
  const totals = { informational: 0, commercial: 0, transactional: 0, navigational: 0, unknown: 0 };
  let totalImpr = 0;
  for (const row of queryRows || []) {
    const w = Math.max(row.impressions || 0, 1);
    const { label } = classifyQueryIntent(row.query);
    totals[label] += w;
    totalImpr += w;
  }
  if (totalImpr === 0) return { label: 'unknown', confidence: 0, breakdown: totals };
  let top = 'unknown';
  let topShare = 0;
  const breakdown = {};
  for (const [label, w] of Object.entries(totals)) {
    const share = w / totalImpr;
    breakdown[label] = Math.round(share * 100) / 100;
    if (label !== 'unknown' && share > topShare) {
      top = label;
      topShare = share;
    }
  }
  return { label: top, confidence: Math.round(topShare * 100) / 100, breakdown };
}

/**
 * TRACK 2: Detect cannibalization candidates from GSC data.
 *
 * Three signal rules per query:
 *   A. Impression Split — competing URL has ≥25% of the primary's impressions
 *   B. Position Dance   — two URLs rank within 10 positions of each other
 *   C. CTR Divergence   — same query, both URLs have ≥100 impressions, and
 *                         CTR ratio ≥2× → query intent likely fits one URL
 *                         materially better; the loser is bleeding clicks
 *
 * Pairing strategy: every URL pairs with every other URL above
 * `SECONDARY_PAIR_MIN_IMPRESSIONS` (not just primary↔secondary). This catches
 * the case where a 3rd-place page is cannibalizing a 4th-place page while
 * the primary owns the slot. Pair count is bounded by intent bucket: we
 * skip pairs whose URL path top-level differs (different funnel stages).
 *
 * @param {Array} gscData - Raw GSC query+page data with {query, page, impressions, clicks, position, ctr}
 * @returns {CandidatePair[]}
 */
export function detectReactiveGsc(gscData) {
  const candidates = [];
  if (!gscData || !gscData.length) return candidates;

  // Group by query (case-insensitive). Per-query, per-URL aggregates.
  const queryGroups = new Map();
  for (const row of gscData) {
    const query = (row.query || '').toLowerCase().trim();
    if (!query) continue;
    if (!queryGroups.has(query)) queryGroups.set(query, new Map());

    const pageData = queryGroups.get(query);
    const normalizedPage = normalizeUrl(row.page);
    if (!pageData.has(normalizedPage)) {
      pageData.set(normalizedPage, { url: row.page, impressions: 0, clicks: 0, positions: [] });
    }
    const existing = pageData.get(normalizedPage);
    existing.impressions += row.impressions || 0;
    existing.clicks += row.clicks || 0;
    existing.positions.push(row.position || 0);
  }

  const seenPairs = new Set();

  for (const [query, pageMap] of queryGroups) {
    if (pageMap.size < 2) continue;

    const pages = [...pageMap.values()]
      .map(p => ({
        ...p,
        avgPosition: p.positions.length > 0 ? p.positions.reduce((a, b) => a + b, 0) / p.positions.length : 100,
        ctr: p.impressions > 0 ? p.clicks / p.impressions : 0,
        bucket: intentBucket(p.url),
      }))
      .sort((a, b) => b.impressions - a.impressions);

    const primary = pages[0];

    // Pair every page with every other (i<j), not just primary↔secondary.
    // Bounded by intent bucket and a min-impression floor for non-primary pairs.
    for (let i = 0; i < pages.length; i++) {
      for (let j = i + 1; j < pages.length; j++) {
        const a = pages[i];
        const b = pages[j];

        // Floor: if neither side is primary, both need real volume to count.
        // Without this we'd pair every long-tail impression with every other.
        if (i > 0 && (a.impressions < SECONDARY_PAIR_MIN_IMPRESSIONS || b.impressions < SECONDARY_PAIR_MIN_IMPRESSIONS)) continue;

        // Intent bucket gate: skip pairs whose URL top-level path differs
        // (e.g. blog vs shop). Empty bucket on either side passes through.
        if (a.bucket && b.bucket && a.bucket !== b.bucket) continue;

        const pairKey = [normalizeUrl(a.url), normalizeUrl(b.url)].sort().join('|');
        if (seenPairs.has(pairKey)) continue;

        // Rule A: Impression Split — relative to whichever side has more.
        const high = Math.max(a.impressions, b.impressions);
        const low = Math.min(a.impressions, b.impressions);
        const impressionRatio = high > 0 ? low / high : 0;
        const isImpressionSplit = impressionRatio >= IMPRESSION_SPLIT_THRESHOLD;

        // Rule B: Position Dance.
        const positionDiff = Math.abs(a.avgPosition - b.avgPosition);
        const isPositionDance = positionDiff <= POSITION_DANCE_THRESHOLD;

        // Rule C: CTR Divergence — both sides have real volume AND one converts
        // materially better. Strong sign that the query intent fits one URL
        // and the other is collecting impressions but losing the click war.
        let isCtrDivergence = false;
        let ctrRatio = 0;
        if (a.impressions >= CTR_DIVERGENCE_MIN_IMPRESSIONS && b.impressions >= CTR_DIVERGENCE_MIN_IMPRESSIONS) {
          const ctrHi = Math.max(a.ctr, b.ctr);
          const ctrLo = Math.min(a.ctr, b.ctr);
          ctrRatio = ctrLo > 0 ? ctrHi / ctrLo : (ctrHi > 0 ? Infinity : 0);
          isCtrDivergence = ctrRatio >= CTR_DIVERGENCE_RATIO;
        }

        if (!isImpressionSplit && !isPositionDance && !isCtrDivergence) continue;
        seenPairs.add(pairKey);

        // Score: each rule contributes up to ~33-50; cap at 100.
        let rawScore = 0;
        if (isImpressionSplit) rawScore += Math.min(impressionRatio * 100, 50);
        if (isPositionDance)   rawScore += Math.max(50 - positionDiff * 5, 0);
        if (isCtrDivergence)   rawScore += Math.min(ctrRatio * 10, 30);

        // Reorient to primary↔secondary by impressions for downstream display.
        const [pri, sec] = a.impressions >= b.impressions ? [a, b] : [b, a];

        candidates.push({
          urlA: pri.url,
          urlB: sec.url,
          source: 'REACTIVE_GSC',
          rawScore: Math.min(Math.max(rawScore, 0), 100),
          data: {
            query,
            primaryImpressions: pri.impressions,
            secondaryImpressions: sec.impressions,
            impressionRatio: Math.round(impressionRatio * 100),
            primaryPosition: Math.round(pri.avgPosition * 10) / 10,
            secondaryPosition: Math.round(sec.avgPosition * 10) / 10,
            positionDiff: Math.round(positionDiff * 10) / 10,
            primaryCtr: Math.round(pri.ctr * 10000) / 100,
            secondaryCtr: Math.round(sec.ctr * 10000) / 100,
            ctrRatio: Number.isFinite(ctrRatio) ? Math.round(ctrRatio * 100) / 100 : null,
            primaryBucket: pri.bucket || null,
            isPrimarySecondaryPair: i === 0,
            signals: {
              impressionSplit: isImpressionSplit,
              positionDance: isPositionDance,
              ctrDivergence: isCtrDivergence,
            },
          },
        });
      }
    }
    // Suppress unused-var lint if nobody else reads `primary` in this scope.
    void primary;
  }

  return candidates;
}

// ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•
// TRACK 3: DEDUPLICATION & AI VERIFICATION (The "Brain")
// ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•

/**
 * Deduplicate candidate pairs from both tracks
 * If flagged by both tracks, boost the confidence score
 * 
 * @param {CandidatePair[]} proactiveCandidates 
 * @param {CandidatePair[]} reactiveCandidates 
 * @returns {CandidatePair[]} Deduplicated candidates with boosted scores
 */
export function deduplicateCandidates(proactiveCandidates, reactiveCandidates) {
  const pairMap = new Map();
  
  // Process proactive candidates
  for (const candidate of proactiveCandidates) {
    const key = [normalizeUrl(candidate.urlA), normalizeUrl(candidate.urlB)].sort().join('|');
    
    pairMap.set(key, {
      ...candidate,
      sources: ['PROACTIVE'],
      combinedScore: candidate.rawScore
    });
  }
  
  // Process reactive candidates (merge with existing or add new)
  for (const candidate of reactiveCandidates) {
    const key = [normalizeUrl(candidate.urlA), normalizeUrl(candidate.urlB)].sort().join('|');
    
    if (pairMap.has(key)) {
      // Pair found by BOTH tracks - boost confidence!
      const existing = pairMap.get(key);
      existing.sources.push('REACTIVE_GSC');
      
      // Boost: Average the scores + 15 bonus for multi-track detection
      const avgScore = (existing.rawScore + candidate.rawScore) / 2;
      existing.combinedScore = Math.min(avgScore + 15, 100);
      
      // Merge data from both sources
      existing.data = {
        ...existing.data,
        gscData: candidate.data
      };
    } else {
      pairMap.set(key, {
        ...candidate,
        sources: ['REACTIVE_GSC'],
        combinedScore: candidate.rawScore
      });
    }
  }
  
  // Convert back to array and sort by combined score
  return [...pairMap.values()].sort((a, b) => b.combinedScore - a.combinedScore);
}

// ═══════════════════════════════════════════════════════════════════════════
// URL GROUPING - Cluster overlapping pairs into groups
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Union-Find (Disjoint Set Union) implementation for URL grouping
 */
class UnionFind {
  constructor() {
    this.parent = new Map();
    this.rank = new Map();
  }
  
  find(x) {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
    if (this.parent.get(x) !== x) {
      this.parent.set(x, this.find(this.parent.get(x))); // Path compression
    }
    return this.parent.get(x);
  }
  
  union(x, y) {
    const rootX = this.find(x);
    const rootY = this.find(y);
    if (rootX === rootY) return;
    
    // Union by rank
    const rankX = this.rank.get(rootX);
    const rankY = this.rank.get(rootY);
    if (rankX < rankY) {
      this.parent.set(rootX, rootY);
    } else if (rankX > rankY) {
      this.parent.set(rootY, rootX);
    } else {
      this.parent.set(rootY, rootX);
      this.rank.set(rootX, rankX + 1);
    }
  }
}

/**
 * Group overlapping candidate pairs into URL groups
 * 
 * If pairs are: (A,B), (A,C), (B,C) -> group will be [A, B, C]
 * 
 * @param {CandidatePair[]} candidates - Deduplicated candidate pairs
 * @returns {CandidateGroup[]} Array of grouped candidates
 */
export function groupCandidates(candidates) {
  if (!candidates || candidates.length === 0) return [];
  
  // Only merge pairs scoring above this threshold into transitive groups.
  // Below this, pairs stay as standalone 2-URL groups to prevent mega-groups
  // from chaining weakly related pages together.
  const GROUP_MERGE_THRESHOLD = 50;
  
  const uf = new UnionFind();
  const urlData = new Map(); // Store metadata per URL
  
  // Pass 1: Build URL groups using Union-Find (only for high-score pairs)
  for (const candidate of candidates) {
    const normA = normalizeUrl(candidate.urlA);
    const normB = normalizeUrl(candidate.urlB);
    
    const score = candidate.combinedScore || candidate.rawScore || 0;
    if (score >= GROUP_MERGE_THRESHOLD) {
      uf.union(normA, normB);
    }
    
    // Store URL data for each URL
    if (!urlData.has(normA)) {
      urlData.set(normA, {
        url: candidate.urlA,
        entity: candidate.data?.entityA || { title: candidate.urlA }
      });
    }
    if (!urlData.has(normB)) {
      urlData.set(normB, {
        url: candidate.urlB,
        entity: candidate.data?.entityB || { title: candidate.urlB }
      });
    }
  }
  
  // Pass 2: Collect URLs into groups.
  // High-score pairs share a Union-Find root → same group.
  // Low-score pairs where URLs aren't in the same union → standalone 2-URL group.
  const groupMap = new Map(); // root -> { urls, candidates, ... }
  let standalonePairIdx = 0;
  
  for (const candidate of candidates) {
    const normA = normalizeUrl(candidate.urlA);
    const normB = normalizeUrl(candidate.urlB);
    const rootA = uf.find(normA);
    const rootB = uf.find(normB);
    
    // If both URLs share a root (high-score union), use that root.
    // Otherwise, create a standalone pair group so weak pairs
    // don't inflate existing groups.
    const root = (rootA === rootB)
      ? rootA
      : `__standalone_${standalonePairIdx++}`;
    
    if (!groupMap.has(root)) {
      groupMap.set(root, {
        urls: new Set(),
        entities: new Map(),
        sources: new Set(),
        scores: [],
        pairs: [],
        data: {}
      });
    }
    
    const group = groupMap.get(root);
    
    // Add URLs to group
    group.urls.add(candidate.urlA);
    group.urls.add(candidate.urlB);
    
    // Add entities
    if (candidate.data?.entityA) {
      group.entities.set(normA, candidate.data.entityA);
    }
    if (candidate.data?.entityB) {
      group.entities.set(normB, candidate.data.entityB);
    }
    
    // Accumulate sources
    if (candidate.sources) {
      candidate.sources.forEach(s => group.sources.add(s));
    } else if (candidate.source) {
      group.sources.add(candidate.source);
    }
    
    // Accumulate scores
    group.scores.push(candidate.combinedScore || candidate.rawScore);
    
    // Store pair info for detailed analysis
    group.pairs.push({
      urlA: candidate.urlA,
      urlB: candidate.urlB,
      score: candidate.combinedScore || candidate.rawScore,
      data: candidate.data
    });
    
    // Merge data from pairs
    if (candidate.data?.titleSimilarity) {
      group.data.titleSimilarity = Math.max(group.data.titleSimilarity || 0, candidate.data.titleSimilarity);
    }
    if (candidate.data?.h1Similarity) {
      group.data.h1Similarity = Math.max(group.data.h1Similarity || 0, candidate.data.h1Similarity);
    }
    if (candidate.data?.titlePrefixMatch) {
      group.data.titlePrefixMatch = true;
    }
    if (candidate.data?.h1PrefixMatch) {
      group.data.h1PrefixMatch = true;
    }
    if (candidate.data?.gscData || candidate.data?.query) {
      group.data.gscData = candidate.data.gscData || candidate.data;
    }
  }
  
  // Pass 3: Convert to flat array of groups
  const MAX_GROUP_SIZE = 6;
  const rawGroups = [];
  
  for (const [, group] of groupMap) {
    const urlsArr = [...group.urls];
    const sources = [...group.sources];
    const avgScore = group.scores.reduce((a, b) => a + b, 0) / group.scores.length;
    
    // Build entities array matching URL order
    const entities = urlsArr.map(url => {
      const normUrl = normalizeUrl(url);
      return group.entities.get(normUrl) || { title: url, url };
    });
    
    rawGroups.push({
      urls: urlsArr,
      entities,
      sources,
      combinedScore: Math.round(avgScore),
      pairs: group.pairs,
      data: group.data
    });
  }
  
  // Pass 4: Split oversized groups by keeping only top-scoring pairs
  const groups = [];
  for (const g of rawGroups) {
    if (g.urls.length <= MAX_GROUP_SIZE) {
      groups.push(g);
      continue;
    }
    // Re-group using only the top pairs sorted by score
    const sortedPairs = [...g.pairs].sort((a, b) => (b.score || 0) - (a.score || 0));
    const subUf = new UnionFind();
    const pairsUsed = [];
    
    for (const pair of sortedPairs) {
      const nA = normalizeUrl(pair.urlA);
      const nB = normalizeUrl(pair.urlB);
      subUf.union(nA, nB);
      pairsUsed.push(pair);
      
      // Count distinct roots - if we'd create groups too large, stop merging
      const roots = new Set();
      for (const p of pairsUsed) {
        roots.add(subUf.find(normalizeUrl(p.urlA)));
      }
      // Check if any cluster exceeds max
      const clusterSizes = new Map();
      for (const p of pairsUsed) {
        const r = subUf.find(normalizeUrl(p.urlA));
        clusterSizes.set(r, new Set([
          ...(clusterSizes.get(r) || new Set()),
          normalizeUrl(p.urlA),
          normalizeUrl(p.urlB)
        ]));
      }
      const tooLarge = [...clusterSizes.values()].some(s => s.size > MAX_GROUP_SIZE);
      if (tooLarge) {
        // Undo last union by breaking out — skip remaining pairs
        break;
      }
    }
    
    // Build sub-groups from the sub-UF
    const subGroupMap = new Map();
    for (const pair of pairsUsed) {
      const nA = normalizeUrl(pair.urlA);
      const root = subUf.find(nA);
      if (!subGroupMap.has(root)) {
        subGroupMap.set(root, { urls: new Set(), pairs: [], entities: new Map() });
      }
      const sg = subGroupMap.get(root);
      sg.urls.add(pair.urlA);
      sg.urls.add(pair.urlB);
      sg.pairs.push(pair);
      // Copy entity data from parent group
      const entityA = g.entities[g.urls.indexOf(pair.urlA)];
      const entityB = g.entities[g.urls.indexOf(pair.urlB)];
      if (entityA) sg.entities.set(normalizeUrl(pair.urlA), entityA);
      if (entityB) sg.entities.set(normalizeUrl(pair.urlB), entityB);
    }
    
    for (const [, sg] of subGroupMap) {
      const subUrls = [...sg.urls];
      const subAvg = sg.pairs.reduce((a, p) => a + (p.score || 0), 0) / sg.pairs.length;
      const subEntities = subUrls.map(url => sg.entities.get(normalizeUrl(url)) || { title: url, url });
      
      groups.push({
        urls: subUrls,
        entities: subEntities,
        sources: g.sources,
        combinedScore: Math.round(subAvg),
        pairs: sg.pairs,
        data: g.data
      });
    }
  }
  
  // Sort by number of URLs (more = more severe), then by score
  return groups.sort((a, b) => {
    if (b.urls.length !== a.urls.length) return b.urls.length - a.urls.length;
    return b.combinedScore - a.combinedScore;
  });
}

// Shared system prompt for AI verification — single source of truth.
const VERIFIER_SYSTEM_PROMPT = `You are an Elite SEO Strategist and a Master Linguist with native-level fluency in both Hebrew and English.

Your expertise includes:
- Deep understanding of search intent and user behavior
- Advanced knowledge of morphological analysis (especially Hebrew's complex root system)
- Recognition of synonyms, slang, colloquialisms, and contextual language variations
- Understanding of how different phrasings can represent identical user needs

When analyzing URLs for cannibalization:
- Focus on the UNDERLYING USER INTENT, not surface-level keyword matching
- Consider that "how to speed up WordPress" and "reducing TTFB and load times" serve THE SAME user need
- Recognize that different vocabulary often represents the same search journey
- Pay attention to funnel stage: informational/comparison/transactional pages with similar titles are NOT cannibalization
- Respect URL path buckets as signals of intent: /blog/ vs /services/ vs /product/ vs /docs/ usually means different intents

When recommending an action:
- MERGE: pages heavily overlap in content AND serve the same intent; one canonical URL will outperform both
- CANONICAL: pages overlap but keeping both URLs live is preferable (e.g. category + tag pages)
- REDIRECT_301: the loser URL has minimal traffic, no incoming links, and should disappear entirely
- DIFFERENTIATE: both pages have real traffic on adjacent intents; rewriting the weaker one around a different angle preserves both
- NOT_CANNIBALIZATION: the heuristic mis-flagged; pages serve genuinely different intents despite surface similarity

When an "Inferred intent from GSC queries" line is present, treat it as a strong signal derived from how real searchers engaged each URL:
- Same intent on both pages + high title/H1 overlap → lean MERGE (or CANONICAL).
- Divergent intent (e.g. informational vs transactional, or commercial vs navigational) on both pages → lean DIFFERENTIATE, or NOT_CANNIBALIZATION when the divergence is clean.
- Missing intent on one or both sides means the signal is weaker — fall back to title/H1/body evidence.

Be practical and decisive. Do not rubber-stamp every flagged pair as cannibalization.`;

/**
 * Build a detailed page context block for the verifier prompt.
 * Includes title, H1, focus keyword, URL-path bucket, body excerpt, and top GSC queries.
 */
function buildPageContext(url, entity = {}, gscHits = [], idx) {
  const label = String.fromCharCode(65 + idx); // A, B, C...
  const bodyExcerpt = (entity.bodyExcerpt || '').slice(0, 500);
  const pathBucket = (() => {
    try {
      const p = new URL(url).pathname;
      const seg = p.split('/').filter(Boolean)[0];
      return seg ? `/${seg}/` : '/';
    } catch {
      return 'unknown';
    }
  })();
  const queries = gscHits
    .slice(0, 3)
    .map(q => `"${q.query}" (impr=${q.impressions}, pos=${q.position.toFixed(1)})`)
    .join(', ');

  // Intent inference from GSC queries (weighted by impressions). Even a
  // weak hint like "informational (68%)" vs "transactional (72%)" is enough
  // for the verifier to bias toward DIFFERENTIATE when two pages show
  // divergent intent despite similar titles — or toward MERGE when they
  // both clearly serve the same intent.
  const intent = inferUrlIntent(gscHits);
  const intentLine = intent.label !== 'unknown'
    ? `\n- Inferred intent from GSC queries: ${intent.label} (confidence ${intent.confidence})`
    : '';

  return `### Page ${label}
- URL: ${url}
- URL-path bucket: ${pathBucket}
- Title: ${entity.title || '(not available)'}
- H1: ${entity.h1 || '(not available)'}
- Focus Keyword: ${entity.focusKeyword || '(not set)'}${intentLine}${queries ? `
- Top GSC queries: ${queries}` : ''}${bodyExcerpt ? `
- Body excerpt (first 500 chars): ${bodyExcerpt.replace(/\s+/g, ' ').trim()}` : ''}`;
}

// ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•
// MAIN ORCHESTRATOR
// ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•

/**
 * Verify URL groups using AI
 *
 * @param {CandidateGroup[]} groups - Grouped candidates from groupCandidates()
 * @param {{ accountId?: string, siteId?: string, userId?: string }} [context]
 *   Optional usage-tracking context so AI calls are billed to the right account.
 * @returns {Promise<CannibalizationIssue[]>} Verified cannibalization issues
 */
export async function verifyGroupsWithAI(groups, context = {}) {
  const verifiedIssues = [];

  if (!groups || groups.length === 0) return verifiedIssues;

  // Concurrency cap keeps us under Vertex RPM while still parallelizing.
  const CONCURRENCY = 5;
  const queue = [...groups];
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => (async () => {
    while (queue.length > 0) {
      const group = queue.shift();
      const issue = await verifyOneGroup(group, context);
      if (issue) verifiedIssues.push(issue);
    }
  })());
  await Promise.all(workers);

  return verifiedIssues.sort((a, b) => {
    if (b.urls.length !== a.urls.length) return b.urls.length - a.urls.length;
    return b.confidenceScore - a.confidenceScore;
  });
}

/**
 * Verify a single candidate group. Returns a CannibalizationIssue or null.
 * Accepts optional `embeddingHint` on the group ('MERGE_LIKELY' | 'NOT_LIKELY')
 * but always asks the AI — the orchestrator is what decides to skip the call.
 */
async function verifyOneGroup(group, context = {}) {
  try {
    const gscHits = group.gscHits || {};
    const pagesContext = group.urls
      .map((url, idx) => buildPageContext(url, group.entities[idx], gscHits[url] || [], idx))
      .join('\n\n');

    const signalList = [];
    if (group.data?.titlePrefixMatch) signalList.push('Title Prefix Match');
    if (group.data?.h1PrefixMatch) signalList.push('H1 Prefix Match');
    if (group.data?.titleSimilarity) signalList.push(`Max Title Similarity: ${group.data.titleSimilarity}%`);
    if (group.data?.h1Similarity) signalList.push(`Max H1 Similarity: ${group.data.h1Similarity}%`);
    if (group.data?.gscData?.query) signalList.push(`GSC Query conflict: "${group.data.gscData.query}"`);
    if (group.data?.gscData?.signals?.impressionSplit) signalList.push('Impression Split');
    if (group.data?.gscData?.signals?.positionDance) signalList.push('Position Dance');
    if (group.data?.gscData?.signals?.ctrDivergence) signalList.push('CTR Divergence');
    if (group.embeddingHint) signalList.push(`Embedding hint: ${group.embeddingHint} (cosine=${group.embeddingCosine?.toFixed(2)})`);

    const prompt = `## URL Group Analysis Request

This is a group of ${group.urls.length} page${group.urls.length > 1 ? 's' : ''} flagged as potentially cannibalizing each other.

${pagesContext}

### Detection Signals
- Detection Sources: ${group.sources.join(', ')}
- Combined Heuristic Score: ${group.combinedScore}%
${signalList.length > 0 ? signalList.map(s => `- ${s}`).join('\n') : ''}

## Your Task

1. Read each page's title, H1, URL-path bucket, GSC queries, and body excerpt.
2. Decide whether the pages genuinely compete on the SAME user search intent.
3. If yes, recommend the best resolution: MERGE, CANONICAL, REDIRECT_301, or DIFFERENTIATE.
4. If the heuristic mis-flagged and the pages serve different intents, return NOT_CANNIBALIZATION with isCannibalization=false.

Bias toward DIFFERENTIATE when both pages have distinct GSC queries driving traffic on different intents, even if the titles look similar.
Bias toward NOT_CANNIBALIZATION when URL-path buckets clearly indicate different purposes (e.g. /services/ vs /blog/).`;

    const result = await generateStructuredResponse({
      system: VERIFIER_SYSTEM_PROMPT,
      prompt,
      schema: AIVerificationSchema,
      temperature: 0.3,
      operation: 'CANNIBALIZATION_GROUP_VERIFICATION',
      metadata: { urls: group.urls, sources: group.sources, embeddingHint: group.embeddingHint },
      modelOverride: MODELS.PRO_PREVIEW,
      accountId: context.accountId,
      siteId: context.siteId,
      userId: context.userId,
    });

    if (!result?.isCannibalization) return null;
    // Belt-and-suspenders: the AI must not return NOT_CANNIBALIZATION alongside isCannibalization=true.
    if (result.recommendedAction === 'NOT_CANNIBALIZATION') return null;

    let finalConfidence = result.confidenceScore;
    if (group.sources.length > 1) finalConfidence = Math.min(finalConfidence + 10, 100);
    if (group.urls.length > 2) finalConfidence = Math.min(finalConfidence + 5 * (group.urls.length - 2), 100);

    let reasonKey = 'aiVerified';
    let reasonParams = { confidence: finalConfidence };
    if (group.sources.length > 1) {
      reasonKey = 'detectedBySource';
      reasonParams = { sources: group.sources.join(' + '), confidence: finalConfidence };
    } else if (group.sources.includes('PROACTIVE')) {
      if (group.data?.titlePrefixMatch || group.data?.h1PrefixMatch) {
        reasonKey = 'prefixMatch';
        reasonParams = {
          titlePrefixMatch: group.data?.titlePrefixMatch || false,
          h1PrefixMatch: group.data?.h1PrefixMatch || false,
          confidence: finalConfidence,
        };
      } else {
        reasonKey = 'titleH1Similarity';
        reasonParams = {
          titleSimilarity: group.data?.titleSimilarity || 0,
          h1Similarity: group.data?.h1Similarity || 0,
          confidence: finalConfidence,
        };
      }
    } else if (group.sources.includes('REACTIVE_GSC')) {
      const signals = [];
      if (group.data?.gscData?.signals?.impressionSplit) signals.push('impression split');
      if (group.data?.gscData?.signals?.positionDance) signals.push('position dance');
      if (group.data?.gscData?.signals?.ctrDivergence) signals.push('CTR divergence');
      reasonKey = 'querySignals';
      reasonParams = {
        query: group.data?.gscData?.query || '',
        signals: signals.join(', ') || 'search conflict',
      };
    }

    return {
      type: group.sources.length > 1 ? 'MULTI_TRACK' : (group.sources[0] === 'PROACTIVE' ? 'PROACTIVE' : 'AI_VERIFIED'),
      urls: group.urls,
      urlsInvolved: group.urls,
      entities: group.entities,
      confidenceScore: finalConfidence,
      recommendedAction: result.recommendedAction,
      reason: result.reasoning,
      reasonKey,
      reasonParams,
      data: {
        entities: group.entities,
        sharedIntent: result.sharedIntent,
        semanticSignals: result.semanticSignals,
        sources: group.sources,
        pairs: group.pairs,
        embeddingCosine: group.embeddingCosine,
      },
    };
  } catch (error) {
    console.error('[CannibalizationEngine] Group verification failed:', group.urls, error.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch GSC data with pagination (utility for external callers)
 * 
 * @param {string} accessToken - Google OAuth token
 * @param {string} siteUrl - GSC site URL
 * @param {number} days - Days of data to fetch
 * @returns {Promise<Array>}
 */
export async function fetchGSCDataWithPagination(accessToken, siteUrl, days = 30) {
  const fmt = (d) => d.toISOString().split('T')[0];

  // Dynamic freshness offset: GSC's data lag varies (typically 2-3 days but can
  // stretch to 4-5). A hardcoded 3-day offset silently dropped the latest day
  // of data on every run for ~1/3 of sites. Probe today→6 days back and use
  // the first date that returns at least one row.
  const today = new Date();
  let endDate = null;
  for (let offset = 1; offset <= 6; offset++) {
    const probe = new Date(today);
    probe.setDate(probe.getDate() - offset);
    const probeStr = fmt(probe);
    try {
      const probeRes = await fetch(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ startDate: probeStr, endDate: probeStr, dimensions: ['date'], rowLimit: 1 }),
        }
      );
      if (probeRes.ok) {
        const probeData = await probeRes.json();
        if ((probeData.rows || []).length > 0) {
          endDate = probe;
          break;
        }
      }
    } catch { /* keep probing */ }
  }
  if (!endDate) {
    endDate = new Date(today);
    endDate.setDate(endDate.getDate() - 3); // Conservative fallback if all probes fail
  }
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - days);

  const allRows = [];
  let startRow = 0;
  let hasMore = true;

  while (hasMore && startRow < GSC_ROW_LIMIT) {
    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: fmt(startDate),
          endDate: fmt(endDate),
          dimensions: ['query', 'page'],
          rowLimit: GSC_PAGE_SIZE,
          startRow,
          orderBy: [{ fieldName: 'impressions', sortOrder: 'DESCENDING' }],
        }),
      }
    );

    if (!res.ok) {
      console.error('[CannibalizationEngine] GSC fetch failed:', res.status);
      break;
    }

    const data = await res.json();
    const rows = data.rows || [];

    allRows.push(...rows.map(row => ({
      query: row.keys[0],
      page: row.keys[1],
      clicks: Math.round(row.clicks),
      impressions: Math.round(row.impressions),
      ctr: row.ctr,
      position: row.position,
    })));

    hasMore = rows.length === GSC_PAGE_SIZE;
    startRow += GSC_PAGE_SIZE;
  }

  return allRows;
}

/**
 * Run the Hybrid Cannibalization Engine
 * 
 * Executes Track 1 (Proactive) and Track 2 (Reactive GSC) in parallel,
 * then runs deduplication and AI verification.
 * 
 * @param {Object} site - Site object with ID and googleIntegration
 * @param {Function} getValidAccessToken - Token refresh function
 * @param {Object} options - Engine options
 * @returns {Promise<{issues: CannibalizationIssue[], stats: Object}>}
 */
export async function runCannibalizationEngine(site, getValidAccessToken, options = {}) {
  const {
    runProactive = true,
    runReactive = true,
    runAIVerification = true,
    skipDeduplication = false,
    runEmbeddingTriage = true,
  } = options;

  const results = {
    issues: [],
    stats: {
      proactiveCandidates: 0,
      reactiveCandidates: 0,
      deduplicatedCandidates: 0,
      aiVerifiedIssues: 0,
      embeddingBypassedGroups: 0,
      embeddingDroppedGroups: 0,
      hreflangAlternatesFiltered: 0,
      totalRuntime: 0,
    },
  };

  const startTime = Date.now();

  // ─── TRACK 1: Proactive Detection (DB entities) ───
  // Select `content` and `excerpt` — needed for embedding + body-excerpt context.
  let proactiveCandidates = [];
  let entityByUrl = new Map();
  if (runProactive) {
    const entities = await prisma.siteEntity.findMany({
      where: {
        siteId: site.id,
        status: 'PUBLISHED',
        entityType: { isEnabled: true },
      },
      select: {
        id: true,
        title: true,
        url: true,
        slug: true,
        seoData: true,
        metadata: true,
        content: true,
        excerpt: true,
        isProtected: true,
        entityType: { select: { slug: true } },
      },
    });

    for (const e of entities) {
      const url = e.url || `/${e.slug}`;
      entityByUrl.set(url, e);
    }

    proactiveCandidates = detectProactive(entities);
    results.stats.proactiveCandidates = proactiveCandidates.length;
  }

  // ─── TRACK 2: Reactive GSC Detection ───
  let reactiveCandidates = [];
  let gscData = []; // Retained so we can attach per-URL query hits to groups later.
  if (runReactive && site.googleIntegration?.gscConnected && site.googleIntegration?.gscSiteUrl) {
    try {
      const accessToken = await getValidAccessToken(site.googleIntegration);
      if (accessToken) {
        gscData = await fetchGSCDataWithPagination(accessToken, site.googleIntegration.gscSiteUrl, 30);
        reactiveCandidates = detectReactiveGsc(gscData);

        // Scope-filter: only keep candidates whose URLs belong to enabled entity types
        const enabledUrls = new Set(
          (await prisma.siteEntity.findMany({
            where: { siteId: site.id, status: 'PUBLISHED', entityType: { isEnabled: true } },
            select: { url: true },
          })).map(e => e.url).filter(Boolean)
        );
        if (enabledUrls.size > 0) {
          reactiveCandidates = reactiveCandidates.filter(c =>
            (c.urls || [c.urlA, c.urlB]).some(u => enabledUrls.has(u) || enabledUrls.has(u.replace(/\/$/, '')) || enabledUrls.has(u + '/'))
          );
        }

        results.stats.reactiveCandidates = reactiveCandidates.length;
      }
    } catch (error) {
      console.error('[CannibalizationEngine] GSC fetch error:', error.message);
    }
  }

  // ─── Hreflang-alternate filter (applies to BOTH tracks) ───
  // detectProactive already applied this internally, but reactive GSC pairs
  // are built from raw search data and may still include language variants.
  // Reuse the already-loaded entity metadata (entityByUrl) when it's there;
  // otherwise do a small fallback fetch so GSC-only runs still get the filter.
  const hreflangIndex = entityByUrl.size > 0
    ? buildHreflangAlternateIndex([...entityByUrl.values()])
    : (runReactive
      ? buildHreflangAlternateIndex(
          await prisma.siteEntity.findMany({
            where: { siteId: site.id, status: 'PUBLISHED', entityType: { isEnabled: true } },
            select: { url: true, slug: true, metadata: true, seoData: true },
          }).catch(() => [])
        )
      : new Map());

  if (hreflangIndex.size > 0) {
    const before = reactiveCandidates.length;
    reactiveCandidates = reactiveCandidates.filter(c => {
      const urls = c.urls || [c.urlA, c.urlB];
      if (urls.length < 2) return true;
      return !areHreflangAlternates(urls[0], urls[1], hreflangIndex);
    });
    results.stats.hreflangAlternatesFiltered += (before - reactiveCandidates.length);
    results.stats.reactiveCandidates = reactiveCandidates.length;
  }

  // ─── TRACK 3: Deduplication ───
  let deduplicatedCandidates;
  if (skipDeduplication) {
    deduplicatedCandidates = [...proactiveCandidates, ...reactiveCandidates];
  } else {
    deduplicatedCandidates = deduplicateCandidates(proactiveCandidates, reactiveCandidates);
  }
  results.stats.deduplicatedCandidates = deduplicatedCandidates.length;

  // ─── TRACK 4: Grouping ───
  const groupedCandidates = groupCandidates(deduplicatedCandidates);
  results.stats.groupedCandidates = groupedCandidates.length;

  if (groupedCandidates.length === 0) {
    results.stats.totalRuntime = Date.now() - startTime;
    results.stats.proactiveCount = results.stats.proactiveCandidates;
    results.stats.reactiveCount = results.stats.reactiveCandidates;
    results.stats.semanticCount = results.stats.aiVerifiedIssues;
    return results;
  }

  // ─── Enrich groups with body excerpts and GSC hits ───
  // Used by both the embedding pre-filter and the AI verifier prompt.
  const gscHitsByUrl = buildGscHitsByUrl(gscData);
  for (const g of groupedCandidates) {
    g.entities = g.urls.map((url, idx) => {
      const base = g.entities?.[idx] || {};
      const entity = entityByUrl.get(url) || entityByUrl.get(url.replace(/\/$/, '')) || entityByUrl.get(url + '/');
      const metaDescription = entity?.seoData?.description || entity?.seoData?.metaDescription || '';
      const bodyExcerpt = extractBodyExcerpt(entity?.content || entity?.excerpt || '', 500);
      return {
        ...base,
        title: base.title || entity?.title || '',
        h1: base.h1 || extractH1(entity || {}),
        focusKeyword: base.focusKeyword || extractFocusKeyword(entity?.seoData || {}),
        metaDescription,
        bodyExcerpt,
      };
    });
    g.gscHits = Object.fromEntries(g.urls.map(u => [u, gscHitsByUrl.get(u) || gscHitsByUrl.get(u.replace(/\/$/, '')) || gscHitsByUrl.get(u + '/') || []]));
  }

  // ─── Embedding triage ───
  // Compute a single embedding per URL (title + H1 + meta + body excerpt).
  // For each group, score the average pairwise cosine. Then split:
  //   cos ≥ 0.88 → high-confidence MERGE, skip AI
  //   cos < 0.55 → likely false positive, drop unless a strong non-heuristic signal backs it
  //   otherwise → AI verify with the cosine as a hint
  let embeddingReady = false;
  if (runEmbeddingTriage) {
    try {
      const enrichedByUrl = new Map();
      for (const g of groupedCandidates) {
        for (let i = 0; i < g.urls.length; i++) {
          if (!enrichedByUrl.has(g.urls[i])) enrichedByUrl.set(g.urls[i], g.entities[i] || {});
        }
      }
      const urlsToEmbed = Array.from(enrichedByUrl.keys());
      const textsToEmbed = urlsToEmbed.map(url => {
        const entity = enrichedByUrl.get(url) || {};
        return [entity.title, entity.h1, entity.metaDescription, entity.bodyExcerpt].filter(Boolean).join('\n').slice(0, 3000);
      });
      const vectors = await getOrComputeEmbeddings(textsToEmbed, {
        operation: 'CANNIBALIZATION_EMBEDDING',
        accountId: site.accountId,
        siteId: site.id,
        userId: options.userId,
        metadata: { urlCount: urlsToEmbed.length },
      });
      const vectorByUrl = new Map(urlsToEmbed.map((u, i) => [u, vectors[i]]));

      for (const g of groupedCandidates) {
        const urlVecs = g.urls.map(u => vectorByUrl.get(u)).filter(Boolean);
        if (urlVecs.length < 2) continue;
        let sum = 0, count = 0;
        for (let i = 0; i < urlVecs.length; i++) {
          for (let j = i + 1; j < urlVecs.length; j++) {
            sum += cosineSimilarity(urlVecs[i], urlVecs[j]);
            count++;
          }
        }
        g.embeddingCosine = count > 0 ? sum / count : 0;
        if (g.embeddingCosine >= COSINE_MERGE_THRESHOLD) g.embeddingHint = 'MERGE_LIKELY';
        else if (g.embeddingCosine < COSINE_NOT_CANN_THRESHOLD) g.embeddingHint = 'NOT_LIKELY';
        else g.embeddingHint = 'AMBIGUOUS';
      }

      // Agglomerative split: union-find may have transitively glued unrelated
      // URLs together. Recheck each ≥3-URL group's pairwise cosines and break
      // it apart along low-similarity edges. See splitWeakGroups for details.
      const splitGroups = splitWeakGroups(groupedCandidates, vectorByUrl);
      const splitDelta = splitGroups.length - groupedCandidates.length;
      if (splitDelta !== 0) {
        groupedCandidates.length = 0;
        groupedCandidates.push(...splitGroups);
        results.stats.agglomerativeSplits = splitDelta;
        results.stats.groupedCandidates = groupedCandidates.length;
      }
      embeddingReady = true;
    } catch (err) {
      console.error('[CannibalizationEngine] Embedding triage failed, falling back to heuristic bypass:', err.message);
    }
  }

  // ─── Route each group ───
  const autoMergeGroups = []; // Skip AI, convert straight to MERGE issue
  const autoDropGroups = [];  // Skip AI, drop entirely (likely heuristic FP)
  const aiGroups = [];        // Escalate to AI

  for (const g of groupedCandidates) {
    const hasMultiTrack = (g.sources || []).length > 1;

    // Path 1: embedding says these pages are clearly the same intent → bypass AI
    if (embeddingReady && g.embeddingHint === 'MERGE_LIKELY') {
      autoMergeGroups.push(g);
      continue;
    }
    // Path 2: embedding says these pages are clearly different → drop UNLESS multi-track
    // (if both heuristics and GSC agree, we defer to the AI instead of dropping blind).
    if (embeddingReady && g.embeddingHint === 'NOT_LIKELY' && !hasMultiTrack) {
      autoDropGroups.push(g);
      continue;
    }
    // Path 3: no embeddings (fallback) + multi-track detection → bypass AI as MERGE
    if (!embeddingReady && hasMultiTrack && g.combinedScore >= 60) {
      autoMergeGroups.push(g);
      continue;
    }
    // Path 4: everything else → AI verification
    aiGroups.push(g);
  }

  results.stats.embeddingBypassedGroups = autoMergeGroups.length;
  results.stats.embeddingDroppedGroups = autoDropGroups.length;

  const highConfidenceIssues = autoMergeGroups.map(g => buildBypassIssue(g));

  let aiVerifiedIssues = [];
  if (runAIVerification && aiGroups.length > 0) {
    aiVerifiedIssues = await verifyGroupsWithAI(aiGroups, {
      accountId: site.accountId,
      siteId: site.id,
      userId: options.userId,
    });
    results.stats.aiVerifiedIssues = aiVerifiedIssues.length;
  }

  results.issues = [...highConfidenceIssues, ...aiVerifiedIssues];
  results.stats.highConfidenceIssues = highConfidenceIssues.length;
  results.stats.totalRuntime = Date.now() - startTime;

  // Backward compatibility aliases for agent-analysis.js
  results.stats.proactiveCount = results.stats.proactiveCandidates;
  results.stats.reactiveCount = results.stats.reactiveCandidates;
  results.stats.semanticCount = results.stats.aiVerifiedIssues;

  return results;
}

/**
 * Strip HTML tags from body content and return up to `maxChars` of plain text.
 * Used for embedding inputs and AI prompt body excerpts.
 */
function extractBodyExcerpt(html, maxChars = 500) {
  if (!html) return '';
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars);
}

/**
 * Build a URL → GSC hits map from raw GSC rows. Each hit is {query, impressions, clicks, position}.
 * Sorted by impressions DESC so the top queries land at the front.
 */
function buildGscHitsByUrl(gscData) {
  const byUrl = new Map();
  for (const row of gscData || []) {
    const url = row.page;
    if (!url) continue;
    if (!byUrl.has(url)) byUrl.set(url, []);
    byUrl.get(url).push({
      query: row.query,
      impressions: row.impressions || 0,
      clicks: row.clicks || 0,
      position: row.position || 0,
    });
  }
  for (const arr of byUrl.values()) arr.sort((a, b) => b.impressions - a.impressions);
  return byUrl;
}

/**
 * Agglomerative split for groups that the union-find chained too eagerly.
 *
 * Union-find with a score gate is fast but transitive: if A↔B and B↔C both
 * cleared the gate, A↔C lands in the same group even when A and C are
 * unrelated. Once we have embeddings, we can verify the assumption: every
 * pair in a true cannibalization group should be semantically close. If a
 * group's internal cosine map shows a low-cosine pair, decompose the group
 * by greedy single-link clustering at COSINE_GROUP_KEEP_THRESHOLD.
 *
 * Returns the new array of (potentially smaller, possibly more numerous)
 * groups. Subgroups inherit pairs/scores/sources/gscHits/entities filtered
 * to the URLs they contain. Singletons are dropped (no candidate left).
 */
function splitWeakGroups(groups, vectorByUrl) {
  const result = [];
  for (const g of groups) {
    if (!g.urls || g.urls.length < 3) {
      result.push(g);
      continue;
    }
    const urlVecs = g.urls.map(u => vectorByUrl.get(u));
    if (urlVecs.some(v => !v)) {
      // Missing embedding for some URL → can't safely split, keep as-is.
      result.push(g);
      continue;
    }

    // Build symmetric cosine matrix.
    const n = g.urls.length;
    const cos = Array.from({ length: n }, () => new Array(n).fill(0));
    let minCos = 1;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const c = cosineSimilarity(urlVecs[i], urlVecs[j]);
        cos[i][j] = c;
        cos[j][i] = c;
        if (c < minCos) minCos = c;
      }
    }
    // If every pair already meets the threshold, keep the group whole.
    if (minCos >= COSINE_GROUP_KEEP_THRESHOLD) {
      result.push(g);
      continue;
    }

    // Greedy single-link clustering on the threshold.
    const cluster = Array.from({ length: n }, (_, i) => i); // cluster id per index
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (cos[i][j] >= COSINE_GROUP_KEEP_THRESHOLD) {
          const a = cluster[i], b = cluster[j];
          if (a !== b) {
            const lo = Math.min(a, b), hi = Math.max(a, b);
            for (let k = 0; k < n; k++) if (cluster[k] === hi) cluster[k] = lo;
          }
        }
      }
    }

    // Bucket URL indices by cluster id.
    const buckets = new Map();
    for (let i = 0; i < n; i++) {
      if (!buckets.has(cluster[i])) buckets.set(cluster[i], []);
      buckets.get(cluster[i]).push(i);
    }

    // No real split (one bucket) → keep the original (avoids losing metadata).
    if (buckets.size === 1) {
      result.push(g);
      continue;
    }

    for (const idxList of buckets.values()) {
      if (idxList.length < 2) continue; // singleton clusters are no longer candidates
      const subUrls = idxList.map(i => g.urls[i]);
      const subUrlSet = new Set(subUrls);
      const subEntities = idxList.map(i => g.entities?.[i]);

      // Recompute embedding cosine for the subgroup so the routing decision
      // sees the right number, not the parent group's polluted average.
      let sum = 0, count = 0;
      for (let i = 0; i < idxList.length; i++) {
        for (let j = i + 1; j < idxList.length; j++) {
          sum += cos[idxList[i]][idxList[j]];
          count++;
        }
      }
      const subCosine = count > 0 ? sum / count : 0;
      let subHint = 'AMBIGUOUS';
      if (subCosine >= COSINE_MERGE_THRESHOLD) subHint = 'MERGE_LIKELY';
      else if (subCosine < COSINE_NOT_CANN_THRESHOLD) subHint = 'NOT_LIKELY';

      const subPairs = (g.pairs || []).filter(p => subUrlSet.has(p.urlA) && subUrlSet.has(p.urlB));
      const subScores = subPairs.map(p => p.score).filter(s => typeof s === 'number');
      const subGscHits = {};
      for (const u of subUrls) if (g.gscHits?.[u]) subGscHits[u] = g.gscHits[u];

      result.push({
        ...g,
        urls: subUrls,
        entities: subEntities,
        pairs: subPairs,
        scores: subScores,
        combinedScore: subScores.length > 0 ? Math.max(...subScores) : g.combinedScore,
        gscHits: subGscHits,
        embeddingCosine: subCosine,
        embeddingHint: subHint,
        // Mark provenance so downstream stats can count split-derived groups.
        wasAgglomerativelySplit: true,
      });
    }
  }
  return result;
}

/**
 * Build a CannibalizationIssue from a group that bypassed AI verification
 * (high-confidence heuristic + embedding agreement).
 */
function buildBypassIssue(g) {
  const sources = g.sources?.join(' + ') || 'PROACTIVE';
  const confidence = g.combinedScore;

  let reasonKey = 'detectedBySource';
  let reasonParams = { sources, confidence };

  if (g.embeddingHint === 'MERGE_LIKELY') {
    reasonKey = 'embeddingMerge';
    reasonParams = { cosine: Math.round((g.embeddingCosine || 0) * 100), sources, confidence };
  } else if (g.sources?.includes('PROACTIVE')) {
    if (g.data?.titlePrefixMatch || g.data?.h1PrefixMatch) {
      reasonKey = 'prefixMatch';
      reasonParams = {
        titlePrefixMatch: g.data?.titlePrefixMatch || false,
        h1PrefixMatch: g.data?.h1PrefixMatch || false,
        confidence,
      };
    } else if (g.data?.titleSimilarity || g.data?.h1Similarity) {
      reasonKey = 'titleH1Similarity';
      reasonParams = {
        titleSimilarity: g.data?.titleSimilarity || 0,
        h1Similarity: g.data?.h1Similarity || 0,
        confidence,
      };
    }
  }

  return {
    type: g.sources?.length > 1 ? 'MULTI_TRACK' : g.sources[0],
    urls: g.urls,
    urlsInvolved: g.urls,
    entities: g.entities,
    confidenceScore: confidence,
    recommendedAction: 'MERGE', // Embedding-bypassed groups are always MERGE candidates
    reasonKey,
    reasonParams,
    reason: `Detected by ${sources} with ${confidence}% confidence` + (g.embeddingHint === 'MERGE_LIKELY' ? ` (embedding cosine ${(g.embeddingCosine || 0).toFixed(2)})` : ''),
    data: {
      entities: g.entities,
      sources: g.sources,
      pairs: g.pairs,
      embeddingCosine: g.embeddingCosine,
      ...g.data,
    },
  };
}

// ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•
// LEGACY COMPATIBILITY EXPORTS
// ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•

// Keep these for backward compatibility with existing code

export async function detectProactiveCannibalization(siteId, options = {}) {
  const entities = await prisma.siteEntity.findMany({
    where: { siteId, status: 'PUBLISHED', entityType: { isEnabled: true } },
    select: {
      id: true,
      title: true,
      url: true,
      slug: true,
      seoData: true,
      metadata: true,
      entityType: { select: { slug: true } }
    }
  });
  
  const candidates = detectProactive(entities);
  
  // Convert to legacy format
  return candidates.map(c => {
    // Determine the actual reason for detection
    let reasonKey, reasonParams, reason;
    
    if (c.data.titlePrefixMatch || c.data.h1PrefixMatch) {
      reasonKey = 'prefixMatch';
      reasonParams = { 
        titlePrefixMatch: c.data.titlePrefixMatch || false,
        h1PrefixMatch: c.data.h1PrefixMatch || false,
        confidence: c.rawScore
      };
      reason = `Title/H1 prefix match detected with ${c.rawScore}% confidence`;
    } else {
      reasonKey = 'titleH1Similarity';
      reasonParams = { 
        titleSimilarity: c.data.titleSimilarity, 
        h1Similarity: c.data.h1Similarity,
        confidence: c.rawScore
      };
      reason = `Title similarity: ${c.data.titleSimilarity}%, H1 similarity: ${c.data.h1Similarity}%`;
    }
    
    return {
      type: 'PROACTIVE',
      urlsInvolved: [c.urlA, c.urlB],
      confidenceScore: c.rawScore,
      recommendedAction: c.rawScore >= 70 ? 'MERGE' : 'DIFFERENTIATE',
      reasonKey,
      reasonParams,
      reason,
      data: {
        entityA: c.data.entityA,
        entityB: c.data.entityB,
        verification: {
          checks: [
            c.data.titlePrefixMatch && { name: 'title_prefix', severity: 'high' },
            c.data.h1PrefixMatch && { name: 'h1_prefix', severity: 'high' },
            c.data.combinedSimilarity > 60 && { name: 'content_similarity', severity: 'medium' }
          ].filter(Boolean),
          totalScore: c.rawScore,
          maxPossibleScore: 100
        }
      }
    };
  });
}

export async function detectReactiveCannibalization(siteId, googleIntegration, getValidAccessToken) {
  if (!googleIntegration?.gscConnected || !googleIntegration?.gscSiteUrl) {
    return [];
  }
  
  const accessToken = await getValidAccessToken(googleIntegration);
  if (!accessToken) return [];
  
  const gscData = await fetchGSCDataWithPagination(accessToken, googleIntegration.gscSiteUrl, 30);
  const candidates = detectReactiveGsc(gscData);
  
  // Convert to legacy format
  return candidates.map(c => {
    const signals = [];
    if (c.data.signals.impressionSplit) signals.push('impression split');
    if (c.data.signals.positionDance) signals.push('position dance');
    if (c.data.signals.ctrDivergence) signals.push('CTR divergence');
    const signalsStr = signals.join(', ');
    // CTR divergence is the strongest "wrong page is winning the click war"
    // signal — favor MERGE/CANONICAL over DIFFERENTIATE in that case.
    const action = c.data.signals.impressionSplit || c.data.signals.ctrDivergence
      ? 'CANONICAL'
      : 'DIFFERENTIATE';
    return {
      type: 'REACTIVE_GSC',
      urlsInvolved: [c.urlA, c.urlB],
      confidenceScore: c.rawScore,
      recommendedAction: action,
      reasonKey: 'querySignals',
      reasonParams: { query: c.data.query, signals: signalsStr },
      reason: `Query "${c.data.query}": ${signalsStr}`, // Fallback
      data: c.data
    };
  });
}

export async function detectSemanticCannibalization(siteId, googleIntegration, getValidAccessToken) {
  // Semantic detection is now integrated into verifyGroupsWithAI
  // Return empty for backward compatibility
  return [];
}

// ג”€ג”€ג”€ UTILITY EXPORTS ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

export { normalizeText as tokenize };
export { normalizeUrl };
export { jaccardSimilarity };
export { classifyQueryIntent, inferUrlIntent };
export { buildHreflangAlternateIndex, areHreflangAlternates };

// ג”€ג”€ג”€ DEFAULT EXPORT ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

const CannibalizationEngine = {
  // New Track functions
  detectProactive,
  detectReactiveGsc,
  deduplicateCandidates,
  verifyGroupsWithAI,

  // Main orchestrator
  runCannibalizationEngine,

  // Legacy compatibility
  detectProactiveCannibalization,
  detectReactiveCannibalization,
  detectSemanticCannibalization,

  // Utilities
  fetchGSCDataWithPagination,
  normalizeText,
  normalizeUrl,
  jaccardSimilarity
};

export default CannibalizationEngine;
