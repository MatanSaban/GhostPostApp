import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { generateTextResponse } from '@/lib/ai/gemini';

const SESSION_COOKIE = 'user_session';

/**
 * Use AI to extract the business/website name from HTML content
 */
async function extractSiteNameWithAI(html, hostname, { accountId, userId } = {}) {
  try {
    // Extract relevant text from HTML for AI analysis
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || '';
    const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1]?.trim() || '';
    const ogSiteName = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i)?.[1]?.trim() || '';
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1]?.trim() || '';
    const metaDescription = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1]?.trim() || '';
    
    // Extract logo alt text if available
    const logoAlt = html.match(/<img[^>]*(?:class|id)=["'][^"']*logo[^"']*["'][^>]*alt=["']([^"']+)["']/i)?.[1]?.trim() || '';
    
    // Extract footer copyright text
    const copyright = html.match(/(?:©|copyright)[^<]*?(\d{4})?[^<]*?([A-Za-z\u0590-\u05FF\s]+)/i)?.[2]?.trim() || '';

    const prompt = `Analyze the following website data and determine the actual business or website name. Return ONLY the name, nothing else.

URL/Domain: ${hostname}
Page Title: ${title}
H1 Heading: ${h1}
OG Site Name: ${ogSiteName}
OG Title: ${ogTitle}
Meta Description: ${metaDescription}
Logo Alt Text: ${logoAlt}
Copyright Text: ${copyright}

Rules:
- Return the clean business/brand name without taglines, descriptions, or page indicators
- Remove common suffixes like "- Home", "| Official Site", "- Welcome"
- If it's a Hebrew site, return the Hebrew name
- If multiple names are found, prefer the most specific brand/business name
- Do not include generic words like "Home", "Welcome", "Official"
- Return just the name, no explanations`;

    const extractedName = await generateTextResponse({
      system: 'You are an expert at identifying business names from website data. You always respond with just the name, nothing else.',
      prompt,
      maxTokens: 50,
      temperature: 0.1,
      operation: 'SITE_NAME_EXTRACTION',
      accountId,
      userId,
    });
    
    // Validate the extracted name is reasonable
    if (extractedName && extractedName.length > 0 && extractedName.length < 100) {
      return extractedName.trim();
    }
    
    return null;
  } catch (error) {
    console.error('AI name extraction error:', error);
    return null;
  }
}

/**
 * Extract language variants from <link rel="alternate" hreflang="..."> tags.
 * Returns [] when fewer than 2 distinct languages are found.
 */
function extractLanguageVariants(html, baseUrl, detectedLanguage) {
  if (!html) return [];
  const variants = new Map();
  let xDefaultUrl = null;

  const linkRegex = /<link\b[^>]*\brel=["']alternate["'][^>]*>/gi;
  const links = html.match(linkRegex) || [];

  for (const tag of links) {
    const hreflangMatch = tag.match(/hreflang=["']([^"']+)["']/i);
    const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
    if (!hreflangMatch || !hrefMatch) continue;

    const rawCode = hreflangMatch[1].trim().toLowerCase();
    let href = hrefMatch[1].trim();

    try {
      href = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }

    if (rawCode === 'x-default') {
      xDefaultUrl = href;
      continue;
    }

    const code = rawCode.split('-')[0];
    if (!code || code.length > 3) continue;

    if (!variants.has(code)) {
      variants.set(code, { code, url: href, isDefault: false });
    }
  }

  // Fallback: scan anchor hrefs for locale path prefixes ("/en/", "/he/")
  if (variants.size < 2) {
    const pathPrefixVariants = extractPathPrefixLocales(html, baseUrl);
    for (const [code, entry] of pathPrefixVariants) {
      if (!variants.has(code)) variants.set(code, entry);
    }
    if (pathPrefixVariants.size >= 1 && detectedLanguage && !variants.has(detectedLanguage)) {
      try {
        const baseOrigin = new URL(baseUrl).origin;
        variants.set(detectedLanguage, { code: detectedLanguage, url: baseOrigin, isDefault: true });
      } catch {}
    }
  }

  const list = Array.from(variants.values());
  if (list.length) {
    let defaultIdx = -1;
    if (xDefaultUrl) defaultIdx = list.findIndex(v => v.url === xDefaultUrl);
    if (defaultIdx === -1 && detectedLanguage) {
      defaultIdx = list.findIndex(v => v.code === detectedLanguage);
    }
    if (defaultIdx >= 0) list[defaultIdx].isDefault = true;
    else list[0].isDefault = true;
  }

  if (list.length < 2) return [];
  return list;
}

const KNOWN_LOCALE_CODES = new Set([
  'en', 'he', 'ar', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh',
  'nl', 'pl', 'sv', 'no', 'da', 'fi', 'el', 'tr', 'th', 'vi', 'id', 'ms',
  'hi', 'cs', 'hu', 'ro', 'uk', 'bg', 'hr', 'sk', 'sl', 'et', 'lv', 'lt',
  'fa', 'ur', 'bn', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'si', 'my',
]);

function extractPathPrefixLocales(html, baseUrl) {
  const found = new Map();
  let base;
  try { base = new URL(baseUrl); } catch { return found; }

  const anchorRegex = /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = anchorRegex.exec(html)) !== null) {
    const rawHref = match[1].trim();
    if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('mailto:') || rawHref.startsWith('tel:')) continue;

    let resolved;
    try { resolved = new URL(rawHref, baseUrl); } catch { continue; }
    if (resolved.origin !== base.origin) continue;

    const segments = resolved.pathname.split('/').filter(Boolean);
    if (!segments.length) continue;

    const first = segments[0].toLowerCase();
    const code = first.split('-')[0];
    if (code.length !== 2 || !KNOWN_LOCALE_CODES.has(code)) continue;

    if (!found.has(code)) {
      found.set(code, { code, url: `${base.origin}/${first}`, isDefault: false });
    }
  }
  return found;
}

