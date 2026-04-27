/**
 * Sitemap Delta Sync
 * 
 * Lightweight daily sync for non-plugin sites.
 * Fetches sitemaps, diffs against existing entities, and queues
 * new/updated URLs for async scraping (no synchronous crawling).
 */

import prisma from '@/lib/prisma';

const USER_AGENT = 'GhostSEO-Platform/1.0';
const FETCH_TIMEOUT = 30000; // 30s per sitemap fetch
const MAX_CHILD_SITEMAPS = 50; // Safety limit for recursive index parsing

// ─── Recursive Sitemap Parser ───────────────────────────────────────

/**
 * Fetch and parse all sitemap URLs for a site, following sitemap indexes recursively.
 * 
 * Discovery order: robots.txt → /sitemap.xml → /wp-sitemap.xml → /sitemap_index.xml
 * Returns a flat array of { url, lastmod } entries.
 * 
 * @param {string} siteUrl - Base site URL (e.g. "https://example.com")
 * @returns {Promise<Array<{ url: string, lastmod: string|null }>>}
 */
export async function fetchAndParseSitemap(siteUrl) {
  const sitemapUrls = await discoverSitemapUrls(siteUrl);
  if (sitemapUrls.length === 0) {
    console.log(`[SitemapDelta] No sitemaps found for ${siteUrl}`);
    return [];
  }

  const allEntries = [];
  const visited = new Set();

  for (const sitemapUrl of sitemapUrls) {
    await parseSitemapRecursive(sitemapUrl, allEntries, visited, 0);
  }

  // Deduplicate by URL (keep last occurrence which may have newer lastmod)
  const urlMap = new Map();
  for (const entry of allEntries) {
    urlMap.set(entry.url, entry);
  }
  return Array.from(urlMap.values());
}

/**
 * Discover all root sitemap URLs for a site.
 */
export async function discoverSitemapUrls(siteUrl) {
  const discovered = new Set();

  // 1. robots.txt
  try {
    const resp = await fetch(`${siteUrl}/robots.txt`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });
    if (resp.ok) {
      const text = await resp.text();
      for (const match of text.matchAll(/^Sitemap:\s*(.+)$/gmi)) {
        discovered.add(match[1].trim());
      }
    }
  } catch { /* ignore */ }

  // 2. Common fallback patterns (only if robots.txt didn't find any)
  if (discovered.size === 0) {
    const fallbacks = [
      `${siteUrl}/sitemap.xml`,
      `${siteUrl}/wp-sitemap.xml`,
      `${siteUrl}/sitemap_index.xml`,
      `${siteUrl}/sitemap-index.xml`,
      `${siteUrl}/server-sitemap-index.xml`,
    ];
    for (const url of fallbacks) {
      const ok = await probeSitemap(url);
      if (ok) {
        discovered.add(url);
        break; // One valid root is enough
      }
    }
  }

  return Array.from(discovered);
}

/**
 * Quick HEAD/GET check if a URL is a valid sitemap.
 */
async function probeSitemap(url) {
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    if (!resp.ok) return false;
    const text = await resp.text();
    return text.includes('<urlset') || text.includes('<sitemapindex');
  } catch {
    return false;
  }
}

/**
 * Recursively parse a sitemap URL. If it's an index, follow child sitemaps.
 */
async function parseSitemapRecursive(url, entries, visited, depth) {
  if (visited.has(url) || depth > 3) return; // Max 3 levels of nesting
  visited.add(url);

  let content;
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
      cache: 'no-store',
    });
    if (!resp.ok) return;
    content = await resp.text();
  } catch (e) {
    console.error(`[SitemapDelta] Failed to fetch ${url}:`, e.message);
    return;
  }

  // Sitemap index → recurse into children
  if (content.includes('<sitemapindex')) {
    const childUrls = [];
    for (const match of content.matchAll(/<sitemap>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/sitemap>/gi)) {
      childUrls.push(match[1].trim());
    }
    const limited = childUrls.slice(0, MAX_CHILD_SITEMAPS);
    for (const childUrl of limited) {
      await parseSitemapRecursive(childUrl, entries, visited, depth + 1);
    }
    return;
  }

  // Regular sitemap → extract URL entries
  if (content.includes('<urlset')) {
    for (const match of content.matchAll(/<url>([\s\S]*?)<\/url>/gi)) {
      const block = match[1];
      const locMatch = block.match(/<loc>([^<]+)<\/loc>/);
      if (!locMatch) continue;

      const lastmodMatch = block.match(/<lastmod>([^<]+)<\/lastmod>/);
      entries.push({
        url: locMatch[1].trim(),
        lastmod: lastmodMatch ? lastmodMatch[1].trim() : null,
      });
    }
  }
}

// ─── Diffing Logic ──────────────────────────────────────────────────

