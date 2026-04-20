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
import { generateStructuredResponse, MODELS } from './ai/gemini.js';

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

// Track 1: Proactive Detection (60% threshold as specified)
const PROACTIVE_SIMILARITY_THRESHOLD = 0.60;

// Track 2: Reactive GSC Detection (25% impression split, 10 position dance)
const GSC_ROW_LIMIT = 5000;
const IMPRESSION_SPLIT_THRESHOLD = 0.25; // 25% of primary's impressions = flag
const POSITION_DANCE_THRESHOLD = 10; // Within 10 positions = potential dance

// AI Verification Batch Size (to avoid overwhelming the API)
const AI_VERIFICATION_BATCH_SIZE = 10;

// Hebrew/English stop words for normalization
const STOP_WORDS = new Set([
  // Hebrew common words
  'את', 'של', 'על', 'עם', 'או', 'גם', 'כי', 'לא', 'אם', 'כל',
  'היא', 'הוא', 'הם', 'הן', 'אני', 'אתה', 'אנחנו',
  'הזה', 'הזאת', 'זה', 'זו', 'זאת', 'אבל', 'רק', 'כבר',
  'פה', 'עוד', 'מה', 'איך', 'למה', 'מי', 'כמה',
  'יש', 'אין', 'היה', 'היו', 'יהיה', 'להיות',
  // Single Hebrew prefix letters
  'ב', 'כ', 'ל', 'מ', 'ה', 'ו', 'ש',
  // English common words  
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
  'that', 'this', 'these', 'those', 'it', 'its', 'we', 'you', 'they', 'he', 'she',
  'what', 'which', 'who', 'whom', 'how', 'why', 'when', 'where', 'if', 'then', 'so',
]);

// ג”€ג”€ג”€ AI VERIFICATION SCHEMA (gemini-3-pro-preview) ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

/**
 * Schema for the Elite SEO Strategist AI verification response.
 * Uses gemini-3-pro-preview for maximum reasoning capabilities.
 */
