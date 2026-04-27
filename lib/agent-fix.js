/**
 * AI Agent Fix Engine
 * 
 * Generates AI-powered fixes for agent insights and applies them to WordPress
 * sites via the connected plugin. Supports SEO fixes (title/description generation)
 * for missingSeo and keywordStrikeZone insights.
 * 
 * Flow: generateInsightPreview → user reviews → applyInsightFix
 */

import { generateStructuredResponse, generateImage, generateTextResponse } from '@/lib/ai/gemini.js';
import { updateSeoData, getSeoData, getPost, resolveUrl, uploadMediaFromBase64, updatePost, createRedirect, searchReplaceLinks } from '@/lib/wp-api-client.js';
import { gatherImageContext, buildImagePrompt } from '@/lib/ai/image-context.js';
import { refreshAccessToken, fetchGSCPageMetrics, fetchGA4PageMetrics } from '@/lib/google-integration.js';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import {
  AGENT_FIXERS,
  getInsightType as _registryGetInsightType,
  getFixerConfig as _registryGetFixerConfig,
  isFixableType as _registryIsFixableType,
  isAiFixable as _registryIsAiFixable,
  isFreeFixable as _registryIsFreeFixable,
  getFixCredits as _registryGetFixCredits,
} from '@/lib/agent-fix/registry.js';
import {
  applyNoindexClearFix,
  applyRescanCompetitorsFix,
} from '@/lib/agent-fix/free-handlers.js';
import { cms as _cms } from '@/lib/cms';

// ─── Year Replacement Helper ─────────────────────────────────────────

/**
 * Replace standalone stale years (2020-last year) with the current year in text.
 * Only replaces years that appear as standalone tokens (e.g. "| 2024", "לשנת 2023")
 * and NOT years embedded in dates (e.g. "15/03/2024") or IDs.
 */
function replaceStaleYears(text) {
  if (!text) return text;
  const currentYear = new Date().getFullYear();
  // Match years 2020 through (currentYear - 1) that are not surrounded by digits or slashes
  const staleYearPattern = new RegExp(`(?<![\\d/])(20(?:2[0-${currentYear % 10 === 0 ? '0' : currentYear % 10 - 1}]|${currentYear - 2010 > 9 ? `[0-${Math.floor((currentYear - 2010 - 1) / 10)}]\\d` : ''}))(?![\\d/])`, 'g');
  // Simpler approach: just replace specific known stale years 
  const staleYears = [];
  for (let y = 2020; y < currentYear; y++) staleYears.push(y);
  if (staleYears.length === 0) return text;
  const pattern = new RegExp(`(?<![\\d/])(${staleYears.join('|')})(?![\\d/])`, 'g');
  return text.replace(pattern, String(currentYear));
}

// ─── Fixable Types ───────────────────────────────────────────────────
// Source of truth lives in `lib/agent-fix/registry.js`. Local helpers below
// just delegate so existing imports keep working.

const getInsightType = _registryGetInsightType;
const getFixerConfig = _registryGetFixerConfig;

/**
 * Check if an insight type is fixable (any kind) via the agent fix engine.
 * Returns false for `external` registry entries (e.g. sitemapsNotSubmitted) —
 * those have their own dispatch path and don't go through this engine.
 */
export function isFixableType(titleKey) {
  return _registryIsFixableType(titleKey);
}

export function isAiFixable(titleKey) {
  return _registryIsAiFixable(titleKey);
}

export function isFreeFixable(titleKey) {
  return _registryIsFreeFixable(titleKey);
}

export function getFixCredits(titleKey) {
  return _registryGetFixCredits(titleKey);
}

// ─── SEO Schema ──────────────────────────────────────────────────────

const SeoGenerationSchema = z.object({
  title: z.string().describe('SEO title for the page, 50-60 characters, compelling and keyword-rich'),
  description: z.string().describe('SEO meta description, 140-160 characters, actionable and descriptive'),
});

// ─── Cannibalization Fix Schema ──────────────────────────────────────

const ARTICLE_TYPES = ['seo', 'blogPost', 'guide', 'howTo', 'listicle', 'comparison', 'review', 'news', 'tutorial', 'caseStudy'];

const PageChangesSchema = z.object({
  pageLabel: z.string().describe('Page label letter: A, B, C, D, etc.'),
  newTitle: z.string().describe('For DIFFERENTIATE: new SEO title. For other actions: the current/existing SEO title as-is.'),
  newDescription: z.string().describe('For DIFFERENTIATE: new meta description. For other actions: the current/existing meta description as-is.'),
  newFocusKeyword: z.string().describe('For DIFFERENTIATE: new unique focus keyword. For other actions: the current focus keyword or main keyword.'),
  targetAngle: z.string().describe('The detected search intent / angle this page currently serves (e.g. "informational guide about X", "product comparison for Y")'),
  contentRewritePlan: z.string().optional().describe('For DIFFERENTIATE only: detailed editorial plan describing how to rewrite this page\'s body content to clearly target its unique intent. Includes: new H2 structure, sections to add/remove/rewrite, tone shift, and unique value propositions. Should be actionable instructions for a content editor.'),
});

const CannibalizationFixSchema = z.object({
  recommendedAction: z.enum(['MERGE', 'CANONICAL', '301_REDIRECT', 'DIFFERENTIATE']).describe('Best action to fix cannibalization'),
  reasoning: z.string().describe('Brief explanation for the recommendation'),
  pagesChanges: z.array(PageChangesSchema).describe('Array of changes for each competing page, in order (A, B, C, ...). Must have one entry per page.'),
  primaryPostId: z.string().optional().describe('Post ID of the page to keep (for MERGE, CANONICAL, 301_REDIRECT)'),
  mergedPageChanges: z.object({
    newTitle: z.string().describe('New SEO title for the merged page'),
    newDescription: z.string().describe('New meta description for the merged page'),
    newFocusKeyword: z.string().describe('Focus keyword for the merged page'),
    targetAngle: z.string().describe('The comprehensive angle the merged content should target'),
    articleType: z.enum(ARTICLE_TYPES).describe('Best article type for the merged comprehensive content'),
    suggestedContentImages: z.number().min(0).max(5).describe('Number of content images recommended (0-5), based on estimated merged content length: 0 for <500 words, 1-2 for 500-1000, 2-3 for 1000-2000, 4-5 for >2000'),
  }).optional().describe('SEO changes for the merged page (if action is MERGE)'),
  canonicalTarget: z.string().optional().describe('URL of the canonical page (if action is CANONICAL or 301_REDIRECT)'),
  mergeInstructions: z.string().optional().describe('Instructions for merging content (if action is MERGE)'),
});

// ─── Entity Lookup Helper ────────────────────────────────────────────

async function resolveEntityToWpPost(site, { entityId, url }) {
  const siteId = site.id;
  let entity;

  if (entityId) {
    entity = await prisma.siteEntity.findUnique({
      where: { id: entityId },
      include: { entityType: { select: { slug: true } } },
    });
  }

  if (!entity?.externalId && url) {
    // Try exact URL first, then normalized variants (http↔https, trailing slash)
    const urlVariants = getUrlVariants(url);
    for (const variant of urlVariants) {
      const found = await prisma.siteEntity.findFirst({
        where: { siteId, url: variant, externalId: { not: null } },
        include: { entityType: { select: { slug: true } } },
      });
      if (found) { entity = found; break; }
    }
    // Fallback: find any entity with this URL even without externalId
    if (!entity) {
      entity = await prisma.siteEntity.findFirst({
        where: { siteId, url: { in: urlVariants } },
        include: { entityType: { select: { slug: true } } },
      });
    }
  }

  if (!entity) return null;

  const postType = entity.entityType?.slug || 'page';
  const isProtected = entity.isProtected || false;

  // If externalId is missing, resolve the WP post via the plugin's URL resolver
  if (!entity.externalId && entity.url && site.siteKey) {
    const resolved = await resolveUrl(site, entity.url);
    if (resolved?.found && resolved.postId) {
      const wpPostId = String(resolved.postId).replace(/[^0-9]/g, '');
      // Backfill externalId for future lookups
      await prisma.siteEntity.update({
        where: { id: entity.id },
        data: { externalId: wpPostId },
      }).catch(() => {});
      return { wpPostId, postType: resolved.postType || postType, title: entity.title, content: entity.content, isProtected };
    }
  }

  if (!entity.externalId) return null;

  return {
    wpPostId: String(entity.externalId).replace(/[^0-9]/g, ''),
    postType,
    title: entity.title,
    content: entity.content,
    isProtected,
  };
}

/**
 * Generate URL variants for flexible matching (http↔https, with/without trailing slash).
 */
function getUrlVariants(url) {
  const variants = new Set([url]);
  try {
    const parsed = new URL(url);
    // With and without trailing slash
    const withSlash = parsed.href.endsWith('/') ? parsed.href : parsed.href + '/';
    const withoutSlash = parsed.href.endsWith('/') ? parsed.href.slice(0, -1) : parsed.href;
    variants.add(withSlash);
    variants.add(withoutSlash);
    // http ↔ https
    if (parsed.protocol === 'http:') {
      const https = new URL(url);
      https.protocol = 'https:';
      variants.add(https.href);
      variants.add(https.href.endsWith('/') ? https.href.slice(0, -1) : https.href + '/');
    } else if (parsed.protocol === 'https:') {
      const http = new URL(url);
      http.protocol = 'http:';
      variants.add(http.href);
      variants.add(http.href.endsWith('/') ? http.href.slice(0, -1) : http.href + '/');
    }
  } catch { /* invalid URL, use original only */ }
  return [...variants];
}

// ─── Preview Generation (no WP push) ────────────────────────────────

/**
 * Generate AI-proposed changes for an insight without applying them.
 * Returns proposals that the user can review, edit, and then approve.
 */
export async function generateInsightPreview(insight, site, userId = null) {
  const type = getInsightType(insight.titleKey);

  switch (type) {
    case 'missingSeo':
      return previewMissingSeo(insight, site, userId);
    case 'keywordStrikeZone':
      return previewKeywordStrikeZone(insight, site, userId);
    case 'lowCtrForPosition':
      return previewLowCtrForPosition(insight, site, userId);
    case 'cannibalization':
      return previewCannibalization(insight, site, userId);
    case 'missingFeaturedImage':
      return previewMissingFeaturedImage(insight, site);
    case 'insufficientContentImages':
      return previewInsufficientContentImages(insight, site);
    case 'aiPageMissingSchema':
      return previewAiPageMissingSchema(insight, site, userId);
    case 'aiAnswerableButNotConcise':
      return previewAiAnswerableButNotConcise(insight, site, userId);
    // Meta-length fixes reuse the missingSeo pipeline. SeoGenerationSchema
    // already constrains title to 50-60 chars and description to 140-160,
    // which is exactly what these insights need. The data shape (pages[])
    // is the same — we don't even branch on which field is out of bounds.
    case 'metaTitleTooShort':
    case 'metaTitleTooLong':
    case 'metaDescTooShort':
    case 'metaDescTooLong':
      return previewMissingSeo(insight, site, userId);
    case 'missingH1Tag':
    case 'multipleH1Tags':
      return previewH1Fix(insight, site, userId);
    case 'staleContent':
    case 'decliningPages':
    case 'contentWithoutTraffic':
      return previewContentRefresh(insight, site, userId);
    case 'contentGaps':
    case 'newKeywordOpportunities':
      return previewNewArticle(insight, site, userId);
    case 'unlinkedKeywords':
      return previewInternalLinks(insight, site, userId);
    case 'aiEngineGap':
      return previewAiEngineGap(insight, site, userId);
    default:
      return { success: false, proposals: [], error: `Insight type "${type}" is not fixable` };
  }
}

/**
 * Regenerate a single proposal item by index.
 */
export async function regenerateItem(insight, site, itemIndex) {
  const type = getInsightType(insight.titleKey);

  switch (type) {
    case 'missingSeo':
      return regenerateMissingSeoItem(insight, site, itemIndex);
    case 'keywordStrikeZone':
      return regenerateKeywordItem(insight, site);
    case 'lowCtrForPosition':
      return regenerateLowCtrItem(insight, site, itemIndex);
    case 'cannibalization':
      return regenerateCannibalizationItem(insight, site, itemIndex);
    case 'missingFeaturedImage':
      return regenerateMissingFeaturedImageItem(insight, site, itemIndex);
    case 'insufficientContentImages':
      return regenerateInsufficientContentImagesItem(insight, site, itemIndex);
    case 'aiPageMissingSchema':
      return previewAiPageMissingSchema(insight, site);
    case 'aiAnswerableButNotConcise':
      return previewAiAnswerableButNotConcise(insight, site);
    case 'metaTitleTooShort':
    case 'metaTitleTooLong':
    case 'metaDescTooShort':
    case 'metaDescTooLong':
      return regenerateMissingSeoItem(insight, site, itemIndex);
    case 'missingH1Tag':
    case 'multipleH1Tags':
      return regenerateH1Item(insight, site, itemIndex);
    case 'staleContent':
    case 'decliningPages':
    case 'contentWithoutTraffic':
      return regenerateContentRefreshItem(insight, site, itemIndex);
    case 'contentGaps':
    case 'newKeywordOpportunities':
      return regenerateNewArticleItem(insight, site, itemIndex);
    case 'unlinkedKeywords':
      return regenerateInternalLinksItem(insight, site, itemIndex);
    case 'aiEngineGap':
      return previewAiEngineGap(insight, site);
    default:
      return { success: false, error: `Insight type "${type}" is not fixable` };
  }
}

/**
 * Apply user-approved proposals to WordPress.
 */
export async function applyInsightFix(insight, site, proposals, options = {}) {
  const type = getInsightType(insight.titleKey);
  
  // Cannibalization has special handling
  if (type === 'cannibalization') {
    return applyCannibalizationFix(insight, site, proposals, options);
  }

  // Image insight types have special handling
  if (type === 'missingFeaturedImage') {
    return applyMissingFeaturedImageFix(insight, site, proposals, options);
  }
  if (type === 'insufficientContentImages') {
    return applyInsufficientContentImagesFix(insight, site, proposals, options);
  }

  // AI coverage insight types
  if (type === 'aiPageMissingSchema') {
    return applyAiPageMissingSchemaFix(insight, site, proposals, options);
  }
  if (type === 'aiAnswerableButNotConcise') {
    return applyAiAnswerableFix(insight, site, proposals, options);
  }

  // ─── New AI fix types ──────────────────────────────────────────────
  if (type === 'missingH1Tag' || type === 'multipleH1Tags') {
    return applyH1Fix(insight, site, proposals, options);
  }
  if (type === 'staleContent' || type === 'decliningPages' || type === 'contentWithoutTraffic') {
    return applyContentRefreshFix(insight, site, proposals, options);
  }
  if (type === 'contentGaps' || type === 'newKeywordOpportunities') {
    return applyNewArticleFix(insight, site, proposals, options);
  }
  if (type === 'unlinkedKeywords') {
    return applyInternalLinksFix(insight, site, proposals, options);
  }
  if (type === 'aiEngineGap') {
    return applyAiEngineGapFix(insight, site, proposals, options);
  }

  // metaTitle*/metaDesc* fall through to the default SEO update branch
  // because their proposals have the same shape as missingSeo's.

  const isKeyword = type === 'keywordStrikeZone';
  const results = [];

  for (const p of proposals) {
    try {
      const seoPayload = { title: p.proposed.title, description: p.proposed.description };
      if (isKeyword && p.keyword) seoPayload.focusKeyword = p.keyword;

      await updateSeoData(site, p.postId, seoPayload);
      results.push({ ...p, status: 'fixed' });
    } catch (err) {
      results.push({ ...p, status: 'error', reason: err.message });
    }
  }

  const fixed = results.filter(r => r.status === 'fixed').length;
  return {
    success: fixed > 0,
    results,
    summary: `Fixed ${fixed}/${proposals.length} pages`,
  };
}

// ─── Missing SEO Preview ─────────────────────────────────────────────

async function previewMissingSeo(insight, site, userId = null) {
  const pages = insight.data?.pages || [];
  const entityIds = insight.actionPayload?.entityIds || [];
  if (pages.length === 0) {
    return { success: false, proposals: [], error: 'No pages in insight data' };
  }

  const proposals = [];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const entityId = entityIds[i] || null;

    try {
      const resolved = await resolveEntityToWpPost(site, { entityId, url: page.url });
      if (!resolved) {
        proposals.push({ page: page.title || page.slug, url: page.url, status: 'skipped', reason: 'Could not find WordPress post ID' });
        continue;
      }

      const { pageTitle, pageContent, currentSeo } = await getPageContentWithSeo(resolved, site);

      const seo = await generateSeoForPage({
        title: pageTitle,
        content: pageContent,
        siteName: site.name || site.url,
        locale: site.wpLocale || 'he',
        accountId: site.accountId,
        siteId: site.id,
        userId,
      });

      proposals.push({
        page: pageTitle || page.slug,
        url: page.url,
        postId: resolved.wpPostId,
        postType: resolved.postType,
        status: 'ready',
        current: currentSeo ? { title: currentSeo.title || '', description: currentSeo.description || '' } : { title: '', description: '' },
        proposed: seo,
      });
    } catch (err) {
      proposals.push({ page: page.title || page.slug, url: page.url, status: 'error', reason: err.message });
    }
  }

  return { success: proposals.some(p => p.status === 'ready'), proposals };
}

async function regenerateMissingSeoItem(insight, site, itemIndex) {
  const pages = insight.data?.pages || [];
  const entityIds = insight.actionPayload?.entityIds || [];
  const page = pages[itemIndex];
  if (!page) return { success: false, error: 'Item not found' };

  const entityId = entityIds[itemIndex] || null;
  const resolved = await resolveEntityToWpPost(site, { entityId, url: page.url });
  if (!resolved) return { success: false, error: 'Could not find WordPress post ID' };

  const { pageTitle, pageContent, currentSeo } = await getPageContentWithSeo(resolved, site);

  const seo = await generateSeoForPage({
    title: pageTitle,
    content: pageContent,
    siteName: site.name || site.url,
    locale: site.wpLocale || 'he',
    accountId: site.accountId,
    siteId: site.id,
  });

  return {
    success: true,
    proposal: {
      page: pageTitle || page.slug,
      url: page.url,
      postId: resolved.wpPostId,
      postType: resolved.postType,
      status: 'ready',
      current: currentSeo ? { title: currentSeo.title || '', description: currentSeo.description || '' } : { title: '', description: '' },
      proposed: seo,
    },
  };
}

// ─── Keyword Strike Zone Preview ─────────────────────────────────────

async function previewKeywordStrikeZone(insight, site, userId = null) {
  const d = insight.data || {};
  const { url, keyword } = d;

  if (!url || !keyword) {
    return { success: false, proposals: [], error: 'Missing URL or keyword in insight data' };
  }

  try {
    const resolved = await resolveEntityToWpPost(site, { url });
    if (!resolved) {
      return { success: false, proposals: [{ url, status: 'skipped', reason: 'Could not find WordPress post ID' }] };
    }

    const { pageTitle, pageContent, currentSeo } = await getPageContentWithSeo(resolved, site);

    const seo = await generateSeoForKeyword({
      title: pageTitle,
      content: pageContent,
      keyword,
      position: d.position,
      currentSeoTitle: currentSeo?.title || '',
      currentSeoDesc: currentSeo?.description || '',
      siteName: site.name || site.url,
      locale: site.wpLocale || 'he',
      accountId: site.accountId,
      siteId: site.id,
      userId,
    });

    return {
      success: true,
      proposals: [{
        page: pageTitle,
        url,
        postId: resolved.wpPostId,
        postType: resolved.postType,
        keyword,
        status: 'ready',
        current: currentSeo ? { title: currentSeo.title || '', description: currentSeo.description || '' } : { title: '', description: '' },
        proposed: seo,
      }],
    };
  } catch (err) {
    return { success: false, proposals: [{ url, keyword, status: 'error', reason: err.message }] };
  }
}