/**
 * Compare sitemap entries against existing DB entities and return
 * arrays of new/updated URLs to queue for scraping.
 * 
 * - NEW: URL exists in sitemap but not in any SiteEntity for this site.
 * - UPDATED: URL exists in both, but sitemap lastmod is newer than entity updatedAt.
 * 
 * @param {string} siteId
 * @param {Array<{ url: string, lastmod: string|null }>} sitemapEntries
 * @returns {Promise<{ newUrls: Array, updatedUrls: Array }>}
 */
export async function diffSitemapAgainstDb(siteId, sitemapEntries) {
  // Load all existing entity URLs for this site
  const existingEntities = await prisma.siteEntity.findMany({
    where: { siteId },
    select: { id: true, url: true, updatedAt: true },
  });

  // Build a map: url → { id, updatedAt }
  const entityByUrl = new Map();
  for (const e of existingEntities) {
    if (e.url) entityByUrl.set(e.url, { id: e.id, updatedAt: e.updatedAt });
  }

  const newUrls = [];
  const updatedUrls = [];

  for (const entry of sitemapEntries) {
    const existing = entityByUrl.get(entry.url);

    if (!existing) {
      newUrls.push(entry);
      continue;
    }

    // If sitemap has lastmod and it's newer than our record, mark as updated
    if (entry.lastmod) {
      const sitemapDate = new Date(entry.lastmod);
      if (!isNaN(sitemapDate.getTime()) && sitemapDate > existing.updatedAt) {
        updatedUrls.push({ ...entry, entityId: existing.id });
      }
    }
  }

  return { newUrls, updatedUrls };
}

// ─── Queue Management ───────────────────────────────────────────────

/**
 * Enqueue new/updated URLs into ScrapeQueue for async processing.
 * Skips URLs that already have a PENDING entry to avoid duplicates.
 * 
 * @param {string} siteId
 * @param {Array} newUrls - [{ url, lastmod }]
 * @param {Array} updatedUrls - [{ url, lastmod, entityId }]
 * @param {string|null} entityTypeId - Entity type for NEW entries (optional)
 * @returns {Promise<{ queued: number, skipped: number }>}
 */
export async function enqueueForScraping(siteId, newUrls, updatedUrls, entityTypeId = null) {
  // Get existing PENDING URLs for this site to avoid duplicates
  const pendingItems = await prisma.scrapeQueue.findMany({
    where: { siteId, status: 'PENDING' },
    select: { url: true },
  });
  const pendingSet = new Set(pendingItems.map(i => i.url));

  const toCreate = [];

  for (const entry of newUrls) {
    if (pendingSet.has(entry.url)) continue;
    toCreate.push({
      siteId,
      url: entry.url,
      lastmod: entry.lastmod || null,
      action: 'NEW',
      status: 'PENDING',
      entityTypeId: entityTypeId || null,
    });
  }

  for (const entry of updatedUrls) {
    if (pendingSet.has(entry.url)) continue;
    toCreate.push({
      siteId,
      url: entry.url,
      lastmod: entry.lastmod || null,
      action: 'UPDATED',
      status: 'PENDING',
      entityId: entry.entityId,
    });
  }

  if (toCreate.length > 0) {
    // Prisma MongoDB doesn't support createMany; use a loop
    for (const item of toCreate) {
      await prisma.scrapeQueue.create({ data: item });
    }
  }

  return {
    queued: toCreate.length,
    skipped: (newUrls.length + updatedUrls.length) - toCreate.length,
  };
}

// ─── Queue Processing (called by worker cron) ──────────────────────

/**
 * Process a batch of PENDING scrape queue items.
 * Fetches each page, extracts metadata, and creates/updates entities.
 * 
 * @param {number} batchSize - Max items to process (default 20)
 * @returns {Promise<{ processed: number, failed: number }>}
 */
export async function processScrapeQueue(batchSize = 20) {
  // Fetch oldest PENDING items (max 3 attempts)
  const items = await prisma.scrapeQueue.findMany({
    where: {
      status: 'PENDING',
      attempts: { lt: 3 },
    },
    orderBy: { createdAt: 'asc' },
    take: batchSize,
    include: { site: { select: { id: true, url: true } } },
  });

  if (items.length === 0) return { processed: 0, failed: 0 };

  let processed = 0;
  let failed = 0;

  for (const item of items) {
    // Mark as processing
    await prisma.scrapeQueue.update({
      where: { id: item.id },
      data: { status: 'PROCESSING', attempts: { increment: 1 } },
    });

    try {
      const metadata = await extractPageMetadata(item.url);

      if (item.action === 'NEW') {
        await createEntityFromScrape(item, metadata);
      } else {
        await updateEntityFromScrape(item, metadata);
      }

      await prisma.scrapeQueue.update({
        where: { id: item.id },
        data: { status: 'COMPLETED', processedAt: new Date() },
      });
      processed++;
    } catch (e) {
      console.error(`[ScrapeQueue] Failed to process ${item.url}:`, e.message);
      const newStatus = item.attempts + 1 >= 3 ? 'FAILED' : 'PENDING';
      await prisma.scrapeQueue.update({
        where: { id: item.id },
        data: { status: newStatus, error: e.message },
      });
      failed++;
    }
  }

  return { processed, failed };
}

