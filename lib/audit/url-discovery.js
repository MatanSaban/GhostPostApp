/**
 * URL Discovery — Comprehensive Multi-Source Strategy
 *
 * Discovers all URLs to audit by combining multiple sources:
 *
 * 1. Sitemap discovery (robots.txt → sitemap index → child sitemaps)
 *    Tries: robots.txt Sitemap: directives, then 10+ common sitemap paths
 *    Parses <sitemapindex> recursively and all <urlset> entries
 *
 * 2. Ghost Post Plugin DB entities (all synced content with URLs)
 *
 * 3. Ghost Post SiteSitemap records (previously scanned sitemaps in DB)
 *
 * 4. WordPress REST API (posts + pages + custom post types)
 *
 * 5. Multi-level homepage crawl (2-level deep link extraction)
 *
 * Sources are tried in priority order. If the higher-priority source
 * yields enough URLs, lower sources are skipped.
 * The homepage is always included as the first URL.
 */

import prisma from '@/lib/prisma';
import * as cheerio from 'cheerio';

const MAX_URLS = 50;
const FETCH_TIMEOUT = 12000;

function normalizeUrl(url) {
  if (!url) return '';
  if (!url.startsWith('http')) url = 'https://' + url;
  return url.replace(/\/+$/, '');
}

function extractDomain(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

async function safeFetch(url, timeout = FETCH_TIMEOUT) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'GhostPost-SiteAuditor/2.0' },
      redirect: 'follow',
    });
    clearTimeout(tid);
    return res;
  } catch (err) {
    clearTimeout(tid);
    throw err;
  }
}

function dedupeWithHome(homeUrl, urls) {
  const unique = [...new Set([homeUrl, ...urls.filter(u => u && u !== homeUrl && !isIgnoredPath(u))])];
  return unique.slice(0, MAX_URLS);
}

/**
 * Paths that should never be crawled — CDN internals, feeds, admin, etc.
 */
const IGNORED_PATH_PATTERNS = [
  /\/cdn-cgi\//i,           // Cloudflare internal (email protection, challenges, trace)
  /\/wp-admin(\/|$)/i,      // WordPress admin
  /\/wp-login\.php/i,       // WordPress login
  /\/wp-json(\/|$)/i,       // WordPress REST API endpoints
  /\/feed(\/|$)/i,          // RSS/Atom feeds
  /\/xmlrpc\.php/i,         // XML-RPC
  /\/wp-content\/uploads\//i, // Direct media files
  /\/(cart|checkout|my-account)(\/|$)/i, // WooCommerce transactional pages
  /\/tag\//i,               // Tag archives (low SEO value for audit)
  /[?&](replytocom|share)=/i, // Comment/share query params
];