async function regenerateKeywordItem(insight, site) {
  const d = insight.data || {};
  const { url, keyword } = d;
  if (!url || !keyword) return { success: false, error: 'Missing URL or keyword' };

  const resolved = await resolveEntityToWpPost(site, { url });
  if (!resolved) return { success: false, error: 'Could not find WordPress post ID' };

  const { pageTitle, pageContent, currentSeo } = await getPageContentWithSeo(resolved, site);

  const seo = await generateSeoForKeyword({
    title: pageTitle,
    content: pageContent,
    keyword,
    position: d.position,
    currentSeoTitle: currentSeo?.title || '',
    currentSeoDesc: currentSeo?.description || '',
    siteName: site.name || site.url,
    locale: site.wpLocale || 'he',
    accountId: site.accountId,
    siteId: site.id,
  });

  return {
    success: true,
    proposal: {
      page: pageTitle,
      url,
      postId: resolved.wpPostId,
      postType: resolved.postType,
      keyword,
      status: 'ready',
      current: currentSeo ? { title: currentSeo.title || '', description: currentSeo.description || '' } : { title: '', description: '' },
      proposed: seo,
    },
  };
}

// ─── Low CTR For Position Preview ────────────────────────────────────

async function previewLowCtrForPosition(insight, site, userId = null) {
  const pages = insight.data?.pages || [];
  if (pages.length === 0) {
    return { success: false, proposals: [], error: 'No pages in insight data' };
  }

  const proposals = [];

  for (const page of pages) {
    const url = page.page;
    if (!url) {
      proposals.push({
        page: page.page || '',
        url: '',
        status: 'skipped',
        reason: 'Missing page URL in insight data',
      });
      continue;
    }

    try {
      const resolved = await resolveEntityToWpPost(site, { url });
      if (!resolved) {
        proposals.push({ page: url, url, status: 'skipped', reason: 'Could not find WordPress post ID' });
        continue;
      }

      const { pageTitle, pageContent, currentSeo } = await getPageContentWithSeo(resolved, site);

      const seo = await generateSeoForCtrGap({
        title: pageTitle,
        content: pageContent,
        position: page.position,
        actualCtr: page.actualCtr,
        expectedCtr: page.expectedCtr,
        currentSeoTitle: currentSeo?.title || '',
        currentSeoDesc: currentSeo?.description || '',
        siteName: site.name || site.url,
        locale: site.wpLocale || 'he',
        accountId: site.accountId,
        siteId: site.id,
        userId,
      });

      proposals.push({
        page: pageTitle || url,
        url,
        postId: resolved.wpPostId,
        postType: resolved.postType,
        status: 'ready',
        current: currentSeo ? { title: currentSeo.title || '', description: currentSeo.description || '' } : { title: '', description: '' },
        proposed: seo,
      });
    } catch (err) {
      proposals.push({ page: url, url, status: 'error', reason: err.message });
    }
  }

  return { success: proposals.some(p => p.status === 'ready'), proposals };
}

async function regenerateLowCtrItem(insight, site, itemIndex) {
  const pages = insight.data?.pages || [];
  const page = pages[itemIndex];
  if (!page) return { success: false, error: 'Item not found' };

  const url = page.page;
  if (!url) return { success: false, error: 'Missing page URL in insight data' };

  const resolved = await resolveEntityToWpPost(site, { url });
  if (!resolved) return { success: false, error: 'Could not find WordPress post ID' };

  const { pageTitle, pageContent, currentSeo } = await getPageContentWithSeo(resolved, site);

  const seo = await generateSeoForCtrGap({
    title: pageTitle,
    content: pageContent,
    position: page.position,
    actualCtr: page.actualCtr,
    expectedCtr: page.expectedCtr,
    currentSeoTitle: currentSeo?.title || '',
    currentSeoDesc: currentSeo?.description || '',
    siteName: site.name || site.url,
    locale: site.wpLocale || 'he',
    accountId: site.accountId,
    siteId: site.id,
  });

  return {
    success: true,
    proposal: {
      page: pageTitle || url,
      url,
      postId: resolved.wpPostId,
      postType: resolved.postType,
      status: 'ready',
      current: currentSeo ? { title: currentSeo.title || '', description: currentSeo.description || '' } : { title: '', description: '' },
      proposed: seo,
    },
  };
}

// ─── Content Helpers ─────────────────────────────────────────────────

async function getPageContent(resolved, page, site) {
  let pageTitle = resolved.title || page.title || '';
  let pageContent = '';
  if (resolved.content) {
    pageContent = stripHtml(resolved.content).slice(0, 1000);
  } else {
    try {
      const post = await getPost(site, resolved.postType, resolved.wpPostId);
      pageTitle = post?.title || pageTitle;
      pageContent = stripHtml(post?.content || '').slice(0, 1000);
    } catch { /* use what we have */ }
  }
  return { pageTitle, pageContent };
}

async function getPageContentWithSeo(resolved, site) {
  let pageTitle = resolved.title || '';
  let pageContent = resolved.content ? stripHtml(resolved.content).slice(0, 1000) : '';
  let currentSeo = null;

  try {
    const [post, seo] = await Promise.all([
      !pageContent ? getPost(site, resolved.postType, resolved.wpPostId) : Promise.resolve(null),
      getSeoData(site, resolved.wpPostId).catch(() => null),
    ]);
    if (post) {
      pageTitle = post.title || pageTitle;
      pageContent = stripHtml(post.content || '').slice(0, 1000);
    }
    currentSeo = seo;
  } catch { /* use what we have */ }

  return { pageTitle, pageContent, currentSeo };
}

/**
 * Get FULL page content + SEO for cannibalization analysis (no truncation).
 * Premium quality requires the AI to see the complete content of both pages.
 */
async function getFullPageContentWithSeo(resolved, site) {
  let pageTitle = resolved.title || '';
  let pageContent = resolved.content ? stripHtml(resolved.content) : '';
  let currentSeo = null;

  try {
    const [post, seo] = await Promise.all([
      !pageContent ? getPost(site, resolved.postType, resolved.wpPostId) : Promise.resolve(null),
      getSeoData(site, resolved.wpPostId).catch(() => null),
    ]);
    if (post) {
      pageTitle = post.title || pageTitle;
      pageContent = stripHtml(post.content || '');
    }
    currentSeo = seo;
  } catch { /* use what we have */ }

  return { pageTitle, pageContent, currentSeo };
}

/**
 * Default metric timeframe: 90 days for seasonality coverage and noise reduction.
 */
const METRIC_DAYS = 90;

/**
 * Fetch combined GSC + GA4 performance metrics for a page URL.
 * Returns unified metrics object with SEO value, user value, and conversion value.
 */
async function fetchPageMetrics(site, pageUrl) {
  try {
    const gi = site.googleIntegration;
    if (!gi) return null;

    const accessToken = await getValidMergeAccessToken(gi);
    if (!accessToken) return null;

    // Fetch GSC and GA4 in parallel
    const [gsc, ga4] = await Promise.all([
      gi.gscConnected && gi.gscSiteUrl
        ? fetchGSCPageMetrics(accessToken, gi.gscSiteUrl, pageUrl, METRIC_DAYS).catch(() => null)
        : Promise.resolve(null),
      gi.gaConnected && gi.gaPropertyId
        ? fetchGA4PageMetrics(accessToken, gi.gaPropertyId, new URL(pageUrl).pathname, METRIC_DAYS).catch(() => null)
        : Promise.resolve(null),
    ]);

    return { gsc, ga4 };
  } catch (err) {
    console.warn(`[fetchPageMetrics] Failed for ${pageUrl}:`, err.message);
    return null;
  }
}

/**
 * Calculate a weighted primary-page score from combined metrics.
 * Conversion value is highest priority, then user value, then SEO value.
 * @returns {number} Weighted score (higher = better primary candidate)
 */
function calculatePrimaryScore(metrics) {
  if (!metrics) return 0;
  const { gsc, ga4 } = metrics;

  // SEO Value: GSC clicks + impressions (weight: 1x)
  const seoScore = (gsc?.clicks || 0) * 2 + (gsc?.impressions || 0) * 0.01;

  // User Value: GA4 sessions + engagement rate (weight: 2x)
  const engagementMultiplier = ga4 ? parseFloat(ga4.engagementRate || '0') / 100 : 0;
  const userScore = ((ga4?.sessions || 0) + (ga4?.sessions || 0) * engagementMultiplier) * 2;

  // Conversion Value: GA4 key events/conversions (weight: 5x - highest priority)
  const conversionScore = (ga4?.conversions || 0) * 5;

  return seoScore + userScore + conversionScore;
}

// ─── Cannibalization Preview ─────────────────────────────────────────

/**
 * Generate AI-proposed fix for cannibalization issues.
 * Analyzes all competing pages and suggests how to resolve them.
 */
async function previewCannibalization(insight, site, userId = null) {
  const issues = insight.data?.issues || [];
  if (issues.length === 0) {
    return { success: false, proposals: [], error: 'No cannibalization issues in insight data' };
  }

  const proposals = [];

  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    const urls = issue.urls || [];
    const entities = issue.entities || [issue.entityA, issue.entityB].filter(Boolean);

    if (urls.length < 2) {
      proposals.push({
        issueIndex: i,
        status: 'skipped',
        reason: 'Need at least 2 URLs for competing pages',
      });
      continue;
    }

    try {
      // Resolve all pages to WP posts
      const resolved = await Promise.all(
        urls.map(url => resolveEntityToWpPost(site, { url }))
      );

      const resolvedCount = resolved.filter(Boolean).length;
      if (resolvedCount < 2) {
        proposals.push({
          issueIndex: i,
          pages: urls.map((url, idx) => ({ url, title: entities[idx]?.title || '' })),
          urlA: urls[0] || '',
          urlB: urls[1] || '',
          status: 'skipped',
          reason: `Could only resolve ${resolvedCount}/${urls.length} pages to WordPress posts`,
        });
        continue;
      }

      // Get full content + metrics (GSC + GA4) for all resolved pages
      const pagesData = await Promise.all(
        urls.map(async (url, idx) => {
          if (!resolved[idx]) return null;
          const [data, metrics] = await Promise.all([
            getFullPageContentWithSeo(resolved[idx], site),
            fetchPageMetrics(site, url),
          ]);
          return {
            title: data.pageTitle,
            content: data.pageContent,
            currentSeo: data.currentSeo,
            url,
            focusKeyword: entities[idx]?.focusKeyword || '',
            postId: resolved[idx].wpPostId,
            postType: resolved[idx].postType,
            isProtected: resolved[idx].isProtected || false,
            gsc: metrics?.gsc || null,
            ga4: metrics?.ga4 || null,
            primaryScore: calculatePrimaryScore(metrics),
          };
        })
      );

      const validPages = pagesData.filter(Boolean);
      if (validPages.length < 2) {
        proposals.push({
          issueIndex: i,
          status: 'error',
          reason: 'Could not fetch data for enough pages',
        });
        continue;
      }

      const fixSuggestion = await generateCannibalizationFix({
        pages: validPages,
        originalAction: issue.action,
        reason: issue.reason,
        locale: site.wpLocale || 'he',
        accountId: site.accountId,
        siteId: site.id,
        userId,
      });

      const proposalPages = validPages.map((p, idx) => ({
        url: p.url,
        postId: p.postId,
        postType: p.postType,
        title: p.title,
        isProtected: p.isProtected,
        currentSeo: p.currentSeo ? {
          title: p.currentSeo.title || '',
          description: p.currentSeo.description || '',
          focusKeyword: entities[idx]?.focusKeyword || '',
        } : { title: '', description: '', focusKeyword: '' },
      }));

      const pageAChanges = fixSuggestion.pagesChanges?.[0] || null;
      const pageBChanges = fixSuggestion.pagesChanges?.[1] || null;

      proposals.push({
        issueIndex: i,
        status: 'ready',
        isCannibalization: true,
        pages: proposalPages,
        urlA: proposalPages[0]?.url || '',
        urlB: proposalPages[1]?.url || '',
        postIdA: proposalPages[0]?.postId || '',
        postIdB: proposalPages[1]?.postId || '',
        postTypeA: proposalPages[0]?.postType || 'post',
        postTypeB: proposalPages[1]?.postType || 'post',
        titleA: proposalPages[0]?.title || '',
        titleB: proposalPages[1]?.title || '',
        currentA: proposalPages[0]?.currentSeo || { title: '', description: '', focusKeyword: '' },
        currentB: proposalPages[1]?.currentSeo || { title: '', description: '', focusKeyword: '' },
        recommendation: {
          ...fixSuggestion,
          pageAChanges: pageAChanges ? {
            newTitle: pageAChanges.newTitle,
            newDescription: pageAChanges.newDescription,
            newFocusKeyword: pageAChanges.newFocusKeyword,
            targetAngle: pageAChanges.targetAngle,
            contentRewritePlan: pageAChanges.contentRewritePlan || null,
          } : null,
          pageBChanges: pageBChanges ? {
            newTitle: pageBChanges.newTitle,
            newDescription: pageBChanges.newDescription,
            newFocusKeyword: pageBChanges.newFocusKeyword,
            targetAngle: pageBChanges.targetAngle,
            contentRewritePlan: pageBChanges.contentRewritePlan || null,
          } : null,
        },
      });
    } catch (err) {
      proposals.push({
        issueIndex: i,
        status: 'error',
        reason: err.message,
      });
    }
  }

  return { success: proposals.some(p => p.status === 'ready'), proposals };
}

/**
 * Regenerate a specific cannibalization fix proposal.
 */
async function regenerateCannibalizationItem(insight, site, itemIndex) {
  const issues = insight.data?.issues || [];
  const issue = issues[itemIndex];
  if (!issue) return { success: false, error: 'Issue not found' };

  const urls = issue.urls || [];
  const entities = issue.entities || [issue.entityA, issue.entityB].filter(Boolean);
  
  if (urls.length < 2) {
    return { success: false, error: 'Need at least 2 URLs for competing pages' };
  }

  // Resolve all URLs to WP posts in parallel
  const resolved = await Promise.all(
    urls.map(url => resolveEntityToWpPost(site, { url }))
  );

  // Check that essential pages resolved (at least 2)
  const resolvedCount = resolved.filter(Boolean).length;
  if (resolvedCount < 2) {
    return { success: false, error: `Could only resolve ${resolvedCount}/${urls.length} pages to WordPress posts` };
  }

  // Get full content + metrics (GSC + GA4) for all resolved pages
  const pagesData = await Promise.all(
    urls.map(async (url, i) => {
      if (!resolved[i]) return null;
      const [data, metrics] = await Promise.all([
        getFullPageContentWithSeo(resolved[i], site),
        fetchPageMetrics(site, url),
      ]);
      return {
        title: data.pageTitle,
        content: data.pageContent,
        currentSeo: data.currentSeo,
        url,
        focusKeyword: entities[i]?.focusKeyword || '',
        postId: resolved[i].wpPostId,
        postType: resolved[i].postType,
        isProtected: resolved[i].isProtected || false,
        gsc: metrics?.gsc || null,
        ga4: metrics?.ga4 || null,
        primaryScore: calculatePrimaryScore(metrics),
      };
    })
  );

  // Filter out nulls (unresolved pages)
  const validPages = pagesData.filter(Boolean);
  if (validPages.length < 2) {
    return { success: false, error: 'Could not fetch data for enough pages' };
  }

  const fixSuggestion = await generateCannibalizationFix({
    pages: validPages,
    originalAction: issue.action,
    reason: issue.reason,
    locale: site.wpLocale || 'he',
    accountId: site.accountId,
    siteId: site.id,
  });

  // Build pages array for the proposal
  const proposalPages = validPages.map((p, i) => ({
    url: p.url,
    postId: p.postId,
    postType: p.postType,
    isProtected: p.isProtected,
    title: p.title,
    currentSeo: p.currentSeo ? {
      title: p.currentSeo.title || '',
      description: p.currentSeo.description || '',
      focusKeyword: entities[i]?.focusKeyword || '',
    } : { title: '', description: '', focusKeyword: '' },
  }));

  // Map pagesChanges to backward-compat pageAChanges/pageBChanges
  const pageAChanges = fixSuggestion.pagesChanges?.[0] || null;
  const pageBChanges = fixSuggestion.pagesChanges?.[1] || null;

  return {
    success: true,
    proposal: {
      issueIndex: itemIndex,
      status: 'ready',
      isCannibalization: true,
      // Full pages array (new)
      pages: proposalPages,
      // Backward compat fields (mapped from pages[0] and pages[1])
      urlA: proposalPages[0]?.url || '',
      urlB: proposalPages[1]?.url || '',
      postIdA: proposalPages[0]?.postId || '',
      postIdB: proposalPages[1]?.postId || '',
      postTypeA: proposalPages[0]?.postType || 'post',
      postTypeB: proposalPages[1]?.postType || 'post',
      titleA: proposalPages[0]?.title || '',
      titleB: proposalPages[1]?.title || '',
      currentA: proposalPages[0]?.currentSeo || { title: '', description: '', focusKeyword: '' },
      currentB: proposalPages[1]?.currentSeo || { title: '', description: '', focusKeyword: '' },
      recommendation: {
        ...fixSuggestion,
        // Backward compat: map pagesChanges to pageAChanges/pageBChanges
        pageAChanges: pageAChanges ? {
          newTitle: pageAChanges.newTitle,
          newDescription: pageAChanges.newDescription,
          newFocusKeyword: pageAChanges.newFocusKeyword,
          targetAngle: pageAChanges.targetAngle,
          contentRewritePlan: pageAChanges.contentRewritePlan || null,
        } : null,
        pageBChanges: pageBChanges ? {
          newTitle: pageBChanges.newTitle,
          newDescription: pageBChanges.newDescription,
          newFocusKeyword: pageBChanges.newFocusKeyword,
          targetAngle: pageBChanges.targetAngle,
          contentRewritePlan: pageBChanges.contentRewritePlan || null,
        } : null,
      },
    },
  };
}

/**
 * Generate AI recommendation for fixing cannibalization.
 * Supports 2+ competing pages with multi-source traffic validation (GSC + GA4).
 */