const AIVerificationSchema = z.object({
  isCannibalization: z.boolean().describe('True if both pages satisfy the EXACT SAME User Search Intent'),
  confidenceScore: z.number().min(0).max(100).describe('AI confidence score 0-100'),
  recommendedAction: z.enum(['MERGE', 'CANONICAL']).describe('MERGE if content should be combined, CANONICAL if one should be primary'),
  sharedIntent: z.string().describe('The common search intent description if cannibalization detected'),
  reasoning: z.string().describe('Detailed reasoning for the decision, including linguistic analysis'),
  semanticSignals: z.array(z.string()).describe('Detected signals: synonyms, morphological_variations, contextual_equivalence, slang_match')
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
  if (!bigramsA.size || !bigramsB.size) return 0;
  const intersection = [...bigramsA].filter(x => bigramsB.has(x)).length;
  const minSize = Math.min(bigramsA.size, bigramsB.size);
  return minSize > 0 ? intersection / minSize : 0;
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
  
  // Pre-process all entities for comparison, excluding homepages
  const processedEntities = siteEntities
    .filter(entity => {
      const url = entity.url || `/${entity.slug}`;
      return !isHomepage(url); // Skip homepage - not comparable to posts
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
        type: entity.entityType?.slug || 'post'
      };
    });
  
  // Compare every pair (O(n²) but necessary for completeness)
  for (let i = 0; i < processedEntities.length; i++) {
    for (let j = i + 1; j < processedEntities.length; j++) {
      const entityA = processedEntities[i];
      const entityB = processedEntities[j];
      
      // Skip if same URL (shouldn't happen, but safety check)
      if (entityA.url === entityB.url) continue;
      
      // Calculate title similarity (Jaccard)
      const titleSimilarity = jaccardSimilarity(entityA.titleTokens, entityB.titleTokens);
      
      // Calculate H1 similarity (Jaccard)
      const h1Similarity = jaccardSimilarity(entityA.h1Tokens, entityB.h1Tokens);
      
      // Check for prefix match (first 2 meaningful tokens)
      const titlePrefixMatch = hasPrefixMatch(entityA.title, entityB.title);
      const h1PrefixMatch = hasPrefixMatch(entityA.h1, entityB.h1);
      
      // Containment similarity — catches long titles sharing the same core topic
      const titleContainment = containmentSimilarity(entityA.titleTokens, entityB.titleTokens);
      const h1Containment = containmentSimilarity(entityA.h1Tokens, entityB.h1Tokens);
      
      // Bigram overlap — catches shared multi-word phrases like "בניית אתרים"
      const titleBigramScore = bigramOverlap(entityA.titleBigrams, entityB.titleBigrams);
      const h1BigramScore = bigramOverlap(entityA.h1Bigrams, entityB.h1Bigrams);
      
      // Focus keyword match
      const focusKeywordMatch = !!(
        entityA.focusKeyword && entityB.focusKeyword &&
        normalizeText(entityA.focusKeyword).join(' ') === normalizeText(entityB.focusKeyword).join(' ')
      );
      
      // Combined similarity score (average of title and H1)
      const combinedSimilarity = (titleSimilarity + h1Similarity) / 2;
      const combinedContainment = (titleContainment + h1Containment) / 2;
      const combinedBigram = Math.max(titleBigramScore, h1BigramScore);
      
      // FLAG CONDITIONS:
      // 1. Combined Jaccard similarity > 60%
      // 2. OR exact prefix match in title or H1
      // 3. OR containment similarity > 40% (one title's keywords are largely in the other)
      // 4. OR shared bigram (multi-word phrase match like "בניית אתרים")
      // 5. OR both posts target the same focus keyword
      const shouldFlag = (
        combinedSimilarity > PROACTIVE_SIMILARITY_THRESHOLD ||
        titlePrefixMatch ||
        h1PrefixMatch ||
        combinedContainment > 0.40 ||
        combinedBigram > 0 ||
        focusKeywordMatch
      );
      
      if (shouldFlag) {
        // Calculate raw score for deduplication priority
        let rawScore = combinedSimilarity * 100;
        if (titlePrefixMatch) rawScore += 20;
        if (h1PrefixMatch) rawScore += 15;
        if (combinedContainment > 0.40) rawScore += 15;
        if (combinedBigram > 0) rawScore += 20;
        if (focusKeywordMatch) rawScore += 25;
        
        candidates.push({
          urlA: entityA.url,
          urlB: entityB.url,
          source: 'PROACTIVE',
          rawScore: Math.min(rawScore, 100),
          data: {
            entityA: { 
              title: entityA.title, 
              h1: entityA.h1, 
              focusKeyword: entityA.focusKeyword 
            },
            entityB: { 
              title: entityB.title, 
              h1: entityB.h1, 
              focusKeyword: entityB.focusKeyword 
            },
            titleSimilarity: Math.round(titleSimilarity * 100),
            h1Similarity: Math.round(h1Similarity * 100),
            combinedSimilarity: Math.round(combinedSimilarity * 100),
            titleContainment: Math.round(titleContainment * 100),
            h1Containment: Math.round(h1Containment * 100),
            titleBigramScore: Math.round(titleBigramScore * 100),
            h1BigramScore: Math.round(h1BigramScore * 100),
            titlePrefixMatch,
            h1PrefixMatch,
            focusKeywordMatch
          }
        });
      }
    }
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
 * TRACK 2: Detect cannibalization candidates from GSC data
 * 
 * Rule A (Impression Split): Secondary URL has ג‰¥25% of primary's impressions
 * Rule B (Position Dance): Two URLs within 10 positions of each other
 * 
 * @param {Array} gscData - Raw GSC query+page data with {query, page, impressions, clicks, position}
 * @returns {CandidatePair[]} Array of candidate pairs
 */
export function detectReactiveGsc(gscData) {
  const candidates = [];
  
  if (!gscData || !gscData.length) return candidates;
  
  // Group by query (case-insensitive)
  const queryGroups = new Map();
  
  for (const row of gscData) {
    const query = (row.query || '').toLowerCase().trim();
    if (!query) continue;
    
    if (!queryGroups.has(query)) {
      queryGroups.set(query, new Map());
    }
    
    const pageData = queryGroups.get(query);
    const normalizedPage = normalizeUrl(row.page);
    
    if (!pageData.has(normalizedPage)) {
      pageData.set(normalizedPage, {
        url: row.page,
        impressions: 0,
        clicks: 0,
        positions: []
      });
    }
    
    const existing = pageData.get(normalizedPage);
    existing.impressions += row.impressions || 0;
    existing.clicks += row.clicks || 0;
    existing.positions.push(row.position || 0);
  }
  
  // Analyze each query for cannibalization signals
  const seenPairs = new Set(); // Avoid duplicate pairs
  
  for (const [query, pageMap] of queryGroups) {
    if (pageMap.size < 2) continue; // Need at least 2 pages
    
    // Sort pages by impressions (descending)
    const pages = [...pageMap.values()]
      .map(p => ({
        ...p,
        avgPosition: p.positions.length > 0 
          ? p.positions.reduce((a, b) => a + b, 0) / p.positions.length 
          : 100
      }))
      .sort((a, b) => b.impressions - a.impressions);
    
    const primary = pages[0];
    
    // Compare primary with each secondary
    for (let i = 1; i < pages.length; i++) {
      const secondary = pages[i];
      
      // Skip if already seen this pair
      const pairKey = [normalizeUrl(primary.url), normalizeUrl(secondary.url)].sort().join('|');
      if (seenPairs.has(pairKey)) continue;
      
      // Rule A: Impression Split (25% threshold)
      const impressionRatio = primary.impressions > 0 
        ? secondary.impressions / primary.impressions 
        : 0;
      const isImpressionSplit = impressionRatio >= IMPRESSION_SPLIT_THRESHOLD;
      
      // Rule B: Position Dance (within 10 positions)
      const positionDiff = Math.abs(primary.avgPosition - secondary.avgPosition);
      const isPositionDance = positionDiff <= POSITION_DANCE_THRESHOLD;
      
      if (isImpressionSplit || isPositionDance) {
        seenPairs.add(pairKey);
        
        // Calculate raw score based on signals
        let rawScore = 0;
        if (isImpressionSplit) {
          // Higher ratio = higher score (max 50 from this rule)
          rawScore += Math.min(impressionRatio * 100, 50);
        }
        if (isPositionDance) {
          // Closer positions = higher score (max 50 from this rule)
          rawScore += 50 - (positionDiff * 5);
        }
        
        candidates.push({
          urlA: primary.url,
          urlB: secondary.url,
          source: 'REACTIVE_GSC',
          rawScore: Math.min(Math.max(rawScore, 0), 100),
          data: {
            query,
            primaryImpressions: primary.impressions,
            secondaryImpressions: secondary.impressions,
            impressionRatio: Math.round(impressionRatio * 100),
            primaryPosition: Math.round(primary.avgPosition * 10) / 10,
            secondaryPosition: Math.round(secondary.avgPosition * 10) / 10,
            positionDiff: Math.round(positionDiff * 10) / 10,
            signals: {
              impressionSplit: isImpressionSplit,
              positionDance: isPositionDance
            }
          }
        });
      }
    }
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

/**
 * Deep Semantic AI Verification using gemini-3.1-pro-preview
 * 
 * Uses Elite SEO Strategist + Master Linguist prompt for maximum
 * reasoning capabilities and native-level linguistic comprehension.
 * 
 * @param {CandidatePair[]} candidates - Deduplicated candidate pairs
 * @returns {Promise<CannibalizationIssue[]>} Verified cannibalization issues
 */
export async function verifyWithAI(candidates) {
  const verifiedIssues = [];
  
  if (!candidates || candidates.length === 0) return verifiedIssues;
  
  // Process in batches to avoid overwhelming the API
  const batches = [];
  for (let i = 0; i < candidates.length; i += AI_VERIFICATION_BATCH_SIZE) {
    batches.push(candidates.slice(i, i + AI_VERIFICATION_BATCH_SIZE));
  }
  
  for (const batch of batches) {
    const verificationPromises = batch.map(candidate => verifyPairWithAI(candidate));
    const results = await Promise.allSettled(verificationPromises);
    
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const candidate = batch[i];
      
      if (result.status === 'fulfilled' && result.value) {
        const aiResult = result.value;
        
        if (aiResult.isCannibalization) {
          // Multi-track detection gets additional confidence boost
          let finalConfidence = aiResult.confidenceScore;
          if (candidate.sources?.length > 1) {
            finalConfidence = Math.min(finalConfidence + 10, 100);
          }
          
          // Determine reasonKey based on detection source and method
          let reasonKey = 'aiVerified';
          let reasonParams = { confidence: finalConfidence };
          
          if (candidate.sources?.length > 1) {
            reasonKey = 'detectedBySource';
            reasonParams = { sources: candidate.sources.join(' + '), confidence: finalConfidence };
          } else if (candidate.source === 'PROACTIVE') {
            // Check what actually triggered the detection
            const titlePrefixMatch = candidate.data?.titlePrefixMatch;
            const h1PrefixMatch = candidate.data?.h1PrefixMatch;
            const titleSim = candidate.data?.titleSimilarity || 0;
            const h1Sim = candidate.data?.h1Similarity || 0;
            
            if (titlePrefixMatch || h1PrefixMatch) {
              // Detected by prefix match - titles/H1s start the same way
              reasonKey = 'prefixMatch';
              reasonParams = { 
                titlePrefixMatch: titlePrefixMatch || false,
                h1PrefixMatch: h1PrefixMatch || false,
                confidence: finalConfidence
              };
            } else {
              // Detected by high similarity
              reasonKey = 'titleH1Similarity';
              reasonParams = { 
                titleSimilarity: titleSim,
                h1Similarity: h1Sim,
                confidence: finalConfidence
              };
            }
          } else if (candidate.source === 'REACTIVE_GSC') {
            const signals = [];
            if (candidate.data?.signals?.impressionSplit) signals.push('impression split');
            if (candidate.data?.signals?.positionDance) signals.push('position dance');
            reasonKey = 'querySignals';
            reasonParams = { 
              query: candidate.data?.query || '',
              signals: signals.join(', ') || 'search conflict'
            };
          }
          
          verifiedIssues.push({
            type: 'AI_VERIFIED',
            urlsInvolved: [candidate.urlA, candidate.urlB],
            confidenceScore: finalConfidence,
            recommendedAction: aiResult.recommendedAction,
            reason: aiResult.reasoning,
            reasonKey,
            reasonParams,
            data: {
              // Entity details for UI display (flattened for easy access)
              entityA: candidate.data?.entityA || { title: candidate.urlA, url: candidate.urlA },
              entityB: candidate.data?.entityB || { title: candidate.urlB, url: candidate.urlB },
              // AI analysis results
              sharedIntent: aiResult.sharedIntent,
              semanticSignals: aiResult.semanticSignals,
              // Detection metadata
              sources: candidate.sources,
              proactiveScore: candidate.source === 'PROACTIVE' ? candidate.rawScore : candidate.data?.proactiveScore,
              gscScore: candidate.source === 'REACTIVE_GSC' ? candidate.rawScore : candidate.data?.gscData?.rawScore
            }
          });
        }
      } else if (result.status === 'rejected') {
        console.error('[CannibalizationEngine] AI verification failed for pair:', 
          candidate.urlA, candidate.urlB, result.reason?.message);
      }
    }
  }
  
  // Sort by confidence (highest first)
  return verifiedIssues.sort((a, b) => b.confidenceScore - a.confidenceScore);
}

/**
 * Verify a single pair using gemini-3.1-pro-preview with Elite SEO Strategist prompt
 * 
 * @param {CandidatePair} candidate 
 * @returns {Promise<Object>}
 */
async function verifyPairWithAI(candidate) {
  const { urlA, urlB, data, sources } = candidate;
  
  // Build context from available data
  const entityA = data?.entityA || {};
  const entityB = data?.entityB || {};
  const gscData = data?.gscData || data;
  
  const prompt = `## URL Pair Analysis Request

### Page A
- URL: ${urlA}
- Title: ${entityA.title || '(not available)'}
- H1: ${entityA.h1 || '(not available)'}
- Focus Keyword: ${entityA.focusKeyword || '(not set)'}

### Page B
- URL: ${urlB}
- Title: ${entityB.title || '(not available)'}
- H1: ${entityB.h1 || '(not available)'}
- Focus Keyword: ${entityB.focusKeyword || '(not set)'}

### Detection Context
- Detection Sources: ${sources?.join(', ') || 'Unknown'}
${gscData?.query ? `- GSC Query: "${gscData.query}"` : ''}
${gscData?.impressionRatio ? `- Impression Split: ${gscData.impressionRatio}%` : ''}
${gscData?.positionDiff !== undefined ? `- Position Difference: ${gscData.positionDiff} spots` : ''}
${data?.titleSimilarity !== undefined ? `- Title Similarity: ${data.titleSimilarity}%` : ''}
${data?.h1Similarity !== undefined ? `- H1 Similarity: ${data.h1Similarity}%` : ''}
${data?.titlePrefixMatch ? '- Title Prefix Match: YES' : ''}
${data?.h1PrefixMatch ? '- H1 Prefix Match: YES' : ''}

## Your Analysis Task

Determine with your full linguistic and SEO expertise whether these two pages satisfy the EXACT SAME User Search Intent.

Apply deep semantic understanding:
1. **Synonyms**: "speed up" = "make faster" = "improve performance"
2. **Morphological variations**: Hebrew verb conjugations, noun forms, construct states
3. **Contextual equivalence**: "how to speed up WordPress" ג‰ˆ "reducing TTFB and load times"
4. **Slang and colloquialisms**: Internet slang, industry jargon, local expressions
5. **Cross-language patterns**: English terms used in Hebrew content (e.g., "SEO", "WordPress")

**The Ultimate Test**: If a human user searching for Topic A would be FULLY SATISFIED reading Page B's content, they ARE cannibalizing each other.

Be precise but not overly strict. Real-world users often use varied vocabulary for the same intent.`;

  const systemPrompt = `You are an Elite SEO Strategist and a Master Linguist with native-level fluency in both Hebrew and English.

Your expertise includes:
- Deep understanding of search intent and user behavior
- Advanced knowledge of morphological analysis (especially Hebrew's complex root system)
- Recognition of synonyms, slang, colloquialisms, and contextual language variations
- Understanding of how different phrasings can represent identical user needs

When analyzing URL pairs for cannibalization:
- Focus on the UNDERLYING USER INTENT, not surface-level keyword matching
- Consider that "how to speed up WordPress" and "reducing TTFB and load times" serve THE SAME user need
- Recognize that different vocabulary often represents the same search journey
- Be practical: if both pages would satisfy the same searcher, they ARE cannibalizing

Your response must be precise and actionable. Do not be overly conservative - real cannibalization costs rankings.`;

  try {
    const result = await generateStructuredResponse({
      system: systemPrompt,
      prompt,
      schema: AIVerificationSchema,
      temperature: 0.3, // Lower temperature for more consistent reasoning
      operation: 'CANNIBALIZATION_AI_VERIFICATION',
      metadata: { urlA, urlB, sources },
      modelOverride: MODELS.PRO_PREVIEW // Use gemini-3.1-pro-preview
    });
    
    return result;
  } catch (error) {
    console.error('[CannibalizationEngine] AI verification error:', error.message);
    throw error;
  }
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
  
  for (const group of groups) {
    try {
      const pagesContext = group.entities.map((entity, idx) => {
        const url = group.urls[idx];
        return `### Page ${idx + 1}
- URL: ${url}
- Title: ${entity.title || '(not available)'}
- H1: ${entity.h1 || '(not available)'}
- Focus Keyword: ${entity.focusKeyword || '(not set)'}`;
      }).join('\n\n');
      
      const prompt = `## URL Group Analysis Request

This is a group of ${group.urls.length} pages detected as potentially cannibalizing each other.

${pagesContext}

### Detection Context
- Detection Sources: ${group.sources.join(', ')}
- Combined Confidence Score: ${group.combinedScore}%
${group.data?.titlePrefixMatch ? '- Title Prefix Match detected' : ''}
${group.data?.h1PrefixMatch ? '- H1 Prefix Match detected' : ''}
${group.data?.titleSimilarity ? `- Max Title Similarity: ${group.data.titleSimilarity}%` : ''}
${group.data?.h1Similarity ? `- Max H1 Similarity: ${group.data.h1Similarity}%` : ''}
${group.data?.gscData?.query ? `- GSC Query conflict: "${group.data.gscData.query}"` : ''}

## Your Analysis Task

Analyze ALL pages in this group and determine if they are cannibalizing each other by targeting the SAME User Search Intent.`;

      const systemPrompt = `You are an Elite SEO Strategist and Master Linguist with native-level fluency in Hebrew and English.

Analyze URL groups for cannibalization. Focus on the UNDERLYING USER INTENT, not surface-level keywords.`;

      const result = await generateStructuredResponse({
        system: systemPrompt,
        prompt,
        schema: AIVerificationSchema,
        temperature: 0.3,
        operation: 'CANNIBALIZATION_GROUP_VERIFICATION',
        metadata: { urls: group.urls, sources: group.sources },
        modelOverride: MODELS.PRO_PREVIEW,
        accountId: context.accountId,
        siteId: context.siteId,
        userId: context.userId,
      });
      
      if (result?.isCannibalization) {
        let finalConfidence = result.confidenceScore;
        if (group.sources.length > 1) {
          finalConfidence = Math.min(finalConfidence + 10, 100);
        }
        if (group.urls.length > 2) {
          finalConfidence = Math.min(finalConfidence + 5 * (group.urls.length - 2), 100);
        }
        
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
              confidence: finalConfidence
            };
          } else {
            reasonKey = 'titleH1Similarity';
            reasonParams = {
              titleSimilarity: group.data?.titleSimilarity || 0,
              h1Similarity: group.data?.h1Similarity || 0,
              confidence: finalConfidence
            };
          }
        } else if (group.sources.includes('REACTIVE_GSC')) {
          const signals = [];
          if (group.data?.gscData?.signals?.impressionSplit) signals.push('impression split');
          if (group.data?.gscData?.signals?.positionDance) signals.push('position dance');
          reasonKey = 'querySignals';
          reasonParams = {
            query: group.data?.gscData?.query || '',
            signals: signals.join(', ') || 'search conflict'
          };
        }
        
        verifiedIssues.push({
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
            pairs: group.pairs
          }
        });
      }
    } catch (error) {
      console.error('[CannibalizationEngine] Group verification failed:', group.urls, error.message);
    }
  }
  
  return verifiedIssues.sort((a, b) => {
    if (b.urls.length !== a.urls.length) return b.urls.length - a.urls.length;
    return b.confidenceScore - a.confidenceScore;
  });
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
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 3); // GSC data delay
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
          rowLimit: 1000,
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
    
    hasMore = rows.length === 1000;
    startRow += 1000;
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
    skipDeduplication = false
  } = options;
  
  const results = {
    issues: [],
    stats: {
      proactiveCandidates: 0,
      reactiveCandidates: 0,
      deduplicatedCandidates: 0,
      aiVerifiedIssues: 0,
      totalRuntime: 0
    }
  };
  
  const startTime = Date.now();
  
  // ג”€ג”€ג”€ TRACK 1: Proactive Detection (DB entities) ג”€ג”€ג”€
  let proactiveCandidates = [];
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
        isProtected: true,
        entityType: { select: { slug: true } }
      }
    });
    
    proactiveCandidates = detectProactive(entities);
    results.stats.proactiveCandidates = proactiveCandidates.length;
  }
  
  // ג”€ג”€ג”€ TRACK 2: Reactive GSC Detection (in parallel with Track 1 analysis) ג”€ג”€ג”€
  let reactiveCandidates = [];
  if (runReactive && site.googleIntegration?.gscConnected && site.googleIntegration?.gscSiteUrl) {
    try {
      const accessToken = await getValidAccessToken(site.googleIntegration);
      if (accessToken) {
        const gscData = await fetchGSCDataWithPagination(accessToken, site.googleIntegration.gscSiteUrl, 30);
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
            (c.urls || []).some(u => enabledUrls.has(u) || enabledUrls.has(u.replace(/\/$/, '')) || enabledUrls.has(u + '/'))
          );
        }

        results.stats.reactiveCandidates = reactiveCandidates.length;
      }
    } catch (error) {
      console.error('[CannibalizationEngine] GSC fetch error:', error.message);
    }
  }
  
  // ג”€ג”€ג”€ TRACK 3: Deduplication ג”€ג”€ג”€
  let deduplicatedCandidates;
  if (skipDeduplication) {
    deduplicatedCandidates = [...proactiveCandidates, ...reactiveCandidates];
  } else {
    deduplicatedCandidates = deduplicateCandidates(proactiveCandidates, reactiveCandidates);
  }
  results.stats.deduplicatedCandidates = deduplicatedCandidates.length;
  
  // ═══ TRACK 4: Grouping ═══
  const groupedCandidates = groupCandidates(deduplicatedCandidates);
  results.stats.groupedCandidates = groupedCandidates.length;
  
  // ═══ AI Verification ═══
  // High-confidence proactive groups (score >= 60 OR 3+ URLs) bypass AI —
  // the detection signals are strong enough. AI verification is only
  // needed for borderline 2-URL pairs with moderate scores.
  const HIGH_CONFIDENCE_SCORE = 60;
  const HIGH_CONFIDENCE_URLS = 3;
  
  const highConfidenceGroups = groupedCandidates.filter(g =>
    g.combinedScore >= HIGH_CONFIDENCE_SCORE || g.urls.length >= HIGH_CONFIDENCE_URLS
  );
  const borderlineGroups = groupedCandidates.filter(g =>
    g.combinedScore < HIGH_CONFIDENCE_SCORE && g.urls.length < HIGH_CONFIDENCE_URLS
  );
  
  // Convert high-confidence groups directly to issues (no AI needed)
  const highConfidenceIssues = highConfidenceGroups.map(g => {
    const sources = g.sources?.join(' + ') || 'PROACTIVE';
    const confidence = g.combinedScore;
    
    let reasonKey = 'detectedBySource';
    let reasonParams = { sources, confidence };
    
    if (g.sources.includes('PROACTIVE')) {
      if (g.data?.titlePrefixMatch || g.data?.h1PrefixMatch) {
        reasonKey = 'prefixMatch';
        reasonParams = {
          titlePrefixMatch: g.data?.titlePrefixMatch || false,
          h1PrefixMatch: g.data?.h1PrefixMatch || false,
          confidence
        };
      } else if (g.data?.titleSimilarity || g.data?.h1Similarity) {
        reasonKey = 'titleH1Similarity';
        reasonParams = {
          titleSimilarity: g.data?.titleSimilarity || 0,
          h1Similarity: g.data?.h1Similarity || 0,
          confidence
        };
      }
    }
    
    return {
      type: g.sources?.length > 1 ? 'MULTI_TRACK' : g.sources[0],
      urls: g.urls,
      urlsInvolved: g.urls,
      entities: g.entities,
      confidenceScore: confidence,
      recommendedAction: confidence >= 70 ? 'MERGE' : 'DIFFERENTIATE',
      reasonKey,
      reasonParams,
      reason: `Detected by ${sources} with ${confidence}% confidence`,
      data: {
        entities: g.entities,
        sources: g.sources,
        pairs: g.pairs,
        ...g.data
      }
    };
  });
  
  // AI-verify only the borderline groups
  let aiVerifiedIssues = [];
  if (runAIVerification && borderlineGroups.length > 0) {
    aiVerifiedIssues = await verifyGroupsWithAI(borderlineGroups, {
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

// ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•
// LEGACY COMPATIBILITY EXPORTS
// ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•

// Keep these for backward compatibility with existing code

export async function detectProactiveCannibalization(siteId, options = {}) {
  const entities = await prisma.siteEntity.findMany({
    where: { siteId, status: 'PUBLISHED' },
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
    const signalsStr = signals.join(', ');
    return {
      type: 'REACTIVE_GSC',
      urlsInvolved: [c.urlA, c.urlB],
      confidenceScore: c.rawScore,
      recommendedAction: c.data.signals.impressionSplit ? 'CANONICAL' : 'DIFFERENTIATE',
      reasonKey: 'querySignals',
      reasonParams: { query: c.data.query, signals: signalsStr },
      reason: `Query "${c.data.query}": ${signalsStr}`, // Fallback
      data: c.data
    };
  });
}

export async function detectSemanticCannibalization(siteId, googleIntegration, getValidAccessToken) {
  // Semantic detection is now integrated into verifyWithAI
  // Return empty for backward compatibility
  return [];
}

// ג”€ג”€ג”€ UTILITY EXPORTS ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

export { normalizeText as tokenize };
export { normalizeUrl };
export { jaccardSimilarity };

// ג”€ג”€ג”€ DEFAULT EXPORT ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

const CannibalizationEngine = {
  // New Track functions
  detectProactive,
  detectReactiveGsc,
  deduplicateCandidates,
  verifyWithAI,
  
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