function isIgnoredPath(url) {
  try {
    const pathname = new URL(url).pathname;
    return IGNORED_PATH_PATTERNS.some(re => re.test(pathname) || re.test(url));
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
// STRATEGY 1: Comprehensive Sitemap Discovery
// ═══════════════════════════════════════════════════════════

/**
 * Common sitemap paths to try — covers WordPress (Yoast, RankMath, AIOSEO,
 * core wp-sitemap), generic, Shopify, Wix, Squarespace, etc.
 */
const SITEMAP_PATHS = [
  '/sitemap.xml',
  '/sitemap_index.xml',
  '/wp-sitemap.xml',
  '/sitemap-index.xml',
  '/post-sitemap.xml',
  '/page-sitemap.xml',
  '/sitemap-0.xml',
  '/sitemap-1.xml',
  '/sitemaps/sitemap-index.xml',
  '/sitemap/sitemap-index.xml',
];

/**
 * Parse robots.txt for Sitemap: directives
 */
async function getSitemapUrlsFromRobots(baseUrl) {
  const sitemapUrls = [];
  try {
    const res = await safeFetch(`${baseUrl}/robots.txt`, 8000);
    if (!res.ok) return sitemapUrls;
    const text = await res.text();

    for (const line of text.split('\n')) {
      const match = line.match(/^sitemap:\s*(.+)/i);
      if (match) {
        const url = match[1].trim();
        if (url.startsWith('http')) sitemapUrls.push(url);
      }
    }
  } catch { /* robots.txt unavailable */ }
  return sitemapUrls;
}

/**
 * Parse a single sitemap XML — returns page URLs found.
 * If it's a sitemap index, returns the child sitemap URLs in `childSitemaps`.
 */
function parseSitemapXml(xml) {
  const pageUrls = [];
  const childSitemaps = [];

  try {
    const $ = cheerio.load(xml, { xmlMode: true });

    if (xml.includes('<sitemapindex')) {
      $('sitemap > loc').each((_, el) => childSitemaps.push($(el).text().trim()));
    }
    if (xml.includes('<urlset') || xml.includes('<url>')) {
      $('url > loc').each((_, el) => pageUrls.push($(el).text().trim()));
    }
  } catch { /* parse error */ }

  return { pageUrls, childSitemaps };
}

/**
 * Full sitemap discovery — robots.txt + common paths + recursive index parsing
 */
async function discoverFromSitemap(baseUrl) {
  const allUrls = new Set();
  const processedSitemaps = new Set();

  // Collect candidate sitemap URLs
  const candidates = new Set();

  // 1. From robots.txt
  const robotsSitemaps = await getSitemapUrlsFromRobots(baseUrl);
  for (const u of robotsSitemaps) candidates.add(u);

  // 2. Common sitemap paths
  for (const path of SITEMAP_PATHS) {
    candidates.add(`${baseUrl}${path}`);
  }

  console.log(`[URLDiscovery] Trying ${candidates.size} sitemap candidates for ${baseUrl}`);

  /**
   * Fetch and parse a single sitemap, recursing into child sitemaps
   */
  async function processSitemap(sitemapUrl, depth = 0) {
    if (processedSitemaps.has(sitemapUrl) || depth > 2) return;
    processedSitemaps.add(sitemapUrl);

    try {
      const res = await safeFetch(sitemapUrl);
      if (!res.ok) return;

      const contentType = res.headers.get('content-type') || '';
      const text = await res.text();

      // Skip non-XML responses (some servers return HTML 200 for missing files)
      if (!text.includes('<') || (!text.includes('<urlset') && !text.includes('<sitemapindex') && !text.includes('<url'))) {
        return;
      }

      const { pageUrls, childSitemaps } = parseSitemapXml(text);

      for (const u of pageUrls) {
        allUrls.add(u);
      }

      // Recursively process child sitemaps (from sitemap index)
      for (const childUrl of childSitemaps) {
        if (allUrls.size >= MAX_URLS) break;
        await processSitemap(childUrl, depth + 1);
      }
    } catch { /* sitemap fetch failed */ }
  }

  // Process all candidates — stop early if we already have enough
  for (const candidate of candidates) {
    if (allUrls.size >= MAX_URLS) break;
    await processSitemap(candidate);
    // If a sitemap yielded results, don't try the remaining common paths
    if (allUrls.size > 0 && !robotsSitemaps.includes(candidate)) break;
  }

  console.log(`[URLDiscovery] Sitemap discovery found ${allUrls.size} URLs`);
  return [...allUrls].slice(0, MAX_URLS);
}

// ═══════════════════════════════════════════════════════════
// STRATEGY 2: Ghost Post Plugin — Live API + DB Entities
// ═══════════════════════════════════════════════════════════

/**
 * Fetch all post/page URLs from the connected WordPress site
 * via the Ghost Post plugin REST API (authenticated HMAC).
 * Falls back to local DB entities if the API call fails.
 */
async function discoverFromPlugin(siteId) {
  const urls = [];

  // Load the full site record with plugin credentials
  let site;
  try {
    site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, url: true, siteKey: true, siteSecret: true, connectionStatus: true },
    });
  } catch (err) {
    console.warn('[URLDiscovery] Failed to load site record:', err.message);
  }

  // ── Live plugin API call (HMAC-authenticated) ──
  if (site?.siteKey && site?.siteSecret) {
    const baseUrl = site.url.replace(/\/$/, '');
    const { createHmacHeaders } = await loadHmacHelper();

    // Fetch posts, pages, and also try to discover custom post types
    const endpoints = ['/posts', '/pages'];

    // Try to get site info first to discover CPT endpoints
    try {
      const siteInfoHeaders = createHmacHeaders(site.siteKey, site.siteSecret, '');
      const siteInfoRes = await fetch(`${baseUrl}/wp-json/ghost-post/v1/site-info`, {
        headers: { ...siteInfoHeaders, 'User-Agent': 'GhostPost-SiteAuditor/2.0' },
        signal: AbortSignal.timeout(10000),
      });
      if (siteInfoRes.ok) {
        const siteInfo = await siteInfoRes.json();
        const postTypes = siteInfo.postTypes || [];
        for (const pt of postTypes) {
          const slug = pt.slug || pt.restBase;
          if (slug && !['post', 'page', 'attachment', 'revision', 'nav_menu_item', 'wp_block', 'wp_template', 'wp_template_part', 'wp_navigation'].includes(slug)) {
            endpoints.push(`/cpt/${slug}`);
          }
        }
        console.log(`[URLDiscovery] Plugin site-info: ${postTypes.length} post types, endpoints: ${endpoints.join(', ')}`);
      }
    } catch (err) {
      console.warn('[URLDiscovery] Plugin site-info failed:', err.message);
    }

    for (const endpoint of endpoints) {
      try {
        const apiUrl = `${baseUrl}/wp-json/ghost-post/v1${endpoint}?per_page=100&full=false`;
        const headers = createHmacHeaders(site.siteKey, site.siteSecret, '');

        const res = await fetch(apiUrl, {
          headers: { ...headers, 'User-Agent': 'GhostPost-SiteAuditor/2.0' },
          signal: AbortSignal.timeout(15000),
        });

        if (res.ok) {
          const items = await res.json();
          if (Array.isArray(items)) {
            for (const item of items) {
              const link = item.link || item.url;
              if (link) urls.push(link);
            }
            console.log(`[URLDiscovery] Plugin API ${endpoint}: ${items.length} items`);
          }
        } else {
          console.warn(`[URLDiscovery] Plugin API ${endpoint}: HTTP ${res.status}`);
        }
      } catch (err) {
        console.warn(`[URLDiscovery] Plugin API ${endpoint} failed:`, err.message);
      }
    }

    if (urls.length > 0) {
      console.log(`[URLDiscovery] Plugin API total: ${urls.length} URLs`);
      return [...new Set(urls)].slice(0, MAX_URLS);
    }
    console.log('[URLDiscovery] Plugin API returned 0 URLs across all endpoints');
  } else {
    console.log(`[URLDiscovery] No plugin credentials for site ${siteId}`);
  }

  // ── Fallback: local DB entities (from previous sync) ──
  try {
    const entities = await prisma.siteEntity.findMany({
      where: { siteId, url: { not: null } },
      select: { url: true, status: true },
      orderBy: { publishedAt: 'desc' },
      take: MAX_URLS * 2,
    });

    const published = entities.filter(e => e.status === 'PUBLISHED' && e.url);
    const withUrl = published.length > 0 ? published : entities.filter(e => e.url);
    console.log(`[URLDiscovery] Plugin DB entities: ${withUrl.length} URLs (of ${entities.length} total)`);
    return withUrl.map(e => e.url);
  } catch (err) {
    console.warn('[URLDiscovery] Plugin entity DB query failed:', err.message);
    return [];
  }
}