async function generateCannibalizationFix({ pages, originalAction, reason, locale, accountId, siteId, userId = null }) {
  const isHebrew = locale?.startsWith('he');
  const pageCount = pages.length;
  
  // Estimate content lengths and merged length
  const contentLengths = pages.map(p => (p.content || '').split(/\s+/).length);
  const estimatedMergedLength = contentLengths.reduce((sum, l) => sum + l, 0);

  // Build GSC data formatter
  const formatGSC = (gsc) => {
    if (!gsc) return '(GSC data unavailable)';
    const queries = (gsc.topQueries || [])
      .map(q => `  - "${q.query}" - ${q.clicks} clicks, ${q.impressions} impressions, pos ${q.position}`)
      .join('\n');
    return `Clicks: ${gsc.clicks} | Impressions: ${gsc.impressions} | CTR: ${gsc.ctr}% | Avg Position: ${gsc.position}${queries ? '\nTop Queries:\n' + queries : ''}`;
  };

  // Build GA4 data formatter
  const formatGA4 = (ga4) => {
    if (!ga4) return '(GA4 data unavailable)';
    const sources = (ga4.topSources || [])
      .map(s => `  - ${s.source} / ${s.medium} - ${s.sessions} sessions`)
      .join('\n');
    return `Sessions: ${ga4.sessions} | Engagement Rate: ${ga4.engagementRate}% | Conversions (Key Events): ${ga4.conversions}${sources ? '\nTop 10 Traffic Sources:\n' + sources : ''}`;
  };

  // ─── Commercial Signal Detection (Affiliate/Sponsored) ──────
  const COMMERCIAL_PATTERNS = [
    /[?&](ref|aff|affiliate|partner|click_?id|tracking_?id|campaign_?id)=/i,
    /rel\s*=\s*["'][^"']*sponsored[^"']*["']/i,
    /rel\s*=\s*["'][^"']*nofollow[^"']*["']/i,
    /(?:amazon\.com|shareasale|commission[jJ]unction|clickbank|cj\.com|rakuten|awin|impact\.com|partnerize)[^"'\s<]*/i,
    /(?:amzn\.to|bit\.ly|geni\.us|fave\.co)[^"'\s<]*/i,
  ];

  function detectCommercialSignals(content) {
    if (!content) return { isMoneyPage: false, signals: [] };
    const signals = [];
    for (const pattern of COMMERCIAL_PATTERNS) {
      const match = content.match(pattern);
      if (match) signals.push(match[0].slice(0, 60));
    }
    return { isMoneyPage: signals.length > 0, signals };
  }

  // Detect commercial signals and protected status for each page
  const pageFlags = pages.map(page => ({
    isProtected: page.isProtected || false,
    ...detectCommercialSignals(page.content),
  }));

  const hasProtectedPages = pageFlags.some(f => f.isProtected);
  const hasMoneyPages = pageFlags.some(f => f.isMoneyPage);

  // ─── Multi-Source Primary Page Selection ─────────────────────
  // Use weighted score: Conversions (5x) > User Value (2x) > SEO Value (1x)
  const primaryScores = pages.map(p => p.primaryScore || calculatePrimaryScore({ gsc: p.gsc, ga4: p.ga4 }));
  const hasAnyData = primaryScores.some(s => s > 0);
  const highestScoreIdx = primaryScores.indexOf(Math.max(...primaryScores));

  // Fallback to GSC clicks if no weighted scores
  const clicks = pages.map(p => p.gsc?.clicks || 0);
  const hasGSCData = clicks.some(c => c > 0);
  const highestTrafficIdx = hasAnyData ? highestScoreIdx : clicks.indexOf(Math.max(...clicks));
  const highestTrafficLabel = String.fromCharCode(65 + highestTrafficIdx);

  // Check if GA4 data influenced the primary selection (conversion/session override)
  const hasGA4Data = pages.some(p => p.ga4?.sessions > 0);
  const ga4OverrideInfo = hasGA4Data && highestScoreIdx !== clicks.indexOf(Math.max(...clicks))
    ? `\n⚠️ NOTE: Based on weighted scoring (Conversions > Sessions > Clicks), Page ${highestTrafficLabel} is the primary - even though it may not have the most GSC clicks. It has higher conversion/user value.`
    : '';

  // Build page sections for the prompt
  const pageSections = pages.map((page, i) => {
    const label = String.fromCharCode(65 + i); // A, B, C, D...
    const flags = pageFlags[i];
    const flagLines = [];
    if (flags.isProtected) flagLines.push('🔒 PROTECTED ASSET - This page is protected by the user. It CANNOT be merged away, trashed, or redirected.');
    if (flags.isMoneyPage) flagLines.push(`💰 MONEY PAGE - Commercial/affiliate signals detected: ${flags.signals.join(', ')}`);
    const flagSection = flagLines.length > 0 ? '\n' + flagLines.join('\n') : '';
    return `## ═══════════════════════════════════════════════════
## PAGE ${label}
## ═══════════════════════════════════════════════════
URL: ${page.url}
Post ID: ${page.postId || 'unknown'}
Title: ${page.title}${flagSection}
Current SEO Title: ${page.currentSeo?.title || '(not set)'}
Current Meta Description: ${page.currentSeo?.description || '(not set)'}
Current Focus Keyword: ${page.focusKeyword || '(not set)'}
Word count: ~${contentLengths[i]} words
Weighted Primary Score: ${primaryScores[i].toFixed(1)}

### GSC Performance (Last ${METRIC_DAYS} Days)
${formatGSC(page.gsc)}

### GA4 Analytics (Last ${METRIC_DAYS} Days)
${formatGA4(page.ga4)}

### Full Content
${page.content || '(content not available)'}`;
  }).join('\n\n');

  // Build traffic comparison
  const trafficComparison = hasAnyData
    ? `\nPrimary page winner: Page ${highestTrafficLabel} (weighted score: ${primaryScores[highestTrafficIdx].toFixed(1)}).` +
      `\nScores per page: ${pages.map((p, i) => `Page ${String.fromCharCode(65 + i)}: ${primaryScores[i].toFixed(1)} (GSC: ${clicks[i]} clicks, GA4: ${p.ga4?.sessions || 0} sessions, ${p.ga4?.conversions || 0} conversions)`).join(', ')}` +
      ga4OverrideInfo
    : '';
  
  const prompt = `You are a senior enterprise SEO consultant performing a premium-grade cannibalization resolution analysis.
You MUST read and analyze the FULL content of ALL ${pageCount} pages before making any recommendation. Do NOT skip or skim content.

${pageSections}

## ═══════════════════════════════════════════════════
## DETECTED ISSUE
## ═══════════════════════════════════════════════════
${reason}
System's initial recommendation: ${originalAction}
Number of competing pages: ${pageCount}
Data timeframe: Last ${METRIC_DAYS} days (accounts for seasonality)
${trafficComparison}

## ═══════════════════════════════════════════════════
## PRIMARY PAGE SELECTION LOGIC
## ═══════════════════════════════════════════════════
The primary page is chosen using a weighted score (highest priority first):
1. **Conversion Value** (5x weight): GA4 conversions/key events - a page that converts users is critical
2. **User Value** (2x weight): GA4 sessions × engagement rate - real user engagement
3. **SEO Value** (1x weight): GSC clicks + impressions - search engine validation
${hasGA4Data ? `If a page has more conversions or higher total sessions in GA4, it should be the Primary even if GSC clicks are slightly lower.` : ''}

## ═══════════════════════════════════════════════════
## YOUR ANALYSIS PROCESS
## ═══════════════════════════════════════════════════

You must follow this analysis process step by step:

### Step 1: Deep Content Analysis
- Read the FULL content of ALL ${pageCount} pages thoroughly
- Identify the specific topics, subtopics, and unique information in each page
- Determine the user intent each page is trying to serve
- Assess the content quality, depth, and uniqueness of each page

### Step 2: URL Structure Analysis
- Examine URL patterns: Are these blog posts, product pages, category pages, or parameter variations?
- Check if URLs suggest pagination, filtering, or variant pages (e.g., ?color=red, /page/2)
- Identify if this is an eCommerce catalog situation

### Step 3: Multi-Source Data Analysis
- **GSC Data**: Which page receives the most organic clicks and has the best position?
- **GA4 Data**: Which page has the most sessions, highest engagement rate, and most conversions?
- **Traffic Sources**: Review the GA4 top 10 traffic sources for each page - this reveals the full audience context (organic, paid, social, referral, email, etc.)
- **Combined Score**: Use the weighted primary score to determine which page has the highest overall value
${hasProtectedPages || hasMoneyPages ? `
### CRITICAL CONSTRAINTS - Protected & Money Pages
${hasProtectedPages ? `
🔒 **PROTECTED ASSET RULE**: Pages marked as PROTECTED CANNOT be:
- Selected as secondary pages for MERGE (they must NOT be trashed)
- Selected as source pages for 301_REDIRECT (they must NOT be redirected away)
- If a protected page is involved, it MUST be treated as the primary page or use DIFFERENTIATE
- This overrides all other selection logic including weighted scores` : ''}
${hasMoneyPages ? `
💰 **MONEY PAGE RULE**: Pages with affiliate/sponsored/commercial links are revenue-generating assets:
- Their monetization links and structure MUST be preserved during any resolution
- If recommending DIFFERENTIATE, the money page should keep its commercial angle - optimize the OTHER page to avoid the money page's intent
- If recommending MERGE, the money page should be the primary - and merge instructions must explicitly preserve all commercial links and CTAs
- NEVER recommend trashing or redirecting away FROM a money page` : ''}
` : ''}
### Step 4: Action Selection (STRICT RULES)

**DIFFERENTIATE** - Use ONLY when:
- Pages target genuinely DIFFERENT user intents (e.g., "best X" vs "how to use X")
- Pages have unique, substantial content that serves distinct purposes
- A reader coming from a different search query would find real value in each page separately
- DO NOT differentiate pages that cover the same topic from slightly different angles - those should MERGE
- **IMPORTANT**: When DIFFERENTIATE is chosen, you MUST provide a detailed contentRewritePlan for EACH page describing how its body content should be rewritten to clearly target its unique intent

**MERGE** (PREFERRED for blog content) - Use when:
- Pages are blog posts, articles, guides, or informational content
- They cover the same or highly overlapping topics
- Combining them would create a more comprehensive, authoritative resource
- Even if all have good content - a single stronger page outranks multiple weaker ones
- This is the DEFAULT action for blog/article cannibalization
- For ${pageCount} pages: Keep the primary page, merge content from ALL secondary pages, redirect all secondary pages

**CANONICAL** - Use ONLY when:
- Pages are eCommerce product variants (color, size, etc.)
- Pages are paginated versions of the same list
- Pages are parameterized/filtered views of the same content
- NEVER use canonical for blog posts or articles - use MERGE instead

**301_REDIRECT** - Use ONLY when:
- The secondary pages have virtually ZERO unique value
- The secondary pages are essentially duplicates or near-empty versions
- The secondary pages' content is entirely contained within the primary page
- There is nothing worth salvaging or merging from the secondary pages

## ═══════════════════════════════════════════════════
## OUTPUT REQUIREMENTS
## ═══════════════════════════════════════════════════

${isHebrew ? 'CRITICAL: Write ALL output in Hebrew - reasoning, merge instructions, target angles, titles, descriptions, keywords, content rewrite plans. Everything.' : 'Write in the same language as the page content.'}

IMPORTANT: The current year is ${new Date().getFullYear()}. Use ${new Date().getFullYear()} for any year references unless the content specifically discusses a historical year.

${hasAnyData ? `CRITICAL PRIMARY PAGE RULE: The primary page (primaryPostId) MUST be Page ${highestTrafficLabel} (Post ID: ${pages[highestTrafficIdx].postId}), the page with the highest weighted score. This is non-negotiable - we never sacrifice a page that has proven user value (conversions, sessions, or search traffic).` : ''}

You MUST return exactly ${pageCount} entries in the pagesChanges array - one for each page (A${pageCount > 2 ? ', B, ' + Array.from({length: pageCount - 2}, (_, i) => String.fromCharCode(67 + i)).join(', ') : ', B'}).

### For DIFFERENTIATE:
- Give EACH page a DISTINCT focus keyword with zero overlap
- Optimize titles to clearly communicate completely different intents
- Meta descriptions must highlight what makes each page unique - a user should NEVER be confused about which page to read
- SEO titles: 50-60 characters | Meta descriptions: 140-160 characters
- **MANDATORY: Provide a contentRewritePlan for EACH page** - a detailed editorial plan for rewriting the body content:
  * New H2/H3 heading structure
  * Sections to add, remove, or completely rewrite
  * Tone and style direction (e.g., "convert to a product comparison", "rewrite as a technical how-to")
  * What unique angle or value proposition each page should emphasize
  * Specific instructions for a content editor to make the pages clearly distinct

### For MERGE:
- Set primaryPostId to ${hasAnyData ? `Post ID ${pages[highestTrafficIdx].postId} (the page with highest weighted score)` : 'the page with best content/authority'}
- In mergedPageChanges: Provide comprehensive SEO that encompasses the best of ALL pages
- For each page in pagesChanges: Fill with CURRENT/EXISTING titles, descriptions, and focus keywords. Fill targetAngle with each page's detected search intent
- Choose the best articleType: seo, blogPost, guide, howTo, listicle, comparison, review, news, tutorial, caseStudy
- Set suggestedContentImages based on merged word count (~${estimatedMergedLength} words): 0 for <500w, 1-2 for 500-1000w, 2-3 for 1000-2000w, 4-5 for >2000w
- Write DETAILED mergeInstructions that tell a content editor exactly how to combine the content from ALL ${pageCount} pages:
  * Which sections to keep from each page
  * Which sections overlap and how to reconcile them
  * What unique information from each secondary page to add to the primary
  * Suggested structure for the merged article (H2 headings outline)
  * Any content that should be removed (outdated info, redundancy)
  * Reference the GA4 traffic sources to understand each page's audience context

### For CANONICAL or 301_REDIRECT:
- Set primaryPostId to ${hasAnyData ? `Post ID ${pages[highestTrafficIdx].postId} (the highest-value page)` : 'the authoritative page'}
- Set canonicalTarget to the primary page's URL
- For each page in pagesChanges: fill with CURRENT/EXISTING SEO data and detected targetAngle

### For mergeInstructions:
Write in clear natural language for a content editor. Do NOT reference code field names. Use instructions like:
"Keep the introduction from Page A but add the statistics paragraph from Page B."
"Create a new H2 section titled '...' combining the pricing comparison from Pages B and C."
"Remove the outdated 2023 statistics from Page C."`;

  const result = await generateStructuredResponse({
    system: `You are a senior enterprise SEO consultant at a top-tier agency.
Your cannibalization resolution analysis must be thorough, data-driven, and precise.
You have access to the FULL content of ${pageCount} competing pages, GSC search performance data, AND GA4 analytics data (sessions, engagement, conversions, traffic sources).
Prioritize conversion value and user engagement above raw search traffic when selecting the primary page.
Never recommend an action that would destroy a high-converting page or lose unique valuable content.`,
    prompt,
    schema: CannibalizationFixSchema,
    temperature: 0.3,
    operation: 'CANNIBALIZATION_FIX',
    metadata: { pages: pages.map(p => p.url) },
    accountId,
    siteId,
    userId,
  });

  // Enforce protected pages cannot be secondary (safety net)
  const protectedIdx = pages.findIndex(p => p.isProtected);
  if (protectedIdx !== -1 && result.recommendedAction !== 'DIFFERENTIATE') {
    const protectedPostId = pages[protectedIdx].postId;
    if (result.primaryPostId && result.primaryPostId !== protectedPostId) {
      console.warn(`[generateCannibalizationFix] Protected page override: ${result.primaryPostId} → ${protectedPostId}`);
      result.primaryPostId = protectedPostId;
      if (result.canonicalTarget) {
        result.canonicalTarget = pages[protectedIdx].url;
      }
    }
  }

  // Enforce primary page = highest weighted score page (safety net)
  // Only override if no protected page takes priority
  if (hasAnyData && result.recommendedAction !== 'DIFFERENTIATE' && protectedIdx === -1) {
    const correctPrimaryId = pages[highestTrafficIdx].postId;
    if (result.primaryPostId && result.primaryPostId !== correctPrimaryId) {
      console.warn(`[generateCannibalizationFix] AI chose wrong primary page. Overriding ${result.primaryPostId} → ${correctPrimaryId} (weighted-score-based)`);
      result.primaryPostId = correctPrimaryId;
      if (result.canonicalTarget) {
        result.canonicalTarget = pages[highestTrafficIdx].url;
      }
    }
  }

  // Ensure pagesChanges has the right count
  if (!result.pagesChanges || result.pagesChanges.length < pageCount) {
    // Pad with defaults if AI returned fewer entries than expected
    const existing = result.pagesChanges || [];
    result.pagesChanges = pages.map((p, i) => {
      if (existing[i]) return existing[i];
      return {
        pageLabel: String.fromCharCode(65 + i),
        newTitle: p.currentSeo?.title || p.title || '',
        newDescription: p.currentSeo?.description || '',
        newFocusKeyword: p.focusKeyword || '',
        targetAngle: '',
      };
    });
  }

  // Ensure mergedPageChanges has defaults when action is MERGE
  if (result.recommendedAction === 'MERGE' && !result.mergedPageChanges) {
    const primary = pages[highestTrafficIdx] || pages[0];
    result.mergedPageChanges = {
      newTitle: primary.currentSeo?.title || primary.title || '',
      newDescription: primary.currentSeo?.description || '',
      newFocusKeyword: primary.focusKeyword || pages[0]?.focusKeyword || '',
      targetAngle: result.pagesChanges?.[0]?.targetAngle || '',
      articleType: 'seo',
      suggestedContentImages: Math.min(5, Math.max(0, Math.floor(estimatedMergedLength / 500))),
    };
  }

  return result;
}

/**
 * Apply cannibalization fix to WordPress.
 * Supports DIFFERENTIATE action (updates SEO data for both pages).
 * MERGE action combines content, trashes old post, creates redirect.
 * CANONICAL and 301_REDIRECT create redirects and update canonical tags.
 * 
 * @param {Object} insight - The agent insight
 * @param {Object} site - Site with connection details
 * @param {Array} proposals - Approved proposals to apply
 * @param {Object} options - Apply options
 * @param {boolean} options.generateFeaturedImages - Generate unique featured images (1 credit each)
 * @param {boolean} options.generateContentImages - Generate content images (2 credits each, max 3)
 */
export async function applyCannibalizationFix(insight, site, proposals, options = {}) {
  const results = [];
  const { generateFeaturedImages = false } = options;

  // Check if any proposal has content images requested
  const anyContentImages = proposals.some(p => (p.contentImageCount || 0) > 0);

  // Get image context once if we're generating any images
  let imageContext = null;
  if (generateFeaturedImages || anyContentImages) {
    try {
      // Fetch full site data for image context
      const fullSite = await prisma.site.findUnique({
        where: { id: site.id },
        select: {
          id: true,
          url: true,
          name: true,
          wpLocale: true,
          crawledData: true,
          seoStrategy: true,
        },
      });
      if (fullSite) {
        imageContext = await gatherImageContext(fullSite);
      }
    } catch (err) {
      console.warn('[applyCannibalizationFix] Failed to get image context:', err.message);
    }
  }

  for (const p of proposals) {
    if (p.status !== 'ready' || !p.recommendation) {
      results.push({ ...p, status: 'skipped', reason: 'Proposal not ready' });
      continue;
    }

    const action = p.recommendation.recommendedAction;
    // Use pages array if available, fall back to A/B compat fields
    const allPages = p.pages || [
      { url: p.urlA, postId: p.postIdA, postType: p.postTypeA || 'post' },
      { url: p.urlB, postId: p.postIdB, postType: p.postTypeB || 'post' },
    ].filter(pg => pg.url && pg.postId);
    const pagesChanges = p.recommendation.pagesChanges || [
      p.recommendation.pageAChanges,
      p.recommendation.pageBChanges,
    ].filter(Boolean);
    
    if (action === 'DIFFERENTIATE') {
      try {
        // Identify the "peer" page each rewritten page is differentiating from
        // (the strongest page in the cluster - by convention, index 0).
        const peerForRewrite = allPages[0];

        // Update SEO and (when a rewrite plan exists) body content for ALL pages
        for (let i = 0; i < allPages.length; i++) {
          const page = allPages[i];
          const changes = pagesChanges[i];
          if (!page?.postId || !changes) continue;

          const seo = {
            title: changes.newTitle,
            description: changes.newDescription,
            focusKeyword: changes.newFocusKeyword,
          };
          await updateSeoData(site, page.postId, seo);

          // Body rewrite: only when (a) there's an actionable plan AND (b) this
          // page isn't the peer (rewriting the peer would cancel the diff).
          if (changes.contentRewritePlan && page.postId !== peerForRewrite?.postId) {
            try {
              const postType = page.postType || 'post';
              const currentPost = await getPost(site, postType, page.postId).catch(() => null);
              const currentHtml = currentPost?.content?.rendered || '';
              const currentTitle = currentPost?.title?.rendered || page.url || '';

              const rewritten = await generateDifferentiatedContent({
                site,
                currentBodyHtml: currentHtml,
                currentTitle,
                peerTitle: pagesChanges[0]?.newTitle || peerForRewrite?.url || '',
                peerUrl: peerForRewrite?.url || '',
                rewritePlan: changes.contentRewritePlan,
                newTitle: changes.newTitle,
                newFocusKeyword: changes.newFocusKeyword,
                targetAngle: changes.targetAngle,
              });

              if (rewritten?.html) {
                await updatePost(site, postType, page.postId, {
                  content: rewritten.html,
                  excerpt: rewritten.excerpt || undefined,
                });
                console.log(`[applyCannibalizationFix] DIFFERENTIATE: rewrote body for page ${page.postId} (${page.url})`);
              }
            } catch (rewriteErr) {
              // Non-fatal: SEO updates already landed; surface the rewrite issue
              // but don't fail the whole proposal.
              console.warn(`[applyCannibalizationFix] DIFFERENTIATE body rewrite failed for ${page.postId}:`, rewriteErr.message);
            }
          }

          // Generate featured image for each page
          if (generateFeaturedImages && imageContext) {
            try {
              const imageUrl = await generateAndUploadFeaturedImage({
                site,
                postId: page.postId,
                postType: page.postType || 'post',
                title: changes.newTitle,
                focusKeyword: changes.newFocusKeyword,
                targetAngle: changes.targetAngle,
                imageContext,
              });
              if (imageUrl) {
                console.log(`[applyCannibalizationFix] Generated featured image for Page ${String.fromCharCode(65 + i)}: ${imageUrl}`);
              }
            } catch (imgErr) {
              console.warn(`[applyCannibalizationFix] Failed to generate image for Page ${String.fromCharCode(65 + i)}:`, imgErr.message);
            }
          }
        }

        // Generate content images for the first page only (UI limitation)
        const contentCount = p.contentImageCount || 0;
        if (contentCount > 0 && imageContext && pagesChanges[0]) {
          try {
            await generateAndInsertContentImages({
              site,
              postId: allPages[0].postId,
              postType: allPages[0].postType || 'post',
              title: pagesChanges[0].newTitle,
              focusKeyword: pagesChanges[0].newFocusKeyword,
              targetAngle: pagesChanges[0].targetAngle,
              imageContext,
              maxImages: contentCount,
            });
          } catch (imgErr) {
            console.warn(`[applyCannibalizationFix] Failed to generate content images for Page A:`, imgErr.message);
          }
        }

        results.push({ ...p, status: 'fixed', contentRewritePlans: pagesChanges.map(c => c.contentRewritePlan).filter(Boolean) });
      } catch (err) {
        results.push({ ...p, status: 'error', reason: err.message });
      }
    } else if (action === 'MERGE') {
      // Merge action: Keep the primary page, update SEO, trash ALL secondary pages, create redirects
      try {
        const primaryPostId = p.recommendation.primaryPostId || allPages[0]?.postId;
        const primaryPage = allPages.find(pg => pg.postId === primaryPostId) || allPages[0];
        const secondaryPages = allPages.filter(pg => pg.postId !== primaryPostId);

        // Safety net: never trash a protected page
        const protectedSecondary = secondaryPages.find(pg => pg.isProtected);
        if (protectedSecondary) {
          results.push({ ...p, status: 'error', reason: `Cannot merge: page "${protectedSecondary.url}" is protected and cannot be trashed` });
          continue;
        }
        
        // Update SEO for the primary page (the page that remains)
        if (p.recommendation.mergedPageChanges) {
          const seo = {
            title: p.recommendation.mergedPageChanges.newTitle,
            description: p.recommendation.mergedPageChanges.newDescription,
            focusKeyword: p.recommendation.mergedPageChanges.newFocusKeyword,
          };
          await updateSeoData(site, primaryPostId, seo);
        }

        // Generate featured image for merged page
        if (generateFeaturedImages && imageContext && p.recommendation.mergedPageChanges) {
          try {
            const imageUrl = await generateAndUploadFeaturedImage({
              site,
              postId: primaryPostId,
              postType: primaryPage.postType || 'post',
              title: p.recommendation.mergedPageChanges.newTitle,
              focusKeyword: p.recommendation.mergedPageChanges.newFocusKeyword,
              targetAngle: p.recommendation.mergedPageChanges.targetAngle,
              imageContext,
            });
            if (imageUrl) {
              console.log(`[applyCannibalizationFix] Generated featured image for merged page: ${imageUrl}`);
            }
          } catch (imgErr) {
            console.warn(`[applyCannibalizationFix] Failed to generate image for merged page:`, imgErr.message);
          }
        }

        // Generate content images for merged page
        const contentCount = p.contentImageCount || 0;
        if (contentCount > 0 && imageContext && p.recommendation.mergedPageChanges) {
          try {
            await generateAndInsertContentImages({
              site,
              postId: primaryPostId,
              postType: primaryPage.postType || 'post',
              title: p.recommendation.mergedPageChanges.newTitle,
              focusKeyword: p.recommendation.mergedPageChanges.newFocusKeyword,
              targetAngle: p.recommendation.mergedPageChanges.targetAngle,
              imageContext,
              maxImages: contentCount,
            });
          } catch (imgErr) {
            console.warn(`[applyCannibalizationFix] Failed to generate content images for merged page:`, imgErr.message);
          }
        }

        // Create 301 redirects and trash ALL secondary pages
        const trashedUrls = [];
        for (const secondary of secondaryPages) {
          try {
            const fromPath = new URL(secondary.url).pathname;
            const toPath = new URL(primaryPage.url).pathname;
            
            await createRedirect(site, {
              source: fromPath,
              target: toPath,
              type: '301',
              enabled: true,
            });
            console.log(`[applyCannibalizationFix] Created redirect: ${fromPath} -> ${toPath}`);
          } catch (redirectErr) {
            console.warn(`[applyCannibalizationFix] Failed to create redirect for ${secondary.url}:`, redirectErr.message);
          }

          try {
            const secondaryPost = await getPost(site, secondary.postType || 'post', secondary.postId).catch(() => null);
            const secondaryPostType = secondaryPost?.type || secondary.postType || 'post';
            await updatePost(site, secondaryPostType, secondary.postId, { status: 'trash' });
            console.log(`[applyCannibalizationFix] Trashed secondary post: ${secondary.postId}`);
            trashedUrls.push(secondary.url);
          } catch (trashErr) {
            console.warn(`[applyCannibalizationFix] Failed to trash secondary post ${secondary.postId}:`, trashErr.message);
          }
        }

        // Internal Link Healing: replace all internal links pointing to trashed URLs
        await healInternalLinks(site, trashedUrls, primaryPage.url);

        results.push({ ...p, status: 'fixed', mergedTo: primaryPage.url, trashedPosts: trashedUrls });
      } catch (err) {
        results.push({ ...p, status: 'error', reason: err.message });
      }
    } else if (action === '301_REDIRECT') {
      // 301 redirect: Keep primary page, redirect ALL secondary pages
      try {
        const primaryPostId = p.recommendation.primaryPostId || allPages[0]?.postId;
        const primaryPage = allPages.find(pg => pg.postId === primaryPostId) || allPages[0];
        const secondaryPages = allPages.filter(pg => pg.postId !== primaryPostId);

        // Safety net: never redirect away from a protected page
        const protectedSecondary = secondaryPages.find(pg => pg.isProtected);
        if (protectedSecondary) {
          results.push({ ...p, status: 'error', reason: `Cannot redirect: page "${protectedSecondary.url}" is protected and cannot be redirected away` });
          continue;
        }

        const trashedUrls = [];
        for (const secondary of secondaryPages) {
          const fromPath = new URL(secondary.url).pathname;
          const toPath = new URL(primaryPage.url).pathname;
          
          await createRedirect(site, {
            source: fromPath,
            target: toPath,
            type: '301',
            enabled: true,
          });
          console.log(`[applyCannibalizationFix] Created 301 redirect: ${fromPath} -> ${toPath}`);

          const secondaryPost = await getPost(site, secondary.postType || 'post', secondary.postId).catch(() => null);
          const secondaryPostType = secondaryPost?.type || secondary.postType || 'post';
          await updatePost(site, secondaryPostType, secondary.postId, { status: 'trash' });
          console.log(`[applyCannibalizationFix] Trashed redirected post: ${secondary.postId}`);
          trashedUrls.push(secondary.url);
        }

        // Internal Link Healing: replace all internal links pointing to trashed URLs
        await healInternalLinks(site, trashedUrls, primaryPage.url);

        results.push({ ...p, status: 'fixed', redirectedTo: primaryPage.url, trashedPosts: trashedUrls });
      } catch (err) {
        results.push({ ...p, status: 'error', reason: err.message });
      }
    } else if (action === 'CANONICAL') {
      // Canonical: Set canonical tag on ALL secondary pages to point to primary
      try {
        const primaryPostId = p.recommendation.primaryPostId || allPages[0]?.postId;
        const primaryPage = allPages.find(pg => pg.postId === primaryPostId) || allPages[0];
        const primaryUrl = p.recommendation.canonicalTarget || primaryPage.url;
        const secondaryPages = allPages.filter(pg => pg.postId !== primaryPostId);

        for (const secondary of secondaryPages) {
          await updateSeoData(site, secondary.postId, {
            canonical: primaryUrl,
          });
          console.log(`[applyCannibalizationFix] Set canonical on ${secondary.postId} to ${primaryUrl}`);
        }

        results.push({ ...p, status: 'fixed', canonicalSet: primaryUrl });
      } catch (err) {
        results.push({ ...p, status: 'error', reason: err.message });
      }
    } else {
      results.push({ ...p, status: 'skipped', reason: 'Unknown action type' });
    }
  }

  const fixed = results.filter(r => r.status === 'fixed').length;
  const manualRequired = results.filter(r => r.status === 'manual_required').length;

  // Record baseline metrics for the 14-day measurement loop. Fire-and-forget
  // - failure here must not roll back the actual fix. See agent-fix-outcomes.js.
  try {
    const { recordBaseline } = await import('@/lib/agent-fix-outcomes.js');
    for (const r of results) {
      if (r.status !== 'fixed') continue;
      const action = r.recommendation?.recommendedAction;
      if (!action) continue;
      const urls = (r.pages || [{ url: r.urlA }, { url: r.urlB }]).map(p => p?.url).filter(Boolean);
      if (urls.length === 0) continue;
      recordBaseline({
        siteId: site.id,
        accountId: site.accountId,
        insightId: insight?.id,
        insightType: 'cannibalization',
        action,
        affectedUrls: urls,
      }).catch(err => console.warn('[applyCannibalizationFix] recordBaseline failed:', err.message));
    }
  } catch (err) {
    console.warn('[applyCannibalizationFix] recordBaseline import failed:', err.message);
  }

  return {
    success: fixed > 0 || manualRequired > 0,
    results,
    summary: fixed > 0
      ? `Fixed ${fixed}/${proposals.length} cannibalization issues`
      : `${manualRequired} issues require manual action`,
  };
}

/**
 * Internal Link Healing ("Anti-Orphan" Rule).
 * After trashing posts, finds all internal links across the site that pointed
 * to the trashed URLs and updates them to point to the new primary URL.
 * Prevents 301 chains and saves crawl budget.
 */
async function healInternalLinks(site, trashedUrls, primaryUrl) {
  if (!trashedUrls || trashedUrls.length === 0) return;

  for (const trashedUrl of trashedUrls) {
    try {
      // Use both path-based and full-URL matching for thorough coverage
      const trashedPath = new URL(trashedUrl).pathname;
      const primaryPath = new URL(primaryUrl).pathname;

      const result = await searchReplaceLinks(site, trashedPath, primaryPath);
      const updated = result?.updated || 0;
      if (updated > 0) {
        console.log(`[healInternalLinks] Replaced ${updated} internal links: ${trashedPath} → ${primaryPath}`);
      }
    } catch (err) {
      // Non-fatal: the 301 redirect is still in place as a fallback
      console.warn(`[healInternalLinks] Failed to heal links for ${trashedUrl}:`, err.message);
    }
  }
}

// ─── Missing Featured Image Preview / Apply ─────────────────────────

async function getImageContextForSite(site) {
  const fullSite = await prisma.site.findUnique({
    where: { id: site.id },
    select: { id: true, url: true, name: true, wpLocale: true, crawledData: true, seoStrategy: true },
  });
  return fullSite ? gatherImageContext(fullSite) : null;
}

async function previewMissingFeaturedImage(insight, site) {
  const pages = insight.data?.pages || [];
  if (pages.length === 0) {
    return { success: false, proposals: [], error: 'No pages in insight data' };
  }

  const imageContext = await getImageContextForSite(site);
  const proposals = [];

  for (const page of pages) {
    try {
      // Resolve entity to WP post
      const entity = await prisma.siteEntity.findUnique({
        where: { id: page.id },
        select: { title: true, slug: true, url: true, externalId: true, entityType: { select: { slug: true } } },
      });
      if (!entity?.externalId) {
        proposals.push({ pageId: page.id, title: page.title, url: page.url, status: 'skipped', reason: 'No WordPress post ID' });
        continue;
      }

      // Generate a preview image
      const prompt = buildImagePrompt({
        imageContext,
        keyword: entity.title,
        postTitle: entity.title,
        postExcerpt: '',
        imageType: 'featured',
      });

      const images = await generateImage({
        prompt,
        aspectRatio: '16:9',
        operation: 'PREVIEW_FEATURED_IMAGE',
        metadata: { siteId: site.id, entityId: page.id },
        accountId: site.accountId,
        siteId: site.id,
      });

      if (!images.length) {
        proposals.push({ pageId: page.id, title: page.title, url: page.url, status: 'error', reason: 'Image generation failed' });
        continue;
      }

      proposals.push({
        pageId: page.id,
        postId: entity.externalId,
        postType: entity.entityType?.slug || 'post',
        title: entity.title,
        url: page.url,
        status: 'ready',
        previewImage: images[0].base64,
      });
    } catch (err) {
      proposals.push({ pageId: page.id, title: page.title, url: page.url, status: 'error', reason: err.message });
    }
  }

  return { success: proposals.some(p => p.status === 'ready'), proposals };
}

async function regenerateMissingFeaturedImageItem(insight, site, itemIndex) {
  const pages = insight.data?.pages || [];
  const page = pages[itemIndex];
  if (!page) return { success: false, error: 'Page not found at index' };

  const imageContext = await getImageContextForSite(site);
  const entity = await prisma.siteEntity.findUnique({
    where: { id: page.id },
    select: { title: true, externalId: true, entityType: { select: { slug: true } } },
  });
  if (!entity?.externalId) return { success: false, error: 'No WordPress post ID' };

  const prompt = buildImagePrompt({
    imageContext,
    keyword: entity.title,
    postTitle: entity.title,
    postExcerpt: '',
    imageType: 'featured',
  });

  const images = await generateImage({
    prompt,
    aspectRatio: '16:9',
    operation: 'REGENERATE_FEATURED_IMAGE',
    metadata: { siteId: site.id, entityId: page.id },
    accountId: site.accountId,
    siteId: site.id,
  });

  if (!images.length) return { success: false, error: 'Image generation failed' };

  return {
    success: true,
    proposal: {
      pageId: page.id,
      postId: entity.externalId,
      postType: entity.entityType?.slug || 'post',
      title: entity.title,
      url: page.url,
      status: 'ready',
      previewImage: images[0].base64,
    },
  };
}

async function applyMissingFeaturedImageFix(insight, site, proposals) {
  const imageContext = await getImageContextForSite(site);
  const results = [];

  for (const p of proposals) {
    if (p.status !== 'ready' || !p.postId) {
      results.push({ ...p, status: 'skipped', reason: 'Proposal not ready' });
      continue;
    }

    try {
      const imageUrl = await generateAndUploadFeaturedImage({
        site,
        postId: p.postId,
        postType: p.postType || 'post',
        title: p.title,
        focusKeyword: p.title,
        targetAngle: '',
        imageContext,
        existingBase64: p.previewImage || null, // Reuse the preview image if available
      });
      results.push({ ...p, status: 'fixed', imageUrl, previewImage: undefined });
    } catch (err) {
      results.push({ ...p, status: 'error', reason: err.message });
    }
  }

  const fixed = results.filter(r => r.status === 'fixed').length;
  return { success: fixed > 0, results, summary: `Generated featured images for ${fixed}/${proposals.length} posts` };
}

// ─── Insufficient Content Images Preview / Apply ─────────────────────

async function previewInsufficientContentImages(insight, site) {
  const pages = insight.data?.pages || [];
  if (pages.length === 0) {
    return { success: false, proposals: [], error: 'No pages in insight data' };
  }

  const imageContext = await getImageContextForSite(site);
  const proposals = [];

  for (const page of pages) {
    try {
      const entity = await prisma.siteEntity.findUnique({
        where: { id: page.id },
        select: { title: true, slug: true, url: true, externalId: true, entityType: { select: { slug: true } } },
      });
      if (!entity?.externalId) {
        proposals.push({ pageId: page.id, title: page.title, url: page.url, status: 'skipped', reason: 'No WordPress post ID' });
        continue;
      }

      const deficit = (page.recommendedImages || 1) - (page.imageCount || 0);
      const imagesToGenerate = Math.min(deficit, 3);

      // Generate a single preview image to show the user what will be added
      const prompt = buildImagePrompt({
        imageContext,
        keyword: entity.title,
        postTitle: entity.title,
        postExcerpt: `Content image for ${entity.title}`,
        imageType: 'content',
      });

      const images = await generateImage({
        prompt,
        aspectRatio: '16:9',
        operation: 'PREVIEW_CONTENT_IMAGE',
        metadata: { siteId: site.id, entityId: page.id },
        accountId: site.accountId,
        siteId: site.id,
      });

      proposals.push({
        pageId: page.id,
        postId: entity.externalId,
        postType: entity.entityType?.slug || 'post',
        title: entity.title,
        url: page.url,
        wordCount: page.wordCount,
        imageCount: page.imageCount,
        recommendedImages: page.recommendedImages,
        imagesToGenerate,
        status: 'ready',
        previewImage: images.length ? images[0].base64 : null,
      });
    } catch (err) {
      proposals.push({ pageId: page.id, title: page.title, url: page.url, status: 'error', reason: err.message });
    }
  }

  return { success: proposals.some(p => p.status === 'ready'), proposals };
}

async function regenerateInsufficientContentImagesItem(insight, site, itemIndex) {
  const pages = insight.data?.pages || [];
  const page = pages[itemIndex];
  if (!page) return { success: false, error: 'Page not found at index' };

  const imageContext = await getImageContextForSite(site);
  const entity = await prisma.siteEntity.findUnique({
    where: { id: page.id },
    select: { title: true, externalId: true, entityType: { select: { slug: true } } },
  });
  if (!entity?.externalId) return { success: false, error: 'No WordPress post ID' };

  const prompt = buildImagePrompt({
    imageContext,
    keyword: entity.title,
    postTitle: entity.title,
    postExcerpt: `Content image for ${entity.title}`,
    imageType: 'content',
  });

  const images = await generateImage({
    prompt,
    aspectRatio: '16:9',
    operation: 'REGENERATE_CONTENT_IMAGE',
    metadata: { siteId: site.id, entityId: page.id },
    accountId: site.accountId,
    siteId: site.id,
  });

  if (!images.length) return { success: false, error: 'Image generation failed' };

  const deficit = (page.recommendedImages || 1) - (page.imageCount || 0);
  return {
    success: true,
    proposal: {
      pageId: page.id,
      postId: entity.externalId,
      postType: entity.entityType?.slug || 'post',
      title: entity.title,
      url: page.url,
      imagesToGenerate: Math.min(deficit, 3),
      status: 'ready',
      previewImage: images[0].base64,
    },
  };
}

async function applyInsufficientContentImagesFix(insight, site, proposals) {
  const imageContext = await getImageContextForSite(site);
  const results = [];

  for (const p of proposals) {
    if (p.status !== 'ready' || !p.postId) {
      results.push({ ...p, status: 'skipped', reason: 'Proposal not ready' });
      continue;
    }

    try {
      await generateAndInsertContentImages({
        site,
        postId: p.postId,
        postType: p.postType || 'post',
        title: p.title,
        focusKeyword: p.title,
        targetAngle: '',
        imageContext,
        maxImages: p.imagesToGenerate || 2,
      });
      results.push({ ...p, status: 'fixed' });
    } catch (err) {
      results.push({ ...p, status: 'error', reason: err.message });
    }
  }

  const fixed = results.filter(r => r.status === 'fixed').length;
  return { success: fixed > 0, results, summary: `Inserted content images for ${fixed}/${proposals.length} posts` };
}

// ─── Image Generation Helpers ────────────────────────────────────────

/**
 * Generate a unique featured image for differentiated content and upload to WordPress.
 */
async function generateAndUploadFeaturedImage({ site, postId, postType = 'post', title, focusKeyword, targetAngle, imageContext, existingBase64 }) {
  let base64;

  if (existingBase64) {
    // Reuse the already-generated preview image
    console.log(`[generateAndUploadFeaturedImage] Reusing preview image for post ${postId}`);
    base64 = existingBase64;
  } else {
    // Build image prompt based on the new focus/angle
    const prompt = buildImagePrompt({
      imageContext,
      keyword: focusKeyword,
      postTitle: title,
      postExcerpt: targetAngle || `Content focused on ${focusKeyword}`,
      imageType: 'featured',
    });

    console.log(`[generateAndUploadFeaturedImage] Generating image for post ${postId}...`);

    // Generate image using Nano Banana (gemini-3.1-pro-preview)
    const images = await generateImage({
      prompt,
      aspectRatio: '16:9',
      operation: 'CANNIBALIZATION_FIX_IMAGE',
      metadata: { siteId: site.id, postId, focusKeyword },
      accountId: site.accountId,
      siteId: site.id,
    });

    if (!images.length) {
      throw new Error('No image generated');
    }
    base64 = images[0].base64;
  }

  // Generate alt text based on the focus keyword and target angle
  const altText = await generateImageAltText({ title, focusKeyword, targetAngle, locale: site.wpLocale, accountId: site.accountId, siteId: site.id });

  // Upload to WordPress
  const filename = `cannibalization-fix-${postId}-${Date.now()}.png`;
  const uploadResult = await uploadMediaFromBase64(site, base64, filename, {
    title: title,
    alt: altText,
    caption: '',
    postId: postId,
  });

  if (!uploadResult?.id) {
    throw new Error('Failed to upload image to WordPress');
  }

  console.log(`[generateAndUploadFeaturedImage] Uploaded media ${uploadResult.id} for post ${postId}, setting as featured image...`);

  // Set as featured image - send as 'featured_image' (numeric ID), which the plugin template handles via set_featured_image()
  const updateResult = await updatePost(site, postType, postId, {
    featured_image: uploadResult.id,
  });

  // Log the full update response for debugging
  console.log(`[generateAndUploadFeaturedImage] PUT response for post ${postId}:`, JSON.stringify(updateResult));

  // Check the update response - plugin returns featuredImageId in format_post
  const responsePost = updateResult?.post || updateResult;
  const responseThumbId = responsePost?.featuredImageId ?? responsePost?.featured_image_id ?? null;
  if (responseThumbId != null && responseThumbId !== uploadResult.id) {
    throw new Error(`Featured image mismatch in response: expected ${uploadResult.id}, got ${responseThumbId}`);
  }

  // Verify by re-fetching the post to confirm the thumbnail was actually persisted
  try {
    const verifyPost = await getPost(site, postType, postId);
    const actualThumbId = verifyPost?.featuredImageId ?? verifyPost?.featured_image_id ?? null;
    console.log(`[generateAndUploadFeaturedImage] GET verify for post ${postId}: featuredImageId=${actualThumbId}, featured_image=${verifyPost?.featured_image || verifyPost?.featuredImage || 'none'}`);
    if (!actualThumbId || actualThumbId !== uploadResult.id) {
      console.error(`[generateAndUploadFeaturedImage] VERIFICATION FAILED: post ${postId} has featuredImageId=${actualThumbId}, expected ${uploadResult.id}`);
      throw new Error(`Featured image verification failed: thumbnail not set on post (expected ${uploadResult.id}, found ${actualThumbId || 'none'})`);
    }
    console.log(`[generateAndUploadFeaturedImage] VERIFIED: post ${postId} now has featured image ${actualThumbId}`);
  } catch (verifyErr) {
    if (verifyErr.message.includes('verification failed') || verifyErr.message.includes('Featured image')) {
      throw verifyErr; // Re-throw our own verification errors
    }
    // If getPost fails for network reasons, log but don't block (the update already succeeded per PHP)
    console.warn(`[generateAndUploadFeaturedImage] Could not verify featured image for post ${postId}:`, verifyErr.message);
  }

  return uploadResult.source_url || uploadResult.url;
}

/**
 * Generate a descriptive alt text for the featured image.
 */
async function generateImageAltText({ title, focusKeyword, targetAngle, locale, accountId, siteId }) {
  const langInstruction = locale?.startsWith('he') ? 'Write in Hebrew.' : 'Write in English.';
  
  try {
    const response = await generateTextResponse({
      system: `You are an SEO expert. Generate a brief, descriptive alt text for an image. ${langInstruction}
Rules:
- Max 125 characters
- Include the main keyword naturally
- Describe what the image likely shows
- Be specific and useful for accessibility
- No quotes or special formatting`,
      prompt: `Generate alt text for a featured image.
Title: ${title}
Focus keyword: ${focusKeyword}
Content angle: ${targetAngle || 'General'}`,
      maxTokens: 100,
      temperature: 0.3,
      operation: 'GENERATE_ALT_TEXT',
      metadata: { focusKeyword },
      accountId,
      siteId,
    });

    return response?.trim() || `${focusKeyword} - ${title}`;
  } catch {
    // Fallback to simple alt text
    return `${focusKeyword} - ${title}`.slice(0, 125);
  }
}

/**
 * Generate content images and insert them into post content.
 * Generates up to maxImages (default 3), each costing 2 Ai-GCoins.
 */
async function generateAndInsertContentImages({ site, postId, postType = 'post', title, focusKeyword, targetAngle, imageContext, maxImages = 3 }) {
  console.log(`[generateAndInsertContentImages] Generating ${maxImages} content images for post ${postId}...`);

  // Get the current post to access its content
  const post = await getPost(site, postType, postId).catch(() => null);
  if (!post) {
    throw new Error(`Post ${postId} not found`);
  }

  let content = post.content?.rendered || post.content || '';
  
  // Strip HTML tags to analyze text content
  const textContent = content.replace(/<[^>]*>/g, ' ').trim();
  if (!textContent) {
    console.log(`[generateAndInsertContentImages] Post ${postId} has no text content, skipping content images`);
    return;
  }

  // Generate images with different angles/topics
  const imagePrompts = [];
  const angles = [
    targetAngle || `Main concept of ${focusKeyword}`,
    `Practical application of ${focusKeyword}`,
    `Benefits and results of ${focusKeyword}`,
  ];

  for (let i = 0; i < Math.min(maxImages, 3); i++) {
    const prompt = buildImagePrompt({
      imageContext,
      keyword: focusKeyword,
      postTitle: title,
      postExcerpt: angles[i],
      imageType: 'content',
    });
    imagePrompts.push({ prompt, angle: angles[i], index: i });
  }

  const generatedImages = [];

  // Generate all images
  for (const { prompt, angle, index } of imagePrompts) {
    try {
      const images = await generateImage({
        prompt,
        aspectRatio: '16:9',
        operation: 'CANNIBALIZATION_CONTENT_IMAGE',
        metadata: { siteId: site.id, postId, focusKeyword, imageIndex: index },
        accountId: site.accountId,
        siteId: site.id,
      });

      if (images.length > 0) {
        // Generate alt text for this content image
        const altText = await generateImageAltText({
          title: `${title} - ${angle}`,
          focusKeyword,
          targetAngle: angle,
          locale: site.wpLocale,
          accountId: site.accountId,
          siteId: site.id,
        });

        // Upload to WordPress
        const filename = `content-image-${postId}-${index}-${Date.now()}.png`;
        const uploadResult = await uploadMediaFromBase64(site, images[0].base64, filename, {
          title: `${title} - Content Image ${index + 1}`,
          alt: altText,
          caption: '',
          postId: postId,
        });

        if (uploadResult?.id) {
          generatedImages.push({
            url: uploadResult.source_url || uploadResult.url,
            alt: altText,
            index,
          });
          console.log(`[generateAndInsertContentImages] Generated content image ${index + 1}: ${uploadResult.source_url}`);
        }
      }
    } catch (err) {
      console.warn(`[generateAndInsertContentImages] Failed to generate content image ${index + 1}:`, err.message);
    }
  }

  if (generatedImages.length === 0) {
    console.log(`[generateAndInsertContentImages] No content images generated for post ${postId}`);
    return;
  }

  // Insert images into content
  // Find good insertion points (after paragraphs, before headings)
  const paragraphs = content.match(/<\/p>/gi) || [];
  const insertionPoints = [];
  
  // Calculate even distribution of images throughout content
  const totalParagraphs = paragraphs.length;
  if (totalParagraphs > 0) {
    const step = Math.floor(totalParagraphs / (generatedImages.length + 1));
    for (let i = 0; i < generatedImages.length; i++) {
      insertionPoints.push(Math.min((i + 1) * step, totalParagraphs - 1));
    }
  }

  // Insert images at calculated points (work backwards to preserve indices)
  let paragraphCount = 0;
  let imageInsertIndex = 0;
  let newContent = '';
  let lastIndex = 0;

  // Regex to find paragraph endings
  const regex = /<\/p>/gi;
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    paragraphCount++;
    
    if (insertionPoints.includes(paragraphCount - 1) && imageInsertIndex < generatedImages.length) {
      const img = generatedImages[imageInsertIndex];
      const insertPos = match.index + match[0].length;
      
      // Add content up to this point
      newContent += content.slice(lastIndex, insertPos);
      
      // Add the image
      newContent += `\n<figure class="wp-block-image size-large"><img src="${img.url}" alt="${img.alt}" class="wp-image-auto-generated"/></figure>\n`;
      
      lastIndex = insertPos;
      imageInsertIndex++;
    }
  }

  // Add remaining content
  newContent += content.slice(lastIndex);

  // If we couldn't insert images naturally, append them at the end before the last paragraph
  if (imageInsertIndex < generatedImages.length) {
    for (let i = imageInsertIndex; i < generatedImages.length; i++) {
      const img = generatedImages[i];
      newContent += `\n<figure class="wp-block-image size-large"><img src="${img.url}" alt="${img.alt}" class="wp-image-auto-generated"/></figure>\n`;
    }
  }

  // Update post content
  if (newContent !== content) {
    await updatePost(site, postType, postId, { content: newContent });
    console.log(`[generateAndInsertContentImages] Updated post ${postId} with ${generatedImages.length} content images`);
  }
}

// ─── AI Generation Helpers ───────────────────────────────────────────

async function generateSeoForPage({ title, content, siteName, locale, accountId, siteId, userId = null }) {
  const langInstruction = locale?.startsWith('he') ? 'Write in Hebrew.' : `Write in the language matching locale "${locale}".`;

  const currentYear = new Date().getFullYear();
  const result = await generateStructuredResponse({
    system: `You are an SEO expert. Generate an optimized SEO title and meta description for a webpage. ${langInstruction}
Rules:
- Title: 50-60 characters, include main topic, compelling
- Description: 140-160 characters, actionable, include key value proposition
- Match the tone and language of the existing content
- Do not use clickbait or misleading text
- If you include a year, use the current year (${currentYear}) unless the content specifically refers to a different year`,
    prompt: `Site: ${siteName}
Page title: ${title}
Content excerpt: ${content}

Generate an SEO title and meta description for this page.`,
    schema: SeoGenerationSchema,
    temperature: 0.5,
    operation: 'AGENT_FIX_SEO',
    metadata: { fixType: 'missingSeo', siteName },
    accountId,
    siteId,
    userId,
  });
  if (result) {
    result.title = replaceStaleYears(result.title);
    result.description = replaceStaleYears(result.description);
  }
  return result;
}

async function generateSeoForKeyword({ title, content, keyword, position, currentSeoTitle, currentSeoDesc, siteName, locale, accountId, siteId, userId = null }) {
  const langInstruction = locale?.startsWith('he') ? 'Write in Hebrew.' : `Write in the language matching locale "${locale}".`;

  const currentYear = new Date().getFullYear();
  const result = await generateStructuredResponse({
    system: `You are an SEO expert. Optimize the SEO title and meta description to better target a specific keyword. ${langInstruction}
Rules:
- Title: 50-60 characters, naturally include the target keyword
- Description: 140-160 characters, naturally include the target keyword, compelling call to action
- If the current SEO is already good, improve it slightly rather than rewriting completely
- Match the language and tone of the existing content
- Do not use clickbait or misleading text
- If you include a year, use the current year (${currentYear}) unless the content specifically refers to a different year`,
    prompt: `Site: ${siteName}
Page title: ${title}
Target keyword: "${keyword}" (currently ranking at position ${position})
Current SEO title: ${currentSeoTitle || '(none)'}
Current SEO description: ${currentSeoDesc || '(none)'}
Content excerpt: ${content}

Generate an optimized SEO title and meta description targeting the keyword "${keyword}".`,
    schema: SeoGenerationSchema,
    temperature: 0.5,
    operation: 'AGENT_FIX_SEO',
    metadata: { fixType: 'keywordStrikeZone', keyword, siteName },
    accountId,
    siteId,
    userId,
  });
  if (result) {
    result.title = replaceStaleYears(result.title);
    result.description = replaceStaleYears(result.description);
  }
  return result;
}

async function generateSeoForCtrGap({ title, content, position, actualCtr, expectedCtr, currentSeoTitle, currentSeoDesc, siteName, locale, accountId, siteId, userId = null }) {
  const langInstruction = locale?.startsWith('he') ? 'Write in Hebrew.' : `Write in the language matching locale "${locale}".`;

  const currentYear = new Date().getFullYear();
  const result = await generateStructuredResponse({
    system: `You are an SEO expert. Improve SEO title and meta description to increase click-through rate for an already-ranking page. ${langInstruction}
Rules:
- Title: 50-60 characters, clear benefit, strong but accurate intent match
- Description: 140-160 characters, specific value proposition and soft call to action
- Preserve topical relevance to the existing page; do not change intent
- Improve CTR appeal without clickbait or misleading claims
- If you include a year, use the current year (${currentYear}) unless the content specifically refers to a different year`,
    prompt: `Site: ${siteName}
Page title: ${title}
Current ranking position: ${position}
Actual CTR: ${actualCtr}%
Expected CTR: ${expectedCtr}%
Current SEO title: ${currentSeoTitle || '(none)'}
Current SEO description: ${currentSeoDesc || '(none)'}
Content excerpt: ${content}

Generate an improved SEO title and meta description optimized for higher CTR at this ranking position.`,
    schema: SeoGenerationSchema,
    temperature: 0.6,
    operation: 'AGENT_FIX_SEO',
    metadata: { fixType: 'lowCtrForPosition', siteName },
    accountId,
    siteId,
    userId,
  });
  if (result) {
    result.title = replaceStaleYears(result.title);
    result.description = replaceStaleYears(result.description);
  }
  return result;
}

// ─── Generate Merged Content ─────────────────────────────────────────

const MergedArticleSchema = z.object({
  title: z.string().describe('The merged article title'),
  html: z.string().describe('The full merged article content in HTML format'),
  seoTitle: z.string().describe('SEO meta title, ideally under 60 characters'),
  seoDescription: z.string().describe('SEO meta description, ideally under 155 characters'),
  excerpt: z.string().describe('A 1-2 sentence summary of the article'),
  contentImageDescriptions: z.array(z.string()).optional().describe('Detailed 15-30 word descriptions for each content image, describing specific visual scenes relevant to each section of the article'),
});

// ─── Generate Differentiated Content (Phase 5b) ──────────────────────
// When the AI verifier picks DIFFERENTIATE, we don't just rewrite the meta
// - we rewrite the body of the weaker page so it actually targets the new
// intent. Otherwise the page still cannibalizes in spirit (same body) even
// though Yoast says "different focus keyword."

const DifferentiatedArticleSchema = z.object({
  html: z.string().describe('Full rewritten body content in HTML. New H2 structure per the rewrite plan, no <h1>.'),
  excerpt: z.string().describe('1-2 sentence summary of the rewritten page.'),
});

/**
 * Rewrite a single page's body so it serves a clearly distinct intent from
 * the cannibalizing peer. Driven by the AI verifier's contentRewritePlan.
 *
 * The model receives:
 *   - the page's CURRENT body (so it preserves any unique value already there)
 *   - the URL of the peer page it's differentiating from (so it can avoid
 *     overlap with that page's known angle - title is enough to convey intent)
 *   - the rewrite plan (the editorial brief from the verifier)
 *   - the new SEO target (title, focus keyword, target angle)
 *
 * Returns { html, excerpt }. Caller is responsible for calling updatePost.
 */
export async function generateDifferentiatedContent({ site, currentBodyHtml, currentTitle, peerTitle, peerUrl, rewritePlan, newTitle, newFocusKeyword, targetAngle, articleType = 'SEO', wordCount = 1500 }) {
  const isHebrew = site.wpLocale?.startsWith('he');
  const langInstruction = isHebrew
    ? 'IMPORTANT: Write ALL content in Hebrew (עברית). The article must be entirely in Hebrew.'
    : 'Write in the same language as the source content.';

  const currentBodyText = stripHtml(currentBodyHtml || '');
  const currentYear = new Date().getFullYear();

  const system = `You are an expert SEO copywriter executing a content differentiation under strict editorial direction.
${langInstruction}

Article type: ${articleType}
Target word count: ${wordCount} words
Current year: ${currentYear}

Your role:
- A page on this site is currently cannibalizing another page for the same query intent
- Your job is to rewrite THIS page so it clearly targets a DIFFERENT, well-defined intent
- The peer page (which you should NOT overlap with) is titled: "${peerTitle}" at ${peerUrl}
- You will receive an editorial rewrite plan and the page's current body
- Follow the rewrite plan precisely - it specifies the new H2 structure, sections to add/remove, and the unique angle

Rules:
- Preserve genuinely unique value from the current body when it fits the new intent; cut anything that overlaps with the peer page
- Use proper HTML formatting (h2, h3, p, ul, ol, strong, em). Do NOT include any <h1>.
- If a year appears, update to ${currentYear} unless it's a historical reference
- Do not insert image placeholders or HTML comments
- Naturally incorporate the new focus keyword
- Maintain a clear, reader-first tone`;

  const user = `## TARGET FOR THIS PAGE
- New title: ${newTitle}
- New focus keyword: ${newFocusKeyword}
- Target angle: ${targetAngle || 'as specified in the rewrite plan'}

## EDITORIAL REWRITE PLAN (follow precisely)
${rewritePlan}

## CURRENT PAGE ("${currentTitle}")
${currentBodyText}

Rewrite this page into a ~${wordCount}-word article that fully implements the rewrite plan and clearly diverges from the peer page "${peerTitle}".`;

  return generateStructuredResponse({
    system,
    prompt: user,
    schema: DifferentiatedArticleSchema,
    temperature: 0.5,
    operation: 'AGENT_DIFFERENTIATE_CONTENT',
    metadata: { newFocusKeyword, peerUrl },
    accountId: site.accountId,
    siteId: site.id,
  });
}

/**
 * Generate a single AI image using Nano Banana Pro, with fallback to Picsum
 */
async function generateSingleImage({ prompt, keyword, aspectRatio = '16:9', operation = 'AGENT_MERGE_IMAGE', accountId, siteId }) {
  try {
    const images = await generateImage({
      prompt,
      aspectRatio,
      n: 1,
      operation,
      metadata: { keyword },
      accountId,
      siteId,
    });

    if (images && images.length > 0) {
      return {
        base64: images[0].base64,
        mimeType: images[0].mimeType,
        isAI: true,
      };
    }
    throw new Error('No image generated');
  } catch (error) {
    console.warn('[generateSingleImage] AI generation failed, using Picsum fallback:', error.message);
    // Fallback to Picsum (random seed based on keyword)
    const seed = keyword?.replace(/[^a-z0-9]/gi, '') || Date.now();
    const width = aspectRatio === '16:9' ? 1200 : 800;
    const height = aspectRatio === '16:9' ? 675 : 800;
    return {
      url: `https://picsum.photos/seed/${seed}/${width}/${height}`,
      isAI: false,
    };
  }
}

/**
 * Insert content images into HTML at strategic positions
 */
function insertContentImages(html, images) {
  if (!images || images.length === 0) return html;

  const createImageHtml = (img) => 
    `<figure class="content-image"><img src="${img.url}" alt="${img.alt}" loading="lazy" /><figcaption>${img.alt}</figcaption></figure>`;

  let processedHtml = html;
  const imageCount = images.length;

  // Find all paragraph end positions and h2 start positions
  const paragraphMatches = [...processedHtml.matchAll(/<\/p>/gi)];
  const h2Matches = [...processedHtml.matchAll(/<h2[^>]*>/gi)];

  // Section-aware positioning helpers
  const firstH2Pos = h2Matches.length > 0 ? h2Matches[0].index : null;

  // Intro paragraphs = all </p> tags that appear BEFORE the first <h2>
  const introParas = firstH2Pos !== null
    ? paragraphMatches.filter(m => m.index < firstH2Pos)
    : paragraphMatches.slice(0, 1);

  // "After intro" = after the LAST paragraph before the first h2
  const afterIntroPos = introParas.length > 0
    ? introParas[introParas.length - 1].index + introParas[introParas.length - 1][0].length
    : (paragraphMatches.length > 0 ? paragraphMatches[0].index + paragraphMatches[0][0].length : null);

  // "First section paragraph" = first </p> AFTER the first <h2>
  const firstSectionPara = firstH2Pos !== null
    ? paragraphMatches.find(m => m.index > firstH2Pos)
    : null;
  const afterFirstSectionParaPos = firstSectionPara
    ? firstSectionPara.index + firstSectionPara[0].length
    : (paragraphMatches.length > 1 ? paragraphMatches[1].index + paragraphMatches[1][0].length : null);

  // Build insertion points array
  const insertions = [];

  if (imageCount === 1) {
    if (afterIntroPos) insertions.push({ position: afterIntroPos, imgIndex: 0 });
  } else if (imageCount === 2) {
    if (afterIntroPos) insertions.push({ position: afterIntroPos, imgIndex: 0 });
    if (afterFirstSectionParaPos) insertions.push({ position: afterFirstSectionParaPos, imgIndex: 1 });
  } else if (imageCount === 3) {
    if (afterIntroPos) insertions.push({ position: afterIntroPos, imgIndex: 0 });
    if (afterFirstSectionParaPos) insertions.push({ position: afterFirstSectionParaPos, imgIndex: 1 });
    if (h2Matches.length > 0) {
      const lastH2 = h2Matches[h2Matches.length - 1];
      insertions.push({ position: lastH2.index, imgIndex: 2 });
    }
  } else if (imageCount >= 4) {
    if (afterIntroPos) insertions.push({ position: afterIntroPos, imgIndex: 0 });
    let imgIdx = 1;
    for (let i = 1; i < h2Matches.length && imgIdx < imageCount; i++) {
      insertions.push({ position: h2Matches[i].index, imgIndex: imgIdx });
      imgIdx++;
    }
  }

  // Sort insertions by position descending to insert from end to start (preserve positions)
  insertions.sort((a, b) => b.position - a.position);

  // Apply insertions
  for (const { position, imgIndex } of insertions) {
    const imgHtml = createImageHtml(images[imgIndex]);
    processedHtml = processedHtml.slice(0, position) + '\n' + imgHtml + processedHtml.slice(position);
  }

  // Clean up: ensure images are only between block-level elements
  processedHtml = processedHtml.replace(
    /(<p[^>]*>)([\s\S]*?)(<figure[\s\S]*?<\/figure>)/gi,
    (match, openP, before, figure) => `${openP}${before}</p>\n${figure}\n<p>`
  );
  processedHtml = processedHtml.replace(/<p>\s*<\/p>/gi, '');

  return processedHtml;
}

/**
 * Generate merged content from two cannibalizing pages
 */
export async function generateMergedContent(insight, site, proposal, options = {}) {
  try {
    const { 
      wordCount = 2000, 
      articleType = 'SEO', 
      mergeInstructions = '',
      generateFeaturedImages = false,
      contentImagesCount = 0,
      featuredImagePrompt = '',
      contentImagesPrompt = '',
    } = options;
    const isHebrew = site.wpLocale?.startsWith('he');
    const langInstruction = isHebrew 
      ? 'IMPORTANT: Write ALL content in Hebrew (עברית). The article must be entirely in Hebrew.'
      : 'Write in the same language as the source content.';

    // Get content from all pages (full content, no truncation)
    const primaryPostId = proposal.recommendation?.primaryPostId || proposal.pages?.[0]?.postId || proposal.postIdA;
    // Find all secondary pages
    const allPages = proposal.pages || [
      { postId: proposal.postIdA, title: proposal.titleA, postType: proposal.postTypeA || 'post' },
      { postId: proposal.postIdB, title: proposal.titleB, postType: proposal.postTypeB || 'post' },
    ].filter(pg => pg.postId);
    const secondaryPages = allPages.filter(pg => pg.postId !== primaryPostId);

    // Fetch content for primary and all secondary pages
    const primaryPage = allPages.find(pg => pg.postId === primaryPostId);
    const primaryPostType = primaryPage?.postType || proposal.postTypeA || 'post';
    const primaryPost = await getPost(site, primaryPostType, primaryPostId).catch(() => null);
    const primaryContent = primaryPost?.content?.rendered || '';
    const primaryContentText = stripHtml(primaryContent);
    const primaryTitle = primaryPost?.title?.rendered || primaryPage?.title || proposal.titleA || '';

    const secondaryPostsData = await Promise.all(
      secondaryPages.map(async (pg) => {
        const postType = pg.postType || 'post';
        const post = await getPost(site, postType, pg.postId).catch(() => null);
        return {
          postId: pg.postId,
          title: post?.title?.rendered || pg.title || '',
          content: stripHtml(post?.content?.rendered || ''),
        };
      })
    );

    const mergedPageChanges = proposal.recommendation?.mergedPageChanges || {};

    // Build secondary posts sections for the prompt
    const secondaryPostsSections = secondaryPostsData.map((sp, i) => {
      const label = secondaryPostsData.length === 1 ? 'SECONDARY POST' : `SECONDARY POST ${i + 1}`;
      return `## ${label} ("${sp.title}")\n${sp.content}`;
    }).join('\n\n');

    // Generate merged content
    const currentYear = new Date().getFullYear();
    const mergeSystemPrompt = `You are an expert SEO copywriter executing a content merge under strict editorial direction.
${langInstruction}

Article type: ${articleType}
Target word count: ${wordCount} words
Current year: ${currentYear}

Your role:
- You are receiving the full content of a Primary Post and ${secondaryPostsData.length === 1 ? 'a Secondary Post' : `${secondaryPostsData.length} Secondary Posts`}
- You are also receiving exact Merge Instructions written by the Chief SEO Editor
- Your task is to rewrite the Primary Post, incorporating the valuable elements from ${secondaryPostsData.length === 1 ? 'the Secondary Post' : 'all Secondary Posts'}, STRICTLY following the Merge Instructions
- The Merge Instructions are your primary brief - follow them precisely

Rules:
- If a year appears in the content, update it to ${currentYear} unless it refers to a specific historical event or date
- Use proper HTML formatting (h2, h3, p, ul, ol, strong, em tags)
- Do NOT include h1 tags - the title is separate
- Naturally incorporate the focus keyword throughout
- Write engaging, valuable content that serves the reader's intent
- Maintain a consistent tone and flow throughout
- Do not use <!-- comments in the HTML
- Images will be added separately, do not include image placeholders
${contentImagesCount > 0 ? `- Provide ${contentImagesCount} contentImageDescriptions: detailed 15-30 word descriptions for each content image, describing specific visual scenes relevant to the surrounding section. Be specific about what should appear in the image.` : ''}`;

    const mergeUserPrompt = `## TARGET SEO
- Title: ${mergedPageChanges.newTitle || primaryTitle}
- Focus keyword: ${mergedPageChanges.newFocusKeyword || ''}
- Target angle: ${mergedPageChanges.targetAngle || ''}

## MERGE INSTRUCTIONS (from Chief SEO Editor - follow these strictly)
${mergeInstructions || `Combine all ${secondaryPostsData.length + 1} articles into a single comprehensive piece, preserving all unique information from each.`}

## PRIMARY POST ("${primaryTitle}")
${primaryContentText}

${secondaryPostsSections}

Rewrite the Primary Post into a ${wordCount}-word merged article, incorporating the valuable content from ${secondaryPostsData.length === 1 ? 'the Secondary Post' : `all ${secondaryPostsData.length} Secondary Posts`} according to the Merge Instructions above.`;

    let result;
    try {
      result = await generateStructuredResponse({
        system: mergeSystemPrompt,
        prompt: mergeUserPrompt,
        schema: MergedArticleSchema,
        temperature: 0.5,
        operation: 'AGENT_MERGE_CONTENT',
        metadata: { articleType, wordCount, primaryPostId, secondaryPostIds: secondaryPages.map(p => p.postId) },
        accountId: site.accountId,
        siteId: site.id,
      });
    } catch (structuredError) {
      // If structured generation fails (e.g. validation error), try to extract from raw text
      console.warn('[generateMergedContent] Structured generation failed, attempting text fallback:', structuredError.message);
      const rawText = structuredError.text || structuredError.cause?.text;
      if (rawText) {
        try {
          // Try to parse the raw JSON from the AI response
          const jsonMatch = rawText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            result = JSON.parse(jsonMatch[0]);
            console.log('[generateMergedContent] Successfully recovered content from text fallback');
          }
        } catch (parseErr) {
          // JSON parsing failed too
        }
      }
      if (!result) {
        throw structuredError;
      }
    }

    // Post-process: truncate SEO fields to safe lengths (AI may exceed limits)
    if (result.seoTitle && result.seoTitle.length > 60) {
      result.seoTitle = result.seoTitle.slice(0, 57) + '...';
    }
    if (result.seoDescription && result.seoDescription.length > 155) {
      result.seoDescription = result.seoDescription.slice(0, 152) + '...';
    }
    // Post-process: replace stale years with current year
    result.title = replaceStaleYears(result.title);
    result.seoTitle = replaceStaleYears(result.seoTitle);
    result.seoDescription = replaceStaleYears(result.seoDescription);
    result.excerpt = replaceStaleYears(result.excerpt);
    result.html = replaceStaleYears(result.html);

    let processedHtml = result.html;
    let featuredImage = null;
    let contentImages = [];

    // Calculate actual word count
    const actualWordCount = stripHtml(processedHtml).split(/\s+/).filter(Boolean).length;

    // Generate images if requested
    if (generateFeaturedImages || contentImagesCount > 0) {
      try {
        // Gather image context from the site
        const imageContext = await gatherImageContext(site);
        const focusKeyword = mergedPageChanges.newFocusKeyword || '';
        const postTitle = result.title || mergedPageChanges.newTitle || '';
        const postExcerpt = result.excerpt || '';

        // Generate featured image
        if (generateFeaturedImages) {
          try {
            const featuredPrompt = buildImagePrompt({
              imageContext,
              keyword: focusKeyword,
              postTitle,
              postExcerpt,
              userPrompt: featuredImagePrompt,
              imageType: 'featured',
            });

            const featuredResult = await generateSingleImage({
              prompt: featuredPrompt,
              keyword: focusKeyword,
              aspectRatio: '16:9',
              operation: 'AGENT_MERGE_FEATURED_IMAGE',
              accountId: site.accountId,
              siteId: site.id,
            });

            if (featuredResult.base64) {
              // Upload to WordPress
              const uploadResult = await uploadMediaFromBase64(site, featuredResult.base64, `merged-featured-${Date.now()}.png`, {
                mimeType: featuredResult.mimeType || 'image/png',
                alt: postTitle,
              });
              featuredImage = {
                url: uploadResult.source_url || uploadResult.url,
                alt: postTitle,
                isAI: true,
              };
            } else if (featuredResult.url) {
              featuredImage = {
                url: featuredResult.url,
                alt: postTitle,
                isAI: false,
              };
            }
          } catch (featuredErr) {
            console.warn('[generateMergedContent] Featured image generation failed:', featuredErr.message);
          }
        }

        // Generate content images
        if (contentImagesCount > 0) {
          const h2Matches = [...processedHtml.matchAll(/<h2[^>]*>/gi)];
          const imageDescriptions = result.contentImageDescriptions || [];

          for (let i = 0; i < contentImagesCount; i++) {
            try {
              // Extract rich nearby content (full section HTML between H2 headings, up to 800 chars)
              let nearbyContent = '';
              if (h2Matches.length > 0) {
                const h2Idx = Math.min(i, h2Matches.length - 1);
                const h2Start = h2Matches[h2Idx].index;
                const nextH2Start = h2Idx + 1 < h2Matches.length ? h2Matches[h2Idx + 1].index : processedHtml.length;
                nearbyContent = processedHtml.slice(h2Start, Math.min(h2Start + 800, nextH2Start));
              } else {
                // No H2s - use first 800 chars of the HTML
                nearbyContent = processedHtml.slice(0, 800);
              }
              const imageDescription = imageDescriptions[i] || '';
              const contentPrompt = buildImagePrompt({
                imageContext,
                keyword: focusKeyword,
                postTitle,
                postExcerpt,
                userPrompt: contentImagesPrompt,
                imageType: 'content',
                nearbyContent,
                imageDescription,
              });

              const contentResult = await generateSingleImage({
                prompt: contentPrompt,
                keyword: `${focusKeyword}-content-${i}`,
                aspectRatio: '16:9',
                operation: 'AGENT_MERGE_CONTENT_IMAGE',
                accountId: site.accountId,
                siteId: site.id,
              });

              if (contentResult.base64) {
                // Upload to WordPress
                const imgAlt = imageDescription || nearbyContent || `Content image ${i + 1}`;
                const uploadResult = await uploadMediaFromBase64(site, contentResult.base64, `merged-content-${Date.now()}-${i}.png`, {
                  mimeType: contentResult.mimeType || 'image/png',
                  alt: imgAlt,
                });
                contentImages.push({
                  url: uploadResult.source_url || uploadResult.url,
                  alt: imgAlt,
                  isAI: true,
                });
              } else if (contentResult.url) {
                contentImages.push({
                  url: contentResult.url,
                  alt: imageDescription || nearbyContent || `Content image ${i + 1}`,
                  isAI: false,
                });
              }
            } catch (contentErr) {
              console.warn(`[generateMergedContent] Content image ${i} generation failed:`, contentErr.message);
            }
          }

          // Insert content images into HTML
          if (contentImages.length > 0) {
            processedHtml = insertContentImages(processedHtml, contentImages);
          }
        }
      } catch (imageErr) {
        console.warn('[generateMergedContent] Image generation setup failed:', imageErr.message);
      }
    }

    return {
      success: true,
      post: {
        title: result.title,
        html: processedHtml,
        seoTitle: result.seoTitle || mergedPageChanges.newTitle,
        seoDescription: result.seoDescription || mergedPageChanges.newDescription,
        excerpt: result.excerpt,
        focusKeyword: mergedPageChanges.newFocusKeyword,
        featuredImage: featuredImage?.url || null,
        featuredImageAlt: featuredImage?.alt || null,
        featuredImageIsAI: featuredImage?.isAI || false,
        contentImages,
        wordCount: actualWordCount,
      },
    };
  } catch (error) {
    console.error('[generateMergedContent] Error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Apply the generated merged content to WordPress
 */
export async function applyMergedContent(insight, site, proposal, generatedPost, options = {}) {
  const results = [];
  const actions = []; // Track all actions performed for user feedback
  
  try {
    const { generateFeaturedImages = false, googleIntegration } = options;
    const primaryPostId = proposal.recommendation?.primaryPostId || proposal.postIdA;

    // Build all pages list from proposal.pages (N-page) or legacy A/B fields
    const allPages = proposal.pages || [
      { postId: proposal.postIdA, url: proposal.urlA, postType: proposal.postTypeA || 'post' },
      { postId: proposal.postIdB, url: proposal.urlB, postType: proposal.postTypeB || 'post' },
    ].filter(pg => pg.postId);
    const primaryPage = allPages.find(pg => pg.postId === primaryPostId) || allPages[0];
    const secondaryPagesAll = allPages.filter(pg => pg.postId !== primaryPostId);
    const primaryUrl = primaryPage?.url || proposal.urlA;
    const primaryPostType = primaryPage?.postType || 'post';
    const oldSeo = primaryPage?.currentSeo || proposal.currentA || {};

    // 1. Update the primary post with merged content
    await updatePost(site, primaryPostType, primaryPostId, {
      title: generatedPost.title,
      content: generatedPost.html,
      excerpt: generatedPost.excerpt,
    });
    actions.push({ type: 'post_updated', status: 'success', detail: primaryUrl, meta: { url: primaryUrl, title: generatedPost.title } });

    // 2. Update SEO data
    await updateSeoData(site, primaryPostId, {
      title: generatedPost.seoTitle,
      description: generatedPost.seoDescription,
      focusKeyword: generatedPost.focusKeyword,
    });
    actions.push({ type: 'seo_updated', status: 'success', detail: generatedPost.seoTitle, meta: {
      oldTitle: oldSeo.title || '',
      newTitle: generatedPost.seoTitle || '',
      oldDescription: oldSeo.description || '',
      newDescription: generatedPost.seoDescription || '',
    } });

    // 3. Generate featured image if requested
    if (generateFeaturedImages) {
      try {
        const imageContext = await gatherImageContext(site);
        if (imageContext) {
          const imageUrl = await generateAndUploadFeaturedImage({
            site,
            postId: primaryPostId,
            postType: primaryPostType,
            title: generatedPost.title,
            focusKeyword: generatedPost.focusKeyword,
            targetAngle: proposal.recommendation?.mergedPageChanges?.targetAngle,
            imageContext,
          });
          if (imageUrl) {
            actions.push({ type: 'featured_image', status: 'success', detail: imageUrl, meta: { imageUrl } });
          }
        }
      } catch (imgErr) {
        console.warn(`[applyMergedContent] Failed to generate featured image:`, imgErr.message);
        actions.push({ type: 'featured_image', status: 'failed', detail: imgErr.message });
      }
    }

    // 4-6. For each secondary page: create redirect, trash, heal links
    const allSecondaryUrls = secondaryPagesAll.map(pg => pg.url);

    for (const secondary of secondaryPagesAll) {
      const secondaryPostId = secondary.postId;
      const secondaryUrl = secondary.url;
      const secondaryPostType = secondary.postType || 'post';

      // 4. Create redirect from secondary URL to primary URL (WordPress + platform DB)
      let fromPath, toPath, fromPathDisplay, toPathDisplay;
      try {
        // Keep percent-encoded paths for WordPress (browsers send encoded URIs)
        fromPath = new URL(secondaryUrl).pathname;
        toPath = new URL(primaryUrl).pathname;
        // Decoded paths for display and platform DB
        fromPathDisplay = decodeURIComponent(fromPath);
        toPathDisplay = decodeURIComponent(toPath);
        // Normalize: strip trailing slash for consistent storage (except root '/')
        if (fromPathDisplay.length > 1 && fromPathDisplay.endsWith('/')) fromPathDisplay = fromPathDisplay.slice(0, -1);
        if (toPathDisplay.length > 1 && toPathDisplay.endsWith('/')) toPathDisplay = toPathDisplay.slice(0, -1);

        // Sync to WordPress plugin - must use encoded paths
        await createRedirect(site, { source: fromPath, target: toPath, type: '301', enabled: true });
        console.log(`[applyMergedContent] Created WP redirect: ${fromPathDisplay} -> ${toPathDisplay}`);
        actions.push({ type: 'redirect_wp', status: 'success', detail: `${fromPathDisplay} → ${toPathDisplay}`, meta: { fromUrl: secondaryUrl, toUrl: primaryUrl, fromPath: fromPathDisplay, toPath: toPathDisplay } });
      } catch (redirectErr) {
        console.warn(`[applyMergedContent] Failed to create WP redirect:`, redirectErr.message);
        actions.push({ type: 'redirect_wp', status: 'failed', detail: redirectErr.message });
      }

      // Save redirect to platform DB (decoded for readability)
      if (fromPath && toPath) {
        try {
          await prisma.redirection.upsert({
            where: { siteId_sourceUrl: { siteId: site.id, sourceUrl: fromPathDisplay } },
            create: { siteId: site.id, sourceUrl: fromPathDisplay, targetUrl: toPathDisplay, type: 'PERMANENT', isActive: true },
            update: { targetUrl: toPathDisplay, type: 'PERMANENT', isActive: true },
          });
          actions.push({ type: 'redirect_platform', status: 'success', detail: `${fromPathDisplay} → ${toPathDisplay}`, meta: { fromUrl: secondaryUrl, toUrl: primaryUrl, fromPath: fromPathDisplay, toPath: toPathDisplay } });
        } catch (dbErr) {
          console.warn(`[applyMergedContent] Failed to save redirect to DB:`, dbErr.message);
          actions.push({ type: 'redirect_platform', status: 'failed', detail: dbErr.message });
        }
      }

      // 5. Trash the secondary post
      try {
        await updatePost(site, secondaryPostType, secondaryPostId, { status: 'trash' });
        console.log(`[applyMergedContent] Trashed secondary post: ${secondaryPostId}`);
        actions.push({ type: 'post_trashed', status: 'success', detail: secondaryUrl, meta: { url: secondaryUrl, title: secondary.title || '' } });
      } catch (trashErr) {
        console.warn(`[applyMergedContent] Failed to trash secondary post:`, trashErr.message);
        actions.push({ type: 'post_trashed', status: 'failed', detail: trashErr.message });
      }
    }

    // 6. Internal Link Healing: update all internal links pointing to trashed URLs
    try {
      await healInternalLinks(site, allSecondaryUrls, primaryUrl);
      actions.push({ type: 'link_healing', status: 'success', detail: `Healed internal links: ${allSecondaryUrls.length} URLs → ${primaryUrl}`, meta: { count: allSecondaryUrls.length, targetUrl: primaryUrl } });
    } catch (linkErr) {
      console.warn(`[applyMergedContent] Link healing failed:`, linkErr.message);
      actions.push({ type: 'link_healing', status: 'failed', detail: linkErr.message });
    }

    // 7. Request GSC re-indexing if connected
    if (googleIntegration?.gscConnected && googleIntegration?.gscSiteUrl) {
      try {
        const accessToken = await getValidMergeAccessToken(googleIntegration);
        if (accessToken) {
          const indexResult = await requestGscReindex(accessToken, primaryUrl);
          actions.push({ type: 'gsc_reindex', status: indexResult.success ? 'success' : 'failed', detail: indexResult.detail, meta: { url: primaryUrl } });
        } else {
          actions.push({ type: 'gsc_reindex', status: 'skipped', detail: 'Could not obtain valid GSC access token' });
        }
      } catch (gscErr) {
        console.warn(`[applyMergedContent] GSC re-index request failed:`, gscErr.message);
        actions.push({ type: 'gsc_reindex', status: 'failed', detail: gscErr.message });
      }
    }

    results.push({ 
      ...proposal, 
      status: 'fixed',
      mergedPostId: primaryPostId,
      actions,
    });

    return {
      success: true,
      results,
      actions,
      summary: 'Merged content published successfully',
    };
  } catch (error) {
    console.error('[applyMergedContent] Error:', error);
    results.push({ ...proposal, status: 'error', reason: error.message, actions });
    return {
      success: false,
      results,
      actions,
      summary: `Merge failed: ${error.message}`,
    };
  }
}

/**
 * Get a valid access token for the merge flow, refreshing if needed.
 */
async function getValidMergeAccessToken(googleIntegration) {
  if (!googleIntegration) return null;
  const { accessToken, refreshToken, tokenExpiresAt } = googleIntegration;

  if (tokenExpiresAt && new Date(tokenExpiresAt) > new Date(Date.now() + 5 * 60 * 1000)) {
    return accessToken;
  }
  if (!refreshToken) return null;

  try {
    const result = await refreshAccessToken(refreshToken);
    const newExpiry = new Date(Date.now() + (result.expires_in - 60) * 1000);
    await prisma.googleIntegration.update({
      where: { id: googleIntegration.id },
      data: { accessToken: result.access_token, tokenExpiresAt: newExpiry },
    });
    return result.access_token;
  } catch {
    return null;
  }
}

/**
 * Request Google to re-index a URL via the Indexing API.
 * Requires the indexing scope - will gracefully fail if not available.
 * Falls back to noting the user should manually request re-indexing.
 */
async function requestGscReindex(accessToken, pageUrl) {
  try {
    const res = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: pageUrl, type: 'URL_UPDATED' }),
    });

    if (res.ok) {
      console.log(`[applyMergedContent] GSC re-index requested for: ${pageUrl}`);
      return { success: true, detail: pageUrl };
    }

    const error = await res.json().catch(() => ({}));
    // 403 = scope not granted, expected for most users
    if (res.status === 403) {
      return { success: false, detail: 'Indexing API scope not available - manual re-indexing recommended via Google Search Console' };
    }
    return { success: false, detail: error.error?.message || `HTTP ${res.status}` };
  } catch (err) {
    return { success: false, detail: err.message };
  }
}

// ─── AI Page Missing Schema (generate JSON-LD) ──────────────────────

const SchemaGenerationSchema = z.object({
  schemaType: z.enum(['Article', 'FAQPage', 'HowTo', 'Product', 'LocalBusiness']).describe('Best-fitting schema.org type for the page'),
  jsonLd: z.string().describe('Complete valid JSON-LD object as a string, ready to drop inside <script type="application/ld+json">…</script>. Must be valid JSON.'),
  reasoning: z.string().describe('Short explanation of why this schema type was chosen'),
});

async function generateSchemaForPage({ title, content, url, locale, siteName, accountId, siteId, userId = null }) {
  const langInstruction = locale?.startsWith('he') ? 'Populate string fields in Hebrew where natural (name, description).' : 'Match the language of the page content for string fields.';
  const result = await generateStructuredResponse({
    system: `You are a structured-data specialist. Pick the best schema.org type for a page and emit a valid JSON-LD object. ${langInstruction}
Rules:
- Populate realistic values derived ONLY from the given page content - do not invent facts.
- Include @context: "https://schema.org" and @type.
- For Article: include headline, description, mainEntityOfPage (= url), datePublished (today if unknown), author (= site name).
- For FAQPage: emit at least 3 Question/Answer pairs extracted from the content when possible.
- For HowTo: include name, description, and step array with name + text.
- Output jsonLd as a SINGLE-LINE compact JSON string. It MUST be parseable via JSON.parse().`,
    prompt: `Site: ${siteName}
Page URL: ${url}
Page title: ${title}
Content excerpt: ${content}

Generate JSON-LD schema for this page.`,
    schema: SchemaGenerationSchema,
    temperature: 0.3,
    operation: 'AGENT_FIX_SCHEMA',
    metadata: { fixType: 'aiPageMissingSchema', siteName },
    accountId,
    siteId,
    userId,
  });
  return result;
}

async function previewAiPageMissingSchema(insight, site, userId = null) {
  const d = insight.data || {};
  const url = d.url || d.page;
  if (!url) return { success: false, proposals: [], error: 'Missing URL in insight data' };

  try {
    const resolved = await resolveEntityToWpPost(site, { url });
    if (!resolved) {
      return { success: false, proposals: [{ url, status: 'skipped', reason: 'Could not find WordPress post' }] };
    }
    const { pageTitle, pageContent } = await getPageContentWithSeo(resolved, site);

    const schema = await generateSchemaForPage({
      title: pageTitle,
      content: pageContent,
      url,
      locale: site.wpLocale || 'he',
      siteName: site.name || site.url,
      accountId: site.accountId,
      siteId: site.id,
      userId,
    });

    return {
      success: true,
      proposals: [{
        page: pageTitle,
        url,
        postId: resolved.wpPostId,
        postType: resolved.postType,
        status: 'ready',
        current: { schema: 'missing' },
        proposed: schema,
      }],
    };
  } catch (err) {
    return { success: false, proposals: [{ url, status: 'error', reason: err.message }] };
  }
}

/**
 * Apply schema fix. Since wp_kses_post strips <script> tags from post_content,
 * we store the generated JSON-LD on the insight record for the user to copy into
 * their theme / schema plugin. A future plugin version can render it via wp_head.
 */
async function applyAiPageMissingSchemaFix(insight, site, proposals, options = {}) {
  const results = [];
  for (const p of proposals) {
    if (!p.proposed?.jsonLd) {
      results.push({ ...p, status: 'error', reason: 'No generated schema to apply' });
      continue;
    }
    try {
      // Validate the JSON-LD parses before marking as ready-to-copy
      JSON.parse(p.proposed.jsonLd);
      results.push({
        ...p,
        status: 'fixed',
        appliedVia: 'manual_copy',
        snippet: `<script type="application/ld+json">${p.proposed.jsonLd}</script>`,
      });
    } catch (err) {
      results.push({ ...p, status: 'error', reason: `Generated JSON-LD is invalid: ${err.message}` });
    }
  }
  const fixed = results.filter(r => r.status === 'fixed').length;
  return {
    success: fixed > 0,
    results,
    summary: `Generated schema for ${fixed}/${proposals.length} page(s). Copy the snippet into your site's <head> via your theme or a header-injection plugin.`,
  };
}

// ─── AI Answerable But Not Concise (insert TL;DR block) ─────────────

const TldrBlockSchema = z.object({
  tldrSentences: z.array(z.string()).min(2).max(4).describe('2–4 short sentences summarizing the page\'s core answer for AI engines and skim readers'),
  keyTakeaways: z.array(z.string()).min(3).max(5).describe('3–5 bullet-point takeaways extracted from the page content'),
});

async function generateTldrBlock({ title, content, locale, siteName, accountId, siteId, userId = null }) {
  const isHe = locale?.startsWith('he');
  const langInstruction = isHe ? 'Write all sentences and bullets in Hebrew.' : 'Write in the language of the page content.';
  const result = await generateStructuredResponse({
    system: `You write concise, AI-answerable summaries for web pages. ${langInstruction}
Rules:
- TL;DR: 2–4 sentences, answer the page's core question immediately.
- Key takeaways: 3–5 short bullets, each self-contained.
- Do not invent facts not supported by the content.
- No clickbait.`,
    prompt: `Site: ${siteName}
Page title: ${title}
Content excerpt: ${content}

Write a TL;DR summary and key takeaways for this page.`,
    schema: TldrBlockSchema,
    temperature: 0.4,
    operation: 'AGENT_FIX_TLDR',
    metadata: { fixType: 'aiAnswerableButNotConcise', siteName },
    accountId,
    siteId,
    userId,
  });
  return result;
}

function renderTldrHtml(tldr, locale) {
  if (!tldr?.tldrSentences?.length) return '';
  const isHe = locale?.startsWith('he');
  const tldrLabel = isHe ? 'בקצרה' : 'TL;DR';
  const takeawaysLabel = isHe ? 'עיקרי הדברים' : 'Key takeaways';
  const dir = isHe ? ' dir="rtl"' : '';
  const sentences = tldr.tldrSentences.map(s => s.trim()).filter(Boolean).join(' ');
  const takeaways = (tldr.keyTakeaways || []).map(s => s.trim()).filter(Boolean);
  const bullets = takeaways.map(t => `<li>${escapeHtml(t)}</li>`).join('');
  return `<!-- wp:group {"className":"gp-ai-tldr"} --><div class="wp-block-group gp-ai-tldr" style="border-left:4px solid #9333ea;padding:1rem 1.25rem;margin:1rem 0;background:#faf5ff"${dir}>
<h2 style="margin:0 0 .5rem">${escapeHtml(tldrLabel)}</h2>
<p style="margin:0 0 .75rem">${escapeHtml(sentences)}</p>
${bullets ? `<h3 style="margin:0 0 .5rem">${escapeHtml(takeawaysLabel)}</h3><ul style="margin:0;padding-inline-start:1.25rem">${bullets}</ul>` : ''}
</div><!-- /wp:group -->`;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function previewAiAnswerableButNotConcise(insight, site, userId = null) {
  const d = insight.data || {};
  const url = d.url || d.page;
  if (!url) return { success: false, proposals: [], error: 'Missing URL in insight data' };

  try {
    const resolved = await resolveEntityToWpPost(site, { url });
    if (!resolved) {
      return { success: false, proposals: [{ url, status: 'skipped', reason: 'Could not find WordPress post' }] };
    }
    const { pageTitle, pageContent } = await getPageContentWithSeo(resolved, site);

    const tldr = await generateTldrBlock({
      title: pageTitle,
      content: pageContent,
      locale: site.wpLocale || 'he',
      siteName: site.name || site.url,
      accountId: site.accountId,
      siteId: site.id,
      userId,
    });

    return {
      success: true,
      proposals: [{
        page: pageTitle,
        url,
        postId: resolved.wpPostId,
        postType: resolved.postType,
        status: 'ready',
        current: { firstParaWords: d.firstParaWords || null },
        proposed: tldr,
      }],
    };
  } catch (err) {
    return { success: false, proposals: [{ url, status: 'error', reason: err.message }] };
  }
}

async function applyAiAnswerableFix(insight, site, proposals, options = {}) {
  const locale = site.wpLocale || 'he';
  const results = [];
  for (const p of proposals) {
    try {
      if (!p.proposed?.tldrSentences?.length) {
        results.push({ ...p, status: 'error', reason: 'No generated TL;DR to apply' });
        continue;
      }
      const post = await getPost(site, p.postType, p.postId);
      const current = post?.content || '';
      // Skip if an existing TL;DR block already exists
      if (current.includes('gp-ai-tldr')) {
        results.push({ ...p, status: 'fixed', appliedVia: 'skipped_existing' });
        continue;
      }
      const block = renderTldrHtml(p.proposed, locale);
      if (!block) {
        results.push({ ...p, status: 'error', reason: 'Rendered block was empty' });
        continue;
      }
      const newContent = `${block}\n\n${current}`;
      await updatePost(site, p.postType, p.postId, { content: newContent });
      results.push({ ...p, status: 'fixed', appliedVia: 'post_content_prepend' });
    } catch (err) {
      results.push({ ...p, status: 'error', reason: err.message });
    }
  }
  const fixed = results.filter(r => r.status === 'fixed').length;
  return {
    success: fixed > 0,
    results,
    summary: `Inserted TL;DR block on ${fixed}/${proposals.length} page(s)`,
  };
}

// ─── New AI Fix Handlers (2026 batch) ────────────────────────────────
//
// Handlers for the registry-added insight types. Each follows the same
// shape as the older handlers above:
//
//   preview:    returns { success, proposals: [...] }
//   regenerate: returns { success, proposal }
//   apply:      returns { success, results, summary }
//
// Most reuse helpers like resolveEntityToWpPost / getPageContentWithSeo.
// Cross-platform writes go through `cms.*` so Shopify works the same.

// ─── H1 Fix (missingH1Tag, multipleH1Tags) ───────────────────────────

const H1GenerationSchema = z.object({
  h1: z.string().describe('A clear, keyword-rich H1 heading for the page, 30-70 characters, in the page\'s language'),
});

const H1CanonicalSchema = z.object({
  keepIndex: z.number().int().min(0).describe('Index of the H1 in the input list that should remain as H1 (0-based)'),
  reasoning: z.string().describe('One sentence explaining why this H1 is the best canonical choice'),
});

async function previewH1Fix(insight, site, userId = null) {
  const pages = insight.data?.pages || [];
  if (pages.length === 0) {
    return { success: false, proposals: [], error: 'No pages in insight data' };
  }

  const isMultiple = getInsightType(insight.titleKey) === 'multipleH1Tags';
  const proposals = [];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    try {
      const resolved = await resolveEntityToWpPost(site, { entityId: page.id, url: page.url });
      if (!resolved) {
        proposals.push({ page: page.title || page.slug, url: page.url, status: 'skipped', reason: 'Could not find post ID' });
        continue;
      }

      const post = await getPost(site, resolved.postType, resolved.wpPostId).catch(() => null);
      const content = post?.content || resolved.content || '';
      const pageTitle = post?.title || resolved.title || page.title || '';

      if (isMultiple) {
        // Extract existing H1s and ask AI which one to keep
        const h1Texts = [...content.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)]
          .map(m => stripHtml(m[1]).trim())
          .filter(Boolean);

        if (h1Texts.length < 2) {
          proposals.push({
            page: pageTitle || page.slug,
            url: page.url,
            postId: resolved.wpPostId,
            postType: resolved.postType,
            status: 'skipped',
            reason: 'Page no longer has multiple H1s',
          });
          continue;
        }

        const choice = await generateStructuredResponse({
          schema: H1CanonicalSchema,
          prompt: `Page title: "${pageTitle}"\n\nThis page has multiple H1 headings, which is bad for SEO. Pick the ONE that best represents the page's main topic and should remain as H1; the others will be demoted to H2.\n\nH1s on the page:\n${h1Texts.map((t, idx) => `${idx}. ${t}`).join('\n')}`,
          accountId: site.accountId,
          siteId: site.id,
          userId,
          operation: 'agent.fix.h1Canonical',
        });

        proposals.push({
          page: pageTitle || page.slug,
          url: page.url,
          postId: resolved.wpPostId,
          postType: resolved.postType,
          status: 'ready',
          mode: 'demoteOthers',
          h1List: h1Texts,
          current: { h1Count: h1Texts.length },
          proposed: { keepIndex: choice.keepIndex, keepText: h1Texts[choice.keepIndex], reasoning: choice.reasoning },
        });
      } else {
        // Generate a new H1 for the missing case
        const excerpt = stripHtml(content).slice(0, 1500);
        const generated = await generateStructuredResponse({
          schema: H1GenerationSchema,
          prompt: `Generate a clear, descriptive H1 heading for this page.\n\nPage title: "${pageTitle}"\nPage content excerpt:\n${excerpt}\n\nThe H1 should:\n- Be 30-70 characters\n- Match the page's primary topic\n- Be in the same language as the content\n- Be different from the page title (titles can be longer/SEO-focused; H1s are for readers)`,
          accountId: site.accountId,
          siteId: site.id,
          userId,
          operation: 'agent.fix.h1Generate',
        });

        proposals.push({
          page: pageTitle || page.slug,
          url: page.url,
          postId: resolved.wpPostId,
          postType: resolved.postType,
          status: 'ready',
          mode: 'addNew',
          current: { h1: null },
          proposed: { h1: generated.h1 },
        });
      }
    } catch (err) {
      proposals.push({ page: page.title || page.slug, url: page.url, status: 'error', reason: err.message });
    }
  }

  return { success: proposals.some(p => p.status === 'ready'), proposals };
}

