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
import { updateSeoData, getSeoData, getPost, resolveUrl, uploadMediaFromBase64, updatePost, createRedirect } from '@/lib/wp-api-client.js';
import { gatherImageContext, buildImagePrompt } from '@/lib/ai/image-context.js';
import prisma from '@/lib/prisma';
import { z } from 'zod';

// ─── Fixable Types ───────────────────────────────────────────────────

const FIXABLE_TYPES = new Set(['missingSeo', 'keywordStrikeZone', 'lowCtrForPosition', 'cannibalization']);

/**
 * Extract the insight type from a titleKey like 'agent.insights.missingSeo.title'
 * Also handles nested keys like 'agent.insights.cannibalization.semantic.title'
 */
function getInsightType(titleKey) {
  if (!titleKey) return null;
  // Handle nested cannibalization keys like 'agent.insights.cannibalization.proactive.title'
  if (titleKey.includes('cannibalization')) return 'cannibalization';
  // Handle standard keys like 'agent.insights.missingSeo.title'
  return titleKey.match(/agent\.insights\.(\w+)\.title/)?.[1] || null;
}

/**
 * Check if an insight type is fixable via AI + plugin.
 */
export function isFixableType(titleKey) {
  return FIXABLE_TYPES.has(getInsightType(titleKey));
}

// ─── SEO Schema ──────────────────────────────────────────────────────

const SeoGenerationSchema = z.object({
  title: z.string().describe('SEO title for the page, 50-60 characters, compelling and keyword-rich'),
  description: z.string().describe('SEO meta description, 140-160 characters, actionable and descriptive'),
});

// ─── Cannibalization Fix Schema ──────────────────────────────────────

const ARTICLE_TYPES = ['seo', 'blogPost', 'guide', 'howTo', 'listicle', 'comparison', 'review', 'news', 'tutorial', 'caseStudy'];