/**
 * Detect page language from HTML (lang attribute, fallback to en).
 */
function detectPageLanguage(html) {
  if (!html) return null;
  const langMatch = html.match(/<html[^>]+lang=["']([^"']+)["']/i);
  if (langMatch) return langMatch[1].trim().toLowerCase().split('-')[0];
  return null;
}

/**
 * Fallback: Extract site name from HTML without AI
 */
function extractSiteNameFallback(html, hostname) {
  // Try og:site_name first (most reliable)
  const ogSiteName = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i)?.[1]?.trim();
  if (ogSiteName) return ogSiteName;

  // Try title tag
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  if (title) {
    // Remove common suffixes
    return title.split(/[|–\-:]/)[0].trim();
  }

  // Fallback to hostname
  return hostname.replace(/^www\./, '');
}

/**
 * Detect platform from HTML content and hostname
 */
function detectPlatformFromHTML(html, hostname) {
  // Shopify detection
  if (
    html.includes('cdn.shopify.com') ||
    html.includes('Shopify.theme') ||
    html.includes('shopify-section') ||
    html.includes('myshopify.com') ||
    hostname.includes('.myshopify.com')
  ) {
    return 'shopify';
  }

  // Wix detection
  if (
    html.includes('wix.com') ||
    html.includes('static.wixstatic.com') ||
    html.includes('_wix_browser_sess') ||
    hostname.includes('.wixsite.com')
  ) {
    return 'wix';
  }

  // Squarespace detection
  if (
    html.includes('squarespace.com') ||
    html.includes('static1.squarespace.com') ||
    html.includes('squarespace-cdn.com') ||
    hostname.includes('.squarespace.com')
  ) {
    return 'squarespace';
  }

  // Webflow detection
  if (
    html.includes('webflow.com') ||
    html.includes('assets.website-files.com') ||
    html.includes('w-webflow-badge') ||
    hostname.includes('.webflow.io')
  ) {
    return 'webflow';
  }

  // WordPress detection (fallback - check HTML if API failed)
  // Only match structural WordPress paths in src/href attributes to avoid
  // false positives from page content that merely mentions WordPress.
  if (
    /(?:src|href|action)=["'][^"']*\/wp-content\//i.test(html) ||
    /(?:src|href)=["'][^"']*\/wp-includes\//i.test(html) ||
    /<link[^>]*rel=["']https:\/\/api\.w\.org\/["']/i.test(html) ||
    /<meta[^>]*name=["']generator["'][^>]*content=["'][^"']*WordPress/i.test(html)
  ) {
    return 'wordpress';
  }

  // Drupal detection
  if (
    html.includes('Drupal.settings') ||
    html.includes('/sites/default/files') ||
    html.includes('drupal.js')
  ) {
    return 'drupal';
  }

  // Joomla detection
  if (
    html.includes('/media/jui/') ||
    html.includes('Joomla!') ||
    html.includes('/components/com_')
  ) {
    return 'joomla';
  }

  // Next.js detection
  if (
    html.includes('_next/static') ||
    html.includes('__NEXT_DATA__')
  ) {
    return 'custom';
  }

  // React/Vue/Angular detection (likely custom)
  if (
    html.includes('react') ||
    html.includes('__NUXT__') ||
    html.includes('ng-version')
  ) {
    return 'custom';
  }

  // If no platform detected, mark as custom
  return 'custom';
}

/**
 * POST /api/sites/validate
 * Validates a website URL is accessible and detects its platform
 */
export async function POST(request) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ valid: false, error: 'URL is required' }, { status: 400 });
    }

    // Optional auth lookup for AI credit tracking
    let trackingCtx = {};
    try {
      const cookieStore = await cookies();
      const userId = cookieStore.get(SESSION_COOKIE)?.value;
      if (userId) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, accountMemberships: { select: { accountId: true }, take: 1 } },
        });
        if (user) {
          trackingCtx = { accountId: user.accountMemberships?.[0]?.accountId, userId: user.id };
        }
      }
    } catch { /* non-critical */ }

    // Normalize URL
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + normalizedUrl;
    }

    // Remove trailing slash
    normalizedUrl = normalizedUrl.replace(/\/$/, '');

    // Validate URL format
    let parsedUrl;
    try {
      parsedUrl = new URL(normalizedUrl);
    } catch (e) {
      return NextResponse.json({ valid: false, error: 'Invalid URL format' });
    }

    // Try to fetch the website
    let response;
    try {
      response = await fetch(normalizedUrl, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'GhostPost-Platform/1.0',
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });
    } catch (fetchError) {
      // Try GET if HEAD fails
      try {
        response = await fetch(normalizedUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'GhostPost-Platform/1.0',
          },
          signal: AbortSignal.timeout(10000),
        });
      } catch (e) {
        return NextResponse.json({ 
          valid: false, 
          error: 'Website is not accessible. Please check the URL and try again.' 
        });
      }
    }

    if (!response.ok && response.status !== 401 && response.status !== 403) {
      return NextResponse.json({ 
        valid: false, 
        error: `Website returned status ${response.status}` 
      });
    }

    // Detect platform
    let platform = null;
    const hostname = parsedUrl.hostname.replace(/^www\./, '');

    // Fetch HTML content first (we'll need it for platform detection and name extraction)
    let html = '';
    try {
      const htmlResponse = await fetch(normalizedUrl, {
        headers: { 'User-Agent': 'GhostPost-Platform/1.0' },
        signal: AbortSignal.timeout(10000),
      });
      
      if (htmlResponse.ok) {
        html = await htmlResponse.text();
      }
    } catch (e) {
      console.error('HTML fetch error:', e);
    }

    // Try to detect WordPress via REST API
    try {
      const wpCheck = await fetch(`${normalizedUrl}/wp-json/wp/v2`, {
        method: 'HEAD',
        headers: { 'User-Agent': 'GhostPost-Platform/1.0' },
        signal: AbortSignal.timeout(5000),
      });
      
      if (wpCheck.ok || wpCheck.status === 401) {
        platform = 'wordpress';
      }
    } catch (e) {
      // Not WordPress via API
    }

    // If not detected via API, check HTML for platform indicators
    if (!platform && html) {
      platform = detectPlatformFromHTML(html, hostname);
    }

    // Extract site name
    let siteName = hostname;
    if (html) {
      // Try AI extraction first
      const aiExtractedName = await extractSiteNameWithAI(html, hostname, trackingCtx);
      if (aiExtractedName) {
        siteName = aiExtractedName;
      } else {
        // Fallback to regex extraction
        siteName = extractSiteNameFallback(html, hostname);
      }
    }

    // Detect page language + multi-language variants (hreflang).
    const detectedLanguage = detectPageLanguage(html);
    const languages = extractLanguageVariants(html, normalizedUrl, detectedLanguage);

    return NextResponse.json({
      valid: true,
      url: normalizedUrl,
      siteName,
      platform,
      contentLanguage: detectedLanguage,
      languages,
    });
  } catch (error) {
    console.error('URL validation error:', error);
    return NextResponse.json(
      { valid: false, error: 'Validation failed. Please try again.' },
      { status: 500 }
    );
  }
}