async function regenerateH1Item(insight, site, itemIndex) {
  // Build a single-item insight and reuse the preview function
  const stub = {
    ...insight,
    data: { ...insight.data, pages: [insight.data?.pages?.[itemIndex]].filter(Boolean) },
  };
  const out = await previewH1Fix(stub, site);
  return { success: !!out.proposals?.[0], proposal: out.proposals?.[0] };
}

async function applyH1Fix(insight, site, proposals, _options = {}) {
  const isShopify = site.platform === 'shopify';
  const results = [];

  for (const p of proposals) {
    try {
      if (p.status !== 'ready' || !p.postId) {
        results.push({ ...p, status: 'skipped', reason: p.reason || 'Not ready' });
        continue;
      }

      if (p.mode === 'addNew') {
        if (isShopify) {
          // Prepend an <h1> to the post body via updatePost
          const post = await getPost(site, p.postType, p.postId);
          const body = post?.content || '';
          const newBody = `<h1>${escapeHtml(p.proposed.h1)}</h1>\n${body}`;
          await updatePost(site, p.postType, p.postId, { content: newBody });
        } else {
          // WP plugin understands `add_h1` directly on updatePost
          await updatePost(site, p.postType, p.postId, {
            add_h1: { text: p.proposed.h1, position: 'top' },
          });
        }
        results.push({ ...p, status: 'fixed' });
      } else if (p.mode === 'demoteOthers') {
        const keepText = p.proposed?.keepText;
        const h1List = p.h1List || [];
        if (!keepText || h1List.length < 2) {
          results.push({ ...p, status: 'error', reason: 'Missing canonical H1 selection' });
          continue;
        }

        // Read body, replace each non-keep H1 with H2.
        const post = await getPost(site, p.postType, p.postId);
        let body = post?.content || '';
        const keepNorm = keepText.replace(/\s+/g, ' ').trim().toLowerCase();
        const h1Re = /<h1([^>]*)>([\s\S]*?)<\/h1>/gi;
        body = body.replace(h1Re, (match, attrs, inner) => {
          const innerText = stripHtml(inner).replace(/\s+/g, ' ').trim().toLowerCase();
          if (innerText === keepNorm) return match;
          return `<h2${attrs}>${inner}</h2>`;
        });
        await updatePost(site, p.postType, p.postId, { content: body });
        results.push({ ...p, status: 'fixed' });
      } else {
        results.push({ ...p, status: 'error', reason: 'Unknown H1 fix mode' });
      }
    } catch (err) {
      results.push({ ...p, status: 'error', reason: err.message });
    }
  }

  const fixed = results.filter(r => r.status === 'fixed').length;
  return {
    success: fixed > 0,
    results,
    summary: `Updated H1 on ${fixed}/${proposals.length} page(s)`,
  };
}