// ─── Page Metadata Extraction (lightweight version) ─────────────────

/**
 * Fetch a page and extract basic metadata for entity creation/update.
 * Lighter than the full extractPageMetadata in scan/route.js.
 */
async function extractPageMetadata(url) {
  const resp = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html',
    },
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  });

  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

  const html = await resp.text();

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
  const canonicalMatch = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)
    || html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/i);
  const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
  const publishDateMatch = html.match(/<meta[^>]*property=["']article:published_time["'][^>]*content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']article:published_time["']/i);

  // Strip HTML tags from H1
  const h1Raw = h1Match ? h1Match[1].replace(/<[^>]+>/g, '').trim() : null;

  return {
    title: cleanTitle(titleMatch ? titleMatch[1].trim() : null),
    h1: h1Raw,
    description: descMatch ? descMatch[1].trim() : null,
    canonicalUrl: canonicalMatch ? canonicalMatch[1].trim() : null,
    featuredImage: ogImageMatch ? ogImageMatch[1].trim() : null,
    publishedAt: publishDateMatch ? publishDateMatch[1].trim() : null,
  };
}

/**
 * Clean page title by removing site name suffix.
 */
function cleanTitle(title) {
  if (!title) return null;
  const separators = [' | ', ' - ', ' – ', ' :: ', ' » ', ' · '];
  for (const sep of separators) {
    if (title.includes(sep)) {
      const parts = title.split(sep);
      if (parts[0].trim().length > 2) return parts[0].trim();
    }
  }
  return title;
}

/**
 * Extract slug from a URL.
 */
function extractSlug(url) {
  try {
    const path = new URL(url).pathname.replace(/\/$/, '');
    const segments = path.split('/').filter(Boolean);
    return segments.length > 0 ? segments[segments.length - 1] : '';
  } catch {
    return null;
  }
}

/**
 * Convert slug to display title.
 */
function slugToTitle(slug) {
  if (!slug || slug === '') return 'Homepage';
  return slug
    .replace(/-/g, ' ')
    .replace(/_/g, ' ')
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ─── Entity CRUD from Scrape ────────────────────────────────────────

async function createEntityFromScrape(item, metadata) {
  const slug = extractSlug(item.url);
  if (slug === null) throw new Error('Invalid URL');

  // Determine entity type: use item.entityTypeId if set, otherwise try to find a default
  let entityTypeId = item.entityTypeId;
  if (!entityTypeId) {
    const defaultType = await prisma.siteEntityType.findFirst({
      where: { siteId: item.siteId, isEnabled: true },
      orderBy: { sortOrder: 'asc' },
    });
    if (!defaultType) throw new Error('No enabled entity type for this site');
    entityTypeId = defaultType.id;
  }

  // Check for duplicate slug within the same type
  const existing = await prisma.siteEntity.findUnique({
    where: { siteId_entityTypeId_slug: { siteId: item.siteId, entityTypeId, slug } },
  });
  if (existing) {
    // Entity already exists by slug - treat as update instead
    await prisma.siteEntity.update({
      where: { id: existing.id },
      data: buildEntityUpdate(metadata),
    });
    return;
  }

  await prisma.siteEntity.create({
    data: {
      siteId: item.siteId,
      entityTypeId,
      title: metadata.title || metadata.h1 || slugToTitle(slug),
      slug,
      url: item.url,
      status: 'PUBLISHED',
      featuredImage: metadata.featuredImage || null,
      metadata: { source: 'sitemap-delta-sync', needsDeepCrawl: false },
      seoData: metadata.description ? { metaDescription: metadata.description } : undefined,
      publishedAt: metadata.publishedAt ? new Date(metadata.publishedAt) : undefined,
    },
  });
}

async function updateEntityFromScrape(item, metadata) {
  if (!item.entityId) return;

  await prisma.siteEntity.update({
    where: { id: item.entityId },
    data: buildEntityUpdate(metadata),
  });
}

function buildEntityUpdate(metadata) {
  const data = {};
  if (metadata.title) data.title = metadata.title;
  if (metadata.featuredImage) data.featuredImage = metadata.featuredImage;
  if (metadata.description) {
    data.seoData = { metaDescription: metadata.description };
  }
  return data;
}