/**
 * Lazy-load the HMAC header helper to avoid circular dependency
 */
async function loadHmacHelper() {
  // Build HMAC headers the same way wp-api-client does
  const crypto = await import('crypto');
  return {
    createHmacHeaders(siteKey, siteSecret, payload) {
      const timestamp = Math.floor(Date.now() / 1000);
      const data = `${timestamp}.${payload}`;
      const signature = crypto.createHmac('sha256', siteSecret).update(data).digest('hex');
      return {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-GP-Site-Key': siteKey,
        'X-GP-Timestamp': timestamp.toString(),
        'X-GP-Signature': signature,
      };
    },
  };
}

// ═══════════════════════════════════════════════════════════
// STRATEGY 3: Ghost Post DB — Stored Sitemaps
// ═══════════════════════════════════════════════════════════

async function discoverFromStoredSitemaps(siteId, baseUrl) {
  try {
    // Check if we have SiteSitemap records with URLs
    const storedSitemaps = await prisma.siteSitemap.findMany({
      where: { siteId, scanStatus: 'COMPLETED' },
      select: { url: true, content: true, isIndex: true },
      orderBy: { lastScannedAt: 'desc' },
    });

    if (storedSitemaps.length === 0) return [];

    const allUrls = [];

    for (const sm of storedSitemaps) {
      if (sm.isIndex || !sm.content) continue;
      const { pageUrls } = parseSitemapXml(sm.content);
      allUrls.push(...pageUrls);
      if (allUrls.length >= MAX_URLS) break;
    }

    // If stored sitemaps had no content, re-fetch them
    if (allUrls.length === 0) {
      for (const sm of storedSitemaps) {
        try {
          const res = await safeFetch(sm.url);
          if (!res.ok) continue;
          const xml = await res.text();
          const { pageUrls } = parseSitemapXml(xml);
          allUrls.push(...pageUrls);
          if (allUrls.length >= MAX_URLS) break;
        } catch { /* skip */ }
      }
    }

    console.log(`[URLDiscovery] Stored sitemaps found ${allUrls.length} URLs`);
    return [...new Set(allUrls)].slice(0, MAX_URLS);
  } catch (err) {
    console.warn('[URLDiscovery] Stored sitemap query failed:', err.message);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════
// STRATEGY 4: WordPress REST API
// ═══════════════════════════════════════════════════════════

async function discoverFromWpApi(baseUrl) {
  const urls = [];
  const endpoints = [
    '/wp-json/wp/v2/posts?per_page=50&_fields=link',
    '/wp-json/wp/v2/pages?per_page=50&_fields=link',
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await safeFetch(`${baseUrl}${endpoint}`);
      if (!res.ok) continue;
      const items = await res.json();
      if (Array.isArray(items)) {
        for (const item of items) {
          if (item.link) urls.push(item.link);
        }
      }
    } catch { /* skip endpoint */ }
  }

  return [...new Set(urls)].slice(0, MAX_URLS);
}

// ═══════════════════════════════════════════════════════════
// STRATEGY 5: Multi-Level Crawl (fallback)
// ═══════════════════════════════════════════════════════════

const MAX_SECOND_LEVEL_PAGES = 10;

async function discoverFromCrawl(baseUrl) {
  const urls = new Set();
  const visited = new Set([baseUrl]);
  const domain = extractDomain(baseUrl);

  function extractLinks(html, fromUrl) {
    const found = [];
    const $ = cheerio.load(html);

    $('a[href]').each((_, el) => {
      let href = $(el).attr('href') || '';
      href = href.split('#')[0].split('?')[0].replace(/\/+$/, '');
      if (!href) return;

      try {
        href = new URL(href, fromUrl).href.replace(/\/+$/, '');
      } catch { return; }

      try {
        const parsed = new URL(href);
        const hDomain = parsed.hostname;
        if (hDomain === domain || hDomain === `www.${domain}` || `www.${hDomain}` === domain) {
          if (!/\.(jpg|jpeg|png|gif|svg|webp|pdf|zip|css|js|xml|json|ico|woff2?)$/i.test(parsed.pathname)) {
            if (!isIgnoredPath(href) && !visited.has(href)) {
              found.push(href);
            }
          }
        }
      } catch { /* invalid URL */ }
    });

    return found;
  }

  // Level 1: Crawl the homepage
  let firstLevelUrls = [];
  try {
    const res = await safeFetch(baseUrl);
    if (!res.ok) return [];
    const html = await res.text();
    firstLevelUrls = extractLinks(html, baseUrl);
    for (const u of firstLevelUrls) {
      urls.add(u);
      visited.add(u);
    }
  } catch { /* homepage crawl failed */ }

  if (urls.size >= MAX_URLS) return [...urls].slice(0, MAX_URLS);

  // Level 2: Crawl inner pages for deeper links
  const secondLevelBatch = firstLevelUrls.slice(0, MAX_SECOND_LEVEL_PAGES);
  const secondLevelFetches = secondLevelBatch.map(async (pageUrl) => {
    try {
      const res = await safeFetch(pageUrl);
      if (!res.ok) return;
      const html = await res.text();
      const newLinks = extractLinks(html, pageUrl);
      for (const u of newLinks) {
        if (urls.size >= MAX_URLS) break;
        urls.add(u);
        visited.add(u);
      }
    } catch { /* inner page crawl failed */ }
  });
  await Promise.allSettled(secondLevelFetches);

  return [...urls].slice(0, MAX_URLS);
}

// ═══════════════════════════════════════════════════════════
// MAIN DISCOVERY FUNCTION
// ═══════════════════════════════════════════════════════════

/**
 * Discover URLs to audit using a priority strategy.
 * Each strategy is tried in order; if it yields URLs, we use them.
 *
 * @param {Object} site - Site record from DB ({ id, url, connectionStatus })
 * @returns {{ urls: string[], method: string, hasSitemap: boolean }}
 */
export async function discoverUrls(site) {
  const homeUrl = normalizeUrl(site.url);
  let hasSitemap = false;
  console.log(`[URLDiscovery] Starting URL discovery for ${homeUrl} (connection: ${site.connectionStatus})`);

  // ── 1. Sitemap discovery (most comprehensive for any site) ──
  const sitemapUrls = await discoverFromSitemap(homeUrl);
  if (sitemapUrls.length > 1) {
    hasSitemap = true;
    console.log(`[URLDiscovery] ✓ Sitemap yielded ${sitemapUrls.length} URLs`);
    return { urls: dedupeWithHome(homeUrl, sitemapUrls), method: 'sitemap', hasSitemap };
  }
  console.log(`[URLDiscovery] ✗ No sitemap found`);

  // ── 2. Ghost Post Plugin: Live API + DB entities ──
  if (site.connectionStatus === 'CONNECTED') {
    const pluginUrls = await discoverFromPlugin(site.id);
    if (pluginUrls.length > 0) {
      console.log(`[URLDiscovery] ✓ Plugin yielded ${pluginUrls.length} URLs`);
      return { urls: dedupeWithHome(homeUrl, pluginUrls), method: 'plugin', hasSitemap };
    }
    console.log(`[URLDiscovery] ✗ Plugin returned 0 URLs`);
  }

  // ── 3. Stored sitemaps from Ghost Post DB ──
  const storedUrls = await discoverFromStoredSitemaps(site.id, homeUrl);
  if (storedUrls.length > 0) {
    hasSitemap = true;
    console.log(`[URLDiscovery] ✓ Stored sitemaps yielded ${storedUrls.length} URLs`);
    return { urls: dedupeWithHome(homeUrl, storedUrls), method: 'stored-sitemap', hasSitemap };
  }

  // ── 4. WordPress REST API (public, unauthenticated) ──
  const wpUrls = await discoverFromWpApi(homeUrl);
  if (wpUrls.length > 0) {
    console.log(`[URLDiscovery] ✓ WP REST API yielded ${wpUrls.length} URLs`);
    return { urls: dedupeWithHome(homeUrl, wpUrls), method: 'wp-api', hasSitemap };
  }
  console.log(`[URLDiscovery] ✗ WP REST API returned 0 URLs`);

  // ── 5. Multi-level crawl (last resort) ──
  const crawledUrls = await discoverFromCrawl(homeUrl);
  console.log(`[URLDiscovery] ${crawledUrls.length > 0 ? '✓' : '✗'} Crawl yielded ${crawledUrls.length} URLs`);
  return { urls: dedupeWithHome(homeUrl, crawledUrls), method: 'crawl', hasSitemap };
}