// ─── Content Refresh (staleContent, decliningPages, contentWithoutTraffic) ──

const ContentRefreshSchema = z.object({
  refreshedTitle: z.string().describe('Updated page title (keep close to original intent, refresh wording for current year if applicable)'),
  refreshedContent: z.string().describe('Full HTML body for the page. Preserve the page\'s original structure and topic, but refresh examples, statistics, year references, and any stale recommendations. Output valid HTML with <p>, <h2>, <h3>, <ul>, <ol> as needed.'),
  refreshedSeo: z.object({
    title: z.string().describe('SEO title 50-60 chars'),
    description: z.string().describe('SEO description 140-160 chars'),
  }),
  changeSummary: z.string().describe('One paragraph describing what was refreshed and why'),
});

async function previewContentRefresh(insight, site, userId = null) {
  // Pull pages from whichever data shape this insight uses
  const pages = insight.data?.pages || insight.data?.oldestPages || [];
  if (pages.length === 0) {
    return { success: false, proposals: [], error: 'No pages in insight data' };
  }

  const proposals = [];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const url = page.url || page.page;
    if (!url) {
      proposals.push({ page: page.title || page.slug || '', url: '', status: 'skipped', reason: 'Missing URL' });
      continue;
    }

    try {
      const resolved = await resolveEntityToWpPost(site, { entityId: page.id || page.entityId, url });
      if (!resolved) {
        proposals.push({ page: page.title || page.slug || url, url, status: 'skipped', reason: 'Could not find post ID' });
        continue;
      }

      const { pageTitle, pageContent, currentSeo } = await getFullPageContentWithSeo(resolved, site);
      if (!pageContent) {
        proposals.push({ page: pageTitle || url, url, status: 'skipped', reason: 'Could not fetch page content' });
        continue;
      }

      const refreshed = await generateStructuredResponse({
        schema: ContentRefreshSchema,
        prompt: `Refresh this page so it feels current. Keep the original topic, structure and intent — do NOT pivot the angle. Update years, stats, examples, recommendations, and any wording that has aged. The output should be a drop-in replacement for the page body.\n\nSite name: ${site.name || site.url}\nLocale: ${site.wpLocale || 'he'}\nCurrent year: ${new Date().getFullYear()}\n\nCurrent title: "${pageTitle}"\nCurrent SEO title: "${currentSeo?.title || ''}"\nCurrent SEO description: "${currentSeo?.description || ''}"\n\nCurrent body HTML:\n${pageContent.slice(0, 12000)}`,
        accountId: site.accountId,
        siteId: site.id,
        userId,
        operation: 'agent.fix.contentRefresh',
      });

      // Replace any stale years in the AI output to be safe
      refreshed.refreshedContent = replaceStaleYears(refreshed.refreshedContent);
      refreshed.refreshedTitle = replaceStaleYears(refreshed.refreshedTitle);
      refreshed.refreshedSeo.title = replaceStaleYears(refreshed.refreshedSeo.title);
      refreshed.refreshedSeo.description = replaceStaleYears(refreshed.refreshedSeo.description);

      proposals.push({
        page: pageTitle || url,
        url,
        postId: resolved.wpPostId,
        postType: resolved.postType,
        status: 'ready',
        current: {
          title: pageTitle,
          seoTitle: currentSeo?.title || '',
          seoDescription: currentSeo?.description || '',
        },
        proposed: refreshed,
      });
    } catch (err) {
      proposals.push({ page: page.title || page.slug || url, url, status: 'error', reason: err.message });
    }
  }

  return { success: proposals.some(p => p.status === 'ready'), proposals };
}