const CannibalizationFixSchema = z.object({
  recommendedAction: z.enum(['MERGE', 'CANONICAL', '301_REDIRECT', 'DIFFERENTIATE']).describe('Best action to fix cannibalization'),
  reasoning: z.string().describe('Brief explanation for the recommendation'),
  pageAChanges: z.object({
    newTitle: z.string().describe('New SEO title for page A (if action is DIFFERENTIATE)'),
    newDescription: z.string().describe('New meta description for page A'),
    newFocusKeyword: z.string().describe('New focus keyword for page A to avoid overlap'),
    targetAngle: z.string().describe('The unique angle/intent page A should target'),
  }),
  pageBChanges: z.object({
    newTitle: z.string().describe('New SEO title for page B (if action is DIFFERENTIATE)'),
    newDescription: z.string().describe('New meta description for page B'),
    newFocusKeyword: z.string().describe('New focus keyword for page B to avoid overlap'),
    targetAngle: z.string().describe('The unique angle/intent page B should target'),
  }),
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

  // If externalId is missing, resolve the WP post via the plugin's URL resolver
  if (!entity.externalId && entity.url && site.siteKey) {
    const resolved = await resolveUrl(site, entity.url);
    if (resolved?.found && resolved.postId) {
      const wpPostId = String(resolved.postId);
      // Backfill externalId for future lookups
      await prisma.siteEntity.update({
        where: { id: entity.id },
        data: { externalId: wpPostId },
      }).catch(() => {});
      return { wpPostId, postType: resolved.postType || postType, title: entity.title, content: entity.content };
    }
  }

  if (!entity.externalId) return null;

  return {
    wpPostId: entity.externalId,
    postType,
    title: entity.title,
    content: entity.content,
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
export async function generateInsightPreview(insight, site) {
  const type = getInsightType(insight.titleKey);

  switch (type) {
    case 'missingSeo':
      return previewMissingSeo(insight, site);
    case 'keywordStrikeZone':
      return previewKeywordStrikeZone(insight, site);
    case 'lowCtrForPosition':
      return previewLowCtrForPosition(insight, site);
    case 'cannibalization':
      return previewCannibalization(insight, site);
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

async function previewMissingSeo(insight, site) {
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

async function previewKeywordStrikeZone(insight, site) {
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

async function previewLowCtrForPosition(insight, site) {
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

// ─── Cannibalization Preview ─────────────────────────────────────────

/**
 * Generate AI-proposed fix for cannibalization issues.
 * Analyzes competing pages and suggests how to differentiate them.
 */
async function previewCannibalization(insight, site) {
  const issues = insight.data?.issues || [];
  if (issues.length === 0) {
    return { success: false, proposals: [], error: 'No cannibalization issues in insight data' };
  }

  const proposals = [];

  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    const urlA = issue.urls?.[0];
    const urlB = issue.urls?.[1];

    if (!urlA || !urlB) {
      proposals.push({
        issueIndex: i,
        status: 'skipped',
        reason: 'Missing URLs for competing pages',
      });
      continue;
    }

    try {
      // Resolve both pages to WP posts
      const [resolvedA, resolvedB] = await Promise.all([
        resolveEntityToWpPost(site, { url: urlA }),
        resolveEntityToWpPost(site, { url: urlB }),
      ]);

      if (!resolvedA || !resolvedB) {
        proposals.push({
          issueIndex: i,
          urlA,
          urlB,
          status: 'skipped',
          reason: 'Could not resolve one or both pages to WordPress posts',
        });
        continue;
      }

      // Get content and SEO data for both pages
      const [dataA, dataB] = await Promise.all([
        getPageContentWithSeo(resolvedA, site),
        getPageContentWithSeo(resolvedB, site),
      ]);

      // Generate AI fix suggestion
      const fixSuggestion = await generateCannibalizationFix({
        pageA: {
          title: dataA.pageTitle,
          content: dataA.pageContent,
          currentSeo: dataA.currentSeo,
          url: urlA,
          focusKeyword: issue.entityA?.focusKeyword || '',
          postId: resolvedA.wpPostId,
        },
        pageB: {
          title: dataB.pageTitle,
          content: dataB.pageContent,
          currentSeo: dataB.currentSeo,
          url: urlB,
          focusKeyword: issue.entityB?.focusKeyword || '',
          postId: resolvedB.wpPostId,
        },
        originalAction: issue.action,
        reason: issue.reason,
        locale: site.wpLocale || 'he',
      });

      proposals.push({
        issueIndex: i,
        status: 'ready',
        urlA,
        urlB,
        postIdA: resolvedA.wpPostId,
        postIdB: resolvedB.wpPostId,
        postTypeA: resolvedA.postType,
        postTypeB: resolvedB.postType,
        titleA: dataA.pageTitle,
        titleB: dataB.pageTitle,
        currentA: dataA.currentSeo ? {
          title: dataA.currentSeo.title || '',
          description: dataA.currentSeo.description || '',
          focusKeyword: issue.entityA?.focusKeyword || '',
        } : { title: '', description: '', focusKeyword: '' },
        currentB: dataB.currentSeo ? {
          title: dataB.currentSeo.title || '',
          description: dataB.currentSeo.description || '',
          focusKeyword: issue.entityB?.focusKeyword || '',
        } : { title: '', description: '', focusKeyword: '' },
        recommendation: fixSuggestion,
      });
    } catch (err) {
      proposals.push({
        issueIndex: i,
        urlA,
        urlB,
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

  const urlA = issue.urls?.[0];
  const urlB = issue.urls?.[1];

  if (!urlA || !urlB) {
    return { success: false, error: 'Missing URLs for competing pages' };
  }

  const [resolvedA, resolvedB] = await Promise.all([
    resolveEntityToWpPost(site, { url: urlA }),
    resolveEntityToWpPost(site, { url: urlB }),
  ]);

  if (!resolvedA || !resolvedB) {
    return { success: false, error: 'Could not resolve pages to WordPress posts' };
  }

  const [dataA, dataB] = await Promise.all([
    getPageContentWithSeo(resolvedA, site),
    getPageContentWithSeo(resolvedB, site),
  ]);

  const fixSuggestion = await generateCannibalizationFix({
    pageA: {
      title: dataA.pageTitle,
      content: dataA.pageContent,
      currentSeo: dataA.currentSeo,
      url: urlA,
      focusKeyword: issue.entityA?.focusKeyword || '',
      postId: resolvedA.wpPostId,
    },
    pageB: {
      title: dataB.pageTitle,
      content: dataB.pageContent,
      currentSeo: dataB.currentSeo,
      url: urlB,
      focusKeyword: issue.entityB?.focusKeyword || '',
      postId: resolvedB.wpPostId,
    },
    originalAction: issue.action,
    reason: issue.reason,
    locale: site.wpLocale || 'he',
  });

  return {
    success: true,
    proposal: {
      issueIndex: itemIndex,
      status: 'ready',
      isCannibalization: true,
      urlA,
      urlB,
      postIdA: resolvedA.wpPostId,
      postIdB: resolvedB.wpPostId,
      postTypeA: resolvedA.postType,
      postTypeB: resolvedB.postType,
      titleA: dataA.pageTitle,
      titleB: dataB.pageTitle,
      currentA: dataA.currentSeo ? {
        title: dataA.currentSeo.title || '',
        description: dataA.currentSeo.description || '',
        focusKeyword: issue.entityA?.focusKeyword || '',
      } : { title: '', description: '', focusKeyword: '' },
      currentB: dataB.currentSeo ? {
        title: dataB.currentSeo.title || '',
        description: dataB.currentSeo.description || '',
        focusKeyword: issue.entityB?.focusKeyword || '',
      } : { title: '', description: '', focusKeyword: '' },
      recommendation: fixSuggestion,
    },
  };
}

/**
 * Generate AI recommendation for fixing cannibalization.
 */
async function generateCannibalizationFix({ pageA, pageB, originalAction, reason, locale }) {
  const isHebrew = locale?.startsWith('he');
  
  // Estimate content length for suggestedContentImages
  const contentLengthA = (pageA.content || '').split(/\s+/).length;
  const contentLengthB = (pageB.content || '').split(/\s+/).length;
  const estimatedMergedLength = contentLengthA + contentLengthB;
  
  const prompt = `You are an expert SEO consultant fixing keyword cannibalization between two competing pages.

## Page A
URL: ${pageA.url}
Post ID: ${pageA.postId || 'unknown'}
Title: ${pageA.title}
Current SEO Title: ${pageA.currentSeo?.title || '(not set)'}
Current Meta Description: ${pageA.currentSeo?.description || '(not set)'}
Current Focus Keyword: ${pageA.focusKeyword || '(not set)'}
Content Preview: ${pageA.content?.slice(0, 500) || '(not available)'}
Estimated word count: ~${contentLengthA} words

## Page B
URL: ${pageB.url}
Post ID: ${pageB.postId || 'unknown'}
Title: ${pageB.title}
Current SEO Title: ${pageB.currentSeo?.title || '(not set)'}
Current Meta Description: ${pageB.currentSeo?.description || '(not set)'}
Current Focus Keyword: ${pageB.focusKeyword || '(not set)'}
Content Preview: ${pageB.content?.slice(0, 500) || '(not available)'}
Estimated word count: ~${contentLengthB} words

## Detected Issue
${reason}
Initial recommendation: ${originalAction}

## Your Task
Analyze both pages and provide:
1. Your recommended action (MERGE, CANONICAL, 301_REDIRECT, or DIFFERENTIATE)
2. If DIFFERENTIATE: Specific SEO changes for each page
3. If MERGE, CANONICAL, or 301_REDIRECT: Specify which page should be the primary (kept) using primaryPostId
4. If MERGE: Provide mergedPageChanges with optimized SEO for the combined content
5. Clear target angle/intent to avoid future overlap

${isHebrew ? 'IMPORTANT: Write ALL output in Hebrew - including reasoning, merge instructions, target angles, titles, descriptions, and keywords.' : 'Write in the same language as the page content.'}

Rules for DIFFERENTIATE:
- Give each page a DISTINCT focus keyword that doesn't overlap
- Optimize titles to clearly communicate different angles
- Descriptions should highlight what makes each page unique
- SEO titles: 50-60 characters
- Meta descriptions: 140-160 characters

Rules for MERGE:
- Set primaryPostId to the Post ID of the page with better content/authority
- Provide mergedPageChanges with comprehensive SEO that covers both pages' topics
- Choose the best articleType for the merged content from: seo, blogPost, guide, howTo, listicle, comparison, review, news, tutorial, caseStudy
- Set suggestedContentImages based on estimated merged content length (~${estimatedMergedLength} words):
  * 0 for <500 words
  * 1-2 for 500-1000 words
  * 2-3 for 1000-2000 words
  * 4-5 for >2000 words
- The secondary page will be trashed and redirected to the primary

Rules for CANONICAL or 301_REDIRECT:
- Set primaryPostId to the Post ID of the authoritative page
- Set canonicalTarget to the URL of the authoritative page
- The secondary page will be redirected (301) or marked with canonical tag

Choose your action wisely:
- DIFFERENTIATE: Both pages have unique value, just need clearer targeting
- CANONICAL: One page is clearly more authoritative, set canonical
- 301_REDIRECT: One page is redundant and should redirect
- MERGE: Content should be combined into a single comprehensive page`;

  const result = await generateStructuredResponse({
    system: 'You are an expert SEO consultant specializing in content strategy and keyword cannibalization resolution. Provide actionable, specific recommendations.',
    prompt,
    schema: CannibalizationFixSchema,
    temperature: 0.4,
    operation: 'CANNIBALIZATION_FIX',
    metadata: { pageA: pageA.url, pageB: pageB.url },
  });

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
    
    if (action === 'DIFFERENTIATE') {
      try {
        // Update Page A
        if (p.postIdA && p.recommendation.pageAChanges) {
          const seoA = {
            title: p.recommendation.pageAChanges.newTitle,
            description: p.recommendation.pageAChanges.newDescription,
            focusKeyword: p.recommendation.pageAChanges.newFocusKeyword,
          };
          await updateSeoData(site, p.postIdA, seoA);

          // Generate featured image for Page A
          if (generateFeaturedImages && imageContext) {
            try {
              const imageUrlA = await generateAndUploadFeaturedImage({
                site,
                postId: p.postIdA,
                title: p.recommendation.pageAChanges.newTitle,
                focusKeyword: p.recommendation.pageAChanges.newFocusKeyword,
                targetAngle: p.recommendation.pageAChanges.targetAngle,
                imageContext,
              });
              if (imageUrlA) {
                console.log(`[applyCannibalizationFix] Generated featured image for Page A: ${imageUrlA}`);
              }
            } catch (imgErr) {
              console.warn(`[applyCannibalizationFix] Failed to generate image for Page A:`, imgErr.message);
            }
          }

          // Generate content images for Page A
          const contentCount = p.contentImageCount || 0;
          if (contentCount > 0 && imageContext) {
            try {
              await generateAndInsertContentImages({
                site,
                postId: p.postIdA,
                title: p.recommendation.pageAChanges.newTitle,
                focusKeyword: p.recommendation.pageAChanges.newFocusKeyword,
                targetAngle: p.recommendation.pageAChanges.targetAngle,
                imageContext,
                maxImages: contentCount, // Use per-proposal count
              });
            } catch (imgErr) {
              console.warn(`[applyCannibalizationFix] Failed to generate content images for Page A:`, imgErr.message);
            }
          }
        }

        // Update Page B
        if (p.postIdB && p.recommendation.pageBChanges) {
          const seoB = {
            title: p.recommendation.pageBChanges.newTitle,
            description: p.recommendation.pageBChanges.newDescription,
            focusKeyword: p.recommendation.pageBChanges.newFocusKeyword,
          };
          await updateSeoData(site, p.postIdB, seoB);

          // Generate featured image for Page B
          if (generateFeaturedImages && imageContext) {
            try {
              const imageUrlB = await generateAndUploadFeaturedImage({
                site,
                postId: p.postIdB,
                title: p.recommendation.pageBChanges.newTitle,
                focusKeyword: p.recommendation.pageBChanges.newFocusKeyword,
                targetAngle: p.recommendation.pageBChanges.targetAngle,
                imageContext,
              });
              if (imageUrlB) {
                console.log(`[applyCannibalizationFix] Generated featured image for Page B: ${imageUrlB}`);
              }
            } catch (imgErr) {
              console.warn(`[applyCannibalizationFix] Failed to generate image for Page B:`, imgErr.message);
            }
          }

          // Content images for Page B are currently not supported in the UI
          // (content image count is only specified per-proposal, not per-page)
        }

        results.push({ ...p, status: 'fixed' });
      } catch (err) {
        results.push({ ...p, status: 'error', reason: err.message });
      }
    } else if (action === 'MERGE') {
      // Merge action: Keep the primary page, update SEO, trash the secondary page, create redirect
      try {
        const primaryPostId = p.recommendation.primaryPostId || p.postIdA;
        const secondaryPostId = primaryPostId === p.postIdA ? p.postIdB : p.postIdA;
        const primaryUrl = primaryPostId === p.postIdA ? p.urlA : p.urlB;
        const secondaryUrl = primaryPostId === p.postIdA ? p.urlB : p.urlA;
        
        // Get secondary post for its content (to merge if needed)
        const secondaryPost = await getPost(site, secondaryPostId).catch(() => null);
        const secondaryPostType = secondaryPost?.type || 'post';
        
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
              title: p.recommendation.mergedPageChanges.newTitle,
              focusKeyword: p.recommendation.mergedPageChanges.newFocusKeyword,
              targetAngle: p.recommendation.mergedPageChanges.targetAngle,
              imageContext,
              maxImages: contentCount, // Use per-proposal count from UI
            });
          } catch (imgErr) {
            console.warn(`[applyCannibalizationFix] Failed to generate content images for merged page:`, imgErr.message);
          }
        }

        // Create 301 redirect from secondary URL to primary URL
        try {
          // Extract path from URLs
          const fromPath = new URL(secondaryUrl).pathname;
          const toPath = new URL(primaryUrl).pathname;
          
          await createRedirect(site, {
            source: fromPath,
            target: toPath,
            type: '301',
            enabled: true,
          });
          console.log(`[applyCannibalizationFix] Created redirect: ${fromPath} -> ${toPath}`);
        } catch (redirectErr) {
          console.warn(`[applyCannibalizationFix] Failed to create redirect:`, redirectErr.message);
        }

        // Trash the secondary post
        try {
          await updatePost(site, secondaryPostType, secondaryPostId, { status: 'trash' });
          console.log(`[applyCannibalizationFix] Trashed secondary post: ${secondaryPostId}`);
        } catch (trashErr) {
          console.warn(`[applyCannibalizationFix] Failed to trash secondary post:`, trashErr.message);
        }

        results.push({ ...p, status: 'fixed', mergedTo: primaryUrl, trashedPost: secondaryUrl });
      } catch (err) {
        results.push({ ...p, status: 'error', reason: err.message });
      }
    } else if (action === '301_REDIRECT') {
      // 301 redirect: Keep primary page, set up redirect from secondary
      try {
        const primaryPostId = p.recommendation.primaryPostId || p.postIdA;
        const secondaryPostId = primaryPostId === p.postIdA ? p.postIdB : p.postIdA;
        const primaryUrl = primaryPostId === p.postIdA ? p.urlA : p.urlB;
        const secondaryUrl = primaryPostId === p.postIdA ? p.urlB : p.urlA;
        
        const secondaryPost = await getPost(site, secondaryPostId).catch(() => null);
        const secondaryPostType = secondaryPost?.type || 'post';

        // Create 301 redirect
        const fromPath = new URL(secondaryUrl).pathname;
        const toPath = new URL(primaryUrl).pathname;
        
        await createRedirect(site, {
          source: fromPath,
          target: toPath,
          type: '301',
          enabled: true,
        });
        console.log(`[applyCannibalizationFix] Created 301 redirect: ${fromPath} -> ${toPath}`);

        // Trash the secondary post
        await updatePost(site, secondaryPostType, secondaryPostId, { status: 'trash' });
        console.log(`[applyCannibalizationFix] Trashed redirected post: ${secondaryPostId}`);

        results.push({ ...p, status: 'fixed', redirectedTo: primaryUrl, trashedPost: secondaryUrl });
      } catch (err) {
        results.push({ ...p, status: 'error', reason: err.message });
      }
    } else if (action === 'CANONICAL') {
      // Canonical: Set canonical tag on secondary to point to primary
      try {
        const primaryUrl = p.recommendation.canonicalTarget || p.urlA;
        const secondaryPostId = p.recommendation.canonicalTarget === p.urlA ? p.postIdB : p.postIdA;
        
        // Update SEO with canonical URL
        await updateSeoData(site, secondaryPostId, {
          canonical: primaryUrl,
        });
        console.log(`[applyCannibalizationFix] Set canonical on ${secondaryPostId} to ${primaryUrl}`);

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
  
  return {
    success: fixed > 0 || manualRequired > 0,
    results,
    summary: fixed > 0 
      ? `Fixed ${fixed}/${proposals.length} cannibalization issues`
      : `${manualRequired} issues require manual action`,
  };
}

/**
 * Generate a unique featured image for differentiated content and upload to WordPress.
 */
async function generateAndUploadFeaturedImage({ site, postId, title, focusKeyword, targetAngle, imageContext }) {
  // Build image prompt based on the new focus/angle
  const prompt = buildImagePrompt({
    imageContext,
    keyword: focusKeyword,
    postTitle: title,
    postExcerpt: targetAngle || `Content focused on ${focusKeyword}`,
    imageType: 'featured',
  });

  console.log(`[generateAndUploadFeaturedImage] Generating image for post ${postId}...`);

  // Generate image using Nano Banana (gemini-3-pro-preview)
  const images = await generateImage({
    prompt,
    aspectRatio: '16:9',
    operation: 'CANNIBALIZATION_FIX_IMAGE',
    metadata: { siteId: site.id, postId, focusKeyword },
  });

  if (!images.length) {
    throw new Error('No image generated');
  }

  // Generate alt text based on the focus keyword and target angle
  const altText = await generateImageAltText({ title, focusKeyword, targetAngle, locale: site.wpLocale });

  // Upload to WordPress
  const filename = `cannibalization-fix-${postId}-${Date.now()}.png`;
  const uploadResult = await uploadMediaFromBase64(site, images[0].base64, filename, {
    title: title,
    alt: altText,
    caption: '',
    postId: postId,
  });

  if (!uploadResult?.id) {
    throw new Error('Failed to upload image to WordPress');
  }

  // Determine post type (default to 'post')
  const postData = await getPost(site, postId).catch(() => null);
  const postType = postData?.type || 'post';

  // Set as featured image
  await updatePost(site, postType, postId, {
    featured_media: uploadResult.id,
  });

  return uploadResult.source_url || uploadResult.url;
}

/**
 * Generate a descriptive alt text for the featured image.
 */
async function generateImageAltText({ title, focusKeyword, targetAngle, locale }) {
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
    });

    return response?.trim() || `${focusKeyword} - ${title}`;
  } catch {
    // Fallback to simple alt text
    return `${focusKeyword} - ${title}`.slice(0, 125);
  }
}

/**
 * Generate content images and insert them into post content.
 * Generates up to maxImages (default 3), each costing 2 AI credits.
 */
async function generateAndInsertContentImages({ site, postId, title, focusKeyword, targetAngle, imageContext, maxImages = 3 }) {
  console.log(`[generateAndInsertContentImages] Generating ${maxImages} content images for post ${postId}...`);

  // Get the current post to access its content
  const post = await getPost(site, postId).catch(() => null);
  if (!post) {
    throw new Error(`Post ${postId} not found`);
  }

  const postType = post.type || 'post';
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
      });

      if (images.length > 0) {
        // Generate alt text for this content image
        const altText = await generateImageAltText({
          title: `${title} - ${angle}`,
          focusKeyword,
          targetAngle: angle,
          locale: site.wpLocale,
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

async function generateSeoForPage({ title, content, siteName, locale }) {
  const langInstruction = locale?.startsWith('he') ? 'Write in Hebrew.' : `Write in the language matching locale "${locale}".`;

  return generateStructuredResponse({
    system: `You are an SEO expert. Generate an optimized SEO title and meta description for a webpage. ${langInstruction}
Rules:
- Title: 50-60 characters, include main topic, compelling
- Description: 140-160 characters, actionable, include key value proposition
- Match the tone and language of the existing content
- Do not use clickbait or misleading text`,
    prompt: `Site: ${siteName}
Page title: ${title}
Content excerpt: ${content}

Generate an SEO title and meta description for this page.`,
    schema: SeoGenerationSchema,
    temperature: 0.5,
    operation: 'AGENT_FIX_SEO',
    metadata: { fixType: 'missingSeo', siteName },
  });
}

async function generateSeoForKeyword({ title, content, keyword, position, currentSeoTitle, currentSeoDesc, siteName, locale }) {
  const langInstruction = locale?.startsWith('he') ? 'Write in Hebrew.' : `Write in the language matching locale "${locale}".`;

  return generateStructuredResponse({
    system: `You are an SEO expert. Optimize the SEO title and meta description to better target a specific keyword. ${langInstruction}
Rules:
- Title: 50-60 characters, naturally include the target keyword
- Description: 140-160 characters, naturally include the target keyword, compelling call to action
- If the current SEO is already good, improve it slightly rather than rewriting completely
- Match the language and tone of the existing content
- Do not use clickbait or misleading text`,
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
  });
}

async function generateSeoForCtrGap({ title, content, position, actualCtr, expectedCtr, currentSeoTitle, currentSeoDesc, siteName, locale }) {
  const langInstruction = locale?.startsWith('he') ? 'Write in Hebrew.' : `Write in the language matching locale "${locale}".`;

  return generateStructuredResponse({
    system: `You are an SEO expert. Improve SEO title and meta description to increase click-through rate for an already-ranking page. ${langInstruction}
Rules:
- Title: 50-60 characters, clear benefit, strong but accurate intent match
- Description: 140-160 characters, specific value proposition and soft call to action
- Preserve topical relevance to the existing page; do not change intent
- Improve CTR appeal without clickbait or misleading claims`,
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
  });
}

// ─── Utilities ───────────────────────────────────────────────────────

function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
