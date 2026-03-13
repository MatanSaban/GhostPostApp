/**
 * AI Agent Fix Engine
 * 
 * Generates AI-powered fixes for agent insights and applies them to WordPress
 * sites via the connected plugin. Supports SEO fixes (title/description generation)
 * for missingSeo and keywordStrikeZone insights.
 * 
 * Flow: generateInsightPreview → user reviews → applyInsightFix
 */

import { generateStructuredResponse } from '@/lib/ai/gemini.js';
import { updateSeoData, getSeoData, getPost } from '@/lib/wp-api-client.js';
import prisma from '@/lib/prisma';
import { z } from 'zod';

// ─── Fixable Types ───────────────────────────────────────────────────

const FIXABLE_TYPES = new Set(['missingSeo', 'keywordStrikeZone']);

/**
 * Extract the insight type from a titleKey like 'agent.insights.missingSeo.title'
 */
function getInsightType(titleKey) {
  return titleKey?.match(/agent\.insights\.(\w+)\.title/)?.[1] || null;
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

// ─── Entity Lookup Helper ────────────────────────────────────────────

async function resolveEntityToWpPost(siteId, { entityId, url }) {
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

  if (!entity?.externalId) return null;

  return {
    wpPostId: entity.externalId,
    postType: entity.entityType?.slug || 'page',
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
    default:
      return { success: false, error: `Insight type "${type}" is not fixable` };
  }
}

/**
 * Apply user-approved proposals to WordPress.
 */
export async function applyInsightFix(insight, site, proposals) {
  const type = getInsightType(insight.titleKey);
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
      const resolved = await resolveEntityToWpPost(site.id, { entityId, url: page.url });
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
  const resolved = await resolveEntityToWpPost(site.id, { entityId, url: page.url });
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
    const resolved = await resolveEntityToWpPost(site.id, { url });
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

  const resolved = await resolveEntityToWpPost(site.id, { url });
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

// ─── Utilities ───────────────────────────────────────────────────────

function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