async function regenerateContentRefreshItem(insight, site, itemIndex) {
  const pages = insight.data?.pages || insight.data?.oldestPages || [];
  const stub = { ...insight, data: { ...insight.data, pages: [pages[itemIndex]].filter(Boolean), oldestPages: undefined } };
  const out = await previewContentRefresh(stub, site);
  return { success: !!out.proposals?.[0], proposal: out.proposals?.[0] };
}

async function applyContentRefreshFix(insight, site, proposals, _options = {}) {
  const results = [];
  for (const p of proposals) {
    try {
      if (p.status !== 'ready' || !p.postId || !p.proposed?.refreshedContent) {
        results.push({ ...p, status: 'skipped', reason: p.reason || 'Not ready' });
        continue;
      }

      await updatePost(site, p.postType, p.postId, {
        title: p.proposed.refreshedTitle,
        content: p.proposed.refreshedContent,
      });

      // Best-effort SEO update — don't block on failure
      try {
        await updateSeoData(site, p.postId, {
          title: p.proposed.refreshedSeo?.title,
          description: p.proposed.refreshedSeo?.description,
        });
      } catch (e) {
        console.warn(`[Agent Fix] contentRefresh: SEO update failed for ${p.url}:`, e.message);
      }

      results.push({ ...p, status: 'fixed' });
    } catch (err) {
      results.push({ ...p, status: 'error', reason: err.message });
    }
  }
  const fixed = results.filter(r => r.status === 'fixed').length;
  return {
    success: fixed > 0,
    results,
    summary: `Refreshed content on ${fixed}/${proposals.length} page(s)`,
  };
}

// ─── New Article (contentGaps, newKeywordOpportunities) ──────────────

const NewArticleSchema = z.object({
  title: z.string().describe('Page title (60-90 chars)'),
  slug: z.string().describe('URL-safe slug, lowercase with hyphens, no special chars'),
  content: z.string().describe('Full article HTML body, 1200-2500 words. Use <p>, <h2>, <h3>, <ul>, <ol>. Open with a strong intro paragraph.'),
  seoTitle: z.string().describe('SEO title 50-60 chars'),
  seoDescription: z.string().describe('Meta description 140-160 chars, actionable'),
  focusKeyword: z.string().describe('The single primary keyword this article targets'),
  excerpt: z.string().describe('A 1-2 sentence excerpt suitable for listings'),
});

async function previewNewArticle(insight, site, userId = null) {
  const type = getInsightType(insight.titleKey);
  // contentGaps surfaces .topGaps (each with topic, keywords, etc.)
  // newKeywordOpportunities surfaces .queries (each with query, impressions, etc.)
  const items = type === 'contentGaps'
    ? (insight.data?.topGaps || [])
    : (insight.data?.queries || []);

  if (items.length === 0) {
    return { success: false, proposals: [], error: 'No opportunities in insight data' };
  }

  const proposals = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const seedTopic = type === 'contentGaps'
      ? (item.topic || item.title || item.keyword || '')
      : item.query;

    if (!seedTopic) {
      proposals.push({ index: i, status: 'skipped', reason: 'No seed topic' });
      continue;
    }

    try {
      const generated = await generateStructuredResponse({
        schema: NewArticleSchema,
        prompt: `Draft a new article for this site that targets the topic below.\n\nSite name: ${site.name || site.url}\nLocale: ${site.wpLocale || 'he'}\nCurrent year: ${new Date().getFullYear()}\n\nSeed topic: "${seedTopic}"\n${type === 'newKeywordOpportunities' ? `\nGSC signals: ${item.impressions || 0} impressions, position ${item.position || '?'}\n` : ''}\nWrite a comprehensive, original article. Output valid HTML for the body. Don't include the title in the HTML — that's separate.`,
        accountId: site.accountId,
        siteId: site.id,
        userId,
        operation: 'agent.fix.newArticle',
      });

      proposals.push({
        index: i,
        seedTopic,
        status: 'ready',
        proposed: generated,
      });
    } catch (err) {
      proposals.push({ index: i, seedTopic, status: 'error', reason: err.message });
    }
  }

  return { success: proposals.some(p => p.status === 'ready'), proposals };
}

async function regenerateNewArticleItem(insight, site, itemIndex) {
  const type = getInsightType(insight.titleKey);
  const items = type === 'contentGaps'
    ? (insight.data?.topGaps || [])
    : (insight.data?.queries || []);
  const single = items[itemIndex];
  if (!single) return { success: false, error: 'Item not found' };
  const stub = { ...insight, data: { ...insight.data, topGaps: [single], queries: [single] } };
  const out = await previewNewArticle(stub, site);
  return { success: !!out.proposals?.[0], proposal: out.proposals?.[0] };
}

async function applyNewArticleFix(insight, site, proposals, _options = {}) {
  const results = [];
  for (const p of proposals) {
    try {
      if (p.status !== 'ready' || !p.proposed?.content) {
        results.push({ ...p, status: 'skipped', reason: p.reason || 'Not ready' });
        continue;
      }

      // Always create as draft — never auto-publish AI-generated content.
      const postType = site.platform === 'shopify' ? 'article' : 'post';
      const created = await _cms.createPost(site, postType, {
        title: p.proposed.title,
        slug: p.proposed.slug,
        content: p.proposed.content,
        excerpt: p.proposed.excerpt,
        status: 'draft',
      });

      const newPostId = created?.id || created?.postId || null;

      // Best-effort SEO update on the new draft
      if (newPostId) {
        try {
          await updateSeoData(site, newPostId, {
            title: p.proposed.seoTitle,
            description: p.proposed.seoDescription,
            focusKeyword: p.proposed.focusKeyword,
          });
        } catch (e) {
          console.warn('[Agent Fix] newArticle: SEO update failed:', e.message);
        }
      }

      results.push({
        ...p,
        status: 'fixed',
        postId: newPostId,
        editUrl: created?.editUrl || null,
      });
    } catch (err) {
      results.push({ ...p, status: 'error', reason: err.message });
    }
  }
  const fixed = results.filter(r => r.status === 'fixed').length;
  return {
    success: fixed > 0,
    results,
    summary: `Drafted ${fixed}/${proposals.length} new article(s)`,
  };
}

// ─── Internal Links (unlinkedKeywords) ───────────────────────────────

const InternalLinksProposalSchema = z.object({
  proposals: z.array(z.object({
    keyword: z.string(),
    sourceUrl: z.string().describe('URL of the existing page where the anchor will be inserted'),
    targetUrl: z.string().describe('URL the link should point to (existing page or "create" placeholder)'),
    anchor: z.string().describe('Anchor text to wrap with <a>, taken verbatim from the source page text. Must already appear unlinked in the source body.'),
    reason: z.string().describe('Short rationale for this link'),
  })),
});

async function previewInternalLinks(insight, site, userId = null) {
  const keywords = insight.data?.keywords || [];
  if (keywords.length === 0) {
    return { success: false, proposals: [], error: 'No keywords in insight data' };
  }

  // Fetch a sample of published entities so the AI can suggest source pages
  const entities = await prisma.siteEntity.findMany({
    where: { siteId: site.id, status: 'PUBLISHED', entityType: { isEnabled: true } },
    select: { title: true, url: true, slug: true },
    take: 50,
  });

  if (entities.length === 0) {
    return { success: false, proposals: [], error: 'No published pages to anchor from' };
  }

  try {
    const out = await generateStructuredResponse({
      schema: InternalLinksProposalSchema,
      prompt: `Propose internal-link insertions to give these unlinked keywords a foothold on the site.\n\nKeywords (with monthly volume):\n${keywords.map(k => `- ${k.keyword} (${k.searchVolume || 0}/mo)`).join('\n')}\n\nExisting pages on the site:\n${entities.map(e => `- ${e.title} → ${e.url}`).join('\n')}\n\nFor each keyword, pick the BEST existing page to anchor from (sourceUrl) and the BEST existing page to point to (targetUrl). The anchor text MUST already appear in the source page's body. Only return proposals you're confident will work.`,
      accountId: site.accountId,
      siteId: site.id,
      userId,
      operation: 'agent.fix.internalLinks',
    });

    // Reshape into per-keyword proposals
    const proposals = (out.proposals || []).map(prop => ({
      keyword: prop.keyword,
      sourceUrl: prop.sourceUrl,
      targetUrl: prop.targetUrl,
      anchor: prop.anchor,
      reason: prop.reason,
      status: 'ready',
    }));

    return { success: proposals.length > 0, proposals };
  } catch (err) {
    return { success: false, proposals: [], error: err.message };
  }
}

async function regenerateInternalLinksItem(insight, site, _itemIndex) {
  return previewInternalLinks(insight, site);
}

async function applyInternalLinksFix(insight, site, proposals, _options = {}) {
  const results = [];

  for (const p of proposals) {
    try {
      if (p.status !== 'ready') {
        results.push({ ...p, status: 'skipped', reason: p.reason || 'Not ready' });
        continue;
      }

      const resolved = await resolveEntityToWpPost(site, { url: p.sourceUrl });
      if (!resolved) {
        results.push({ ...p, status: 'skipped', reason: 'Source page not found' });
        continue;
      }

      const post = await getPost(site, resolved.postType, resolved.wpPostId);
      const body = post?.content || '';

      // Insert <a> around the first unlinked occurrence of the anchor text.
      // Skip if the anchor is already inside an <a>.
      const anchorEsc = p.anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const anchorRe = new RegExp(`(?<!<a[^>]*>[^<]*)\\b(${anchorEsc})\\b(?![^<]*</a>)`, 'i');
      if (!anchorRe.test(body)) {
        results.push({ ...p, status: 'skipped', reason: 'Anchor text not found unlinked on source page' });
        continue;
      }

      const newBody = body.replace(anchorRe, `<a href="${escapeHtml(p.targetUrl)}">$1</a>`);

      // Body-rewrite via updatePost works the same on WP and Shopify (latter
      // accepts body_html through the adapter's updatePost mapper).
      await updatePost(site, resolved.postType, resolved.wpPostId, { content: newBody });

      results.push({
        ...p,
        status: 'fixed',
        postId: resolved.wpPostId,
        postType: resolved.postType,
      });
    } catch (err) {
      results.push({ ...p, status: 'error', reason: err.message });
    }
  }
  const fixed = results.filter(r => r.status === 'fixed').length;
  return {
    success: fixed > 0,
    results,
    summary: `Inserted ${fixed}/${proposals.length} internal link(s)`,
  };
}

// ─── AI Engine Gap (aiEngineGap) ─────────────────────────────────────
//
// This insight flags a page that's cited by one AI engine but missing on
// others. Fix = make the page maximally AI-citable: ensure schema markup
// AND a concise TL;DR-style intro. Reuses the two existing AI-coverage
// handlers in sequence on the same page.

async function previewAiEngineGap(insight, site, userId = null) {
  const d = insight.data || {};
  // The insight stores `page` as a path; convert to a full URL using site origin.
  const pagePath = d.page || d.url;
  if (!pagePath) {
    return { success: false, proposals: [], error: 'No page URL in insight data' };
  }
  let fullUrl;
  try {
    const origin = new URL(site.url).origin;
    fullUrl = pagePath.startsWith('http') ? pagePath : new URL(pagePath, origin).toString();
  } catch {
    return { success: false, proposals: [{ url: pagePath, status: 'error', reason: 'Could not resolve page URL' }] };
  }

  try {
    const resolved = await resolveEntityToWpPost(site, { url: fullUrl });
    if (!resolved) {
      return { success: false, proposals: [{ url: fullUrl, status: 'skipped', reason: 'Could not find post ID' }] };
    }

    // Sub-fixes both consume `data.url`. Build minimal insight stubs so they
    // don't have to know about the engine-gap shape.
    const subInsight = { ...insight, data: { ...d, url: fullUrl, page: pagePath } };

    const [schemaPreview, answerablePreview] = await Promise.all([
      previewAiPageMissingSchema(subInsight, site, userId).catch(e => ({ success: false, error: e.message })),
      previewAiAnswerableButNotConcise(subInsight, site, userId).catch(e => ({ success: false, error: e.message })),
    ]);

    return {
      success: !!(schemaPreview?.proposals?.[0]?.proposed || answerablePreview?.proposals?.[0]?.proposed),
      proposals: [{
        url: fullUrl,
        postId: resolved.wpPostId,
        postType: resolved.postType,
        status: 'ready',
        current: { primaryEngine: d.primaryEngine, missingEngines: d.missingEngines },
        proposed: {
          schemaProposal: schemaPreview?.proposals?.[0]?.proposed || null,
          answerableProposal: answerablePreview?.proposals?.[0]?.proposed || null,
        },
      }],
    };
  } catch (err) {
    return { success: false, proposals: [{ url: fullUrl, status: 'error', reason: err.message }] };
  }
}

async function applyAiEngineGapFix(insight, site, proposals, options = {}) {
  const results = [];

  for (const p of proposals) {
    try {
      if (p.status !== 'ready' || !p.postId) {
        results.push({ ...p, status: 'skipped', reason: p.reason || 'Not ready' });
        continue;
      }

      const subResults = [];

      // Apply schema if proposed
      if (p.proposed?.schemaProposal) {
        try {
          const schemaProposal = {
            url: p.url,
            postId: p.postId,
            postType: p.postType,
            status: 'ready',
            proposed: p.proposed.schemaProposal,
          };
          const r = await applyAiPageMissingSchemaFix(insight, site, [schemaProposal], options);
          subResults.push({ part: 'schema', success: r.success });
        } catch (e) {
          subResults.push({ part: 'schema', success: false, reason: e.message });
        }
      }

      // Apply concise intro if proposed
      if (p.proposed?.answerableProposal) {
        try {
          const answerableProposal = {
            url: p.url,
            postId: p.postId,
            postType: p.postType,
            status: 'ready',
            proposed: p.proposed.answerableProposal,
          };
          const r = await applyAiAnswerableFix(insight, site, [answerableProposal], options);
          subResults.push({ part: 'tldr', success: r.success });
        } catch (e) {
          subResults.push({ part: 'tldr', success: false, reason: e.message });
        }
      }

      const anySuccess = subResults.some(s => s.success);
      results.push({
        ...p,
        status: anySuccess ? 'fixed' : 'error',
        subResults,
      });
    } catch (err) {
      results.push({ ...p, status: 'error', reason: err.message });
    }
  }

  const fixed = results.filter(r => r.status === 'fixed').length;
  return {
    success: fixed > 0,
    results,
    summary: `Improved AI-citability on ${fixed}/${proposals.length} page(s)`,
  };
}

// ─── Free Fix Dispatch ───────────────────────────────────────────────

/**
 * Dispatch entry point for `kind: 'free'` insights — no AI calls, no credit
 * charge. Returns the same shape as applyInsightFix's results.
 */
export async function applyFreeFix(insight, site, itemIndices = null) {
  const cfg = getFixerConfig(insight.titleKey);
  if (!cfg || cfg.kind !== 'free' || cfg.external) {
    return { success: false, results: [], summary: 'Insight is not free-fixable' };
  }

  switch (cfg.handler) {
    case 'noindexClear':
      return applyNoindexClearFix(insight, site, itemIndices);
    case 'rescanCompetitors':
      return applyRescanCompetitorsFix(insight, site);
    default:
      return { success: false, results: [], summary: `Unknown free handler: ${cfg.handler}` };
  }
}

// ─── Utilities ───────────────────────────────────────────────────────

function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
