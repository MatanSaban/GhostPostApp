import { NextResponse } from 'next/server';

/**
 * POST /api/interview/detect-languages
 * Lightweight: fetch the HTML of a URL and return any language variants
 * discovered via hreflang tags or locale path prefixes.
 * No AI, no DB writes, no credit tracking — safe to call before the user
 * has committed to a full analysis.
 */
export async function POST(request) {
  try {
    const { url } = await request.json();
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const normalized = normalizeUrl(url);
    const fetched = await fetchPage(normalized);
    if (!fetched.success) {
      return NextResponse.json(
        { success: false, errorCode: 'SITE_UNREACHABLE', error: fetched.error },
        { status: 200 }
      );
    }

    const detectedLanguage = detectPageLanguage(fetched.html);
    const languages = extractLanguageVariants(fetched.html, normalized, detectedLanguage);

    return NextResponse.json({
      success: true,
      url: normalized,
      detectedLanguage,
      languages,
    });
  } catch (error) {
    const isInvalidUrl = /invalid url/i.test(error?.message || '');
    return NextResponse.json(
      {
        success: false,
        errorCode: isInvalidUrl ? 'INVALID_URL' : 'ANALYSIS_FAILED',
        error: error.message || 'Detection failed',
      },
      { status: isInvalidUrl ? 400 : 500 }
    );
  }
}

function normalizeUrl(url) {
  let normalized = url.trim().replace(/\/+$/, '');
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = 'https://' + normalized;
  }
  try {
    return new URL(normalized).origin;
  } catch {
    throw new Error('Invalid URL format');
  }
}

async function fetchPage(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'he,en;q=0.9',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);
    if (!response.ok) return { success: false, error: `HTTP ${response.status}` };
    const html = await response.text();
    return { success: true, html };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function detectPageLanguage(html) {
  const langMatch = html.match(/<html[^>]+lang=["']([^"']+)["']/i);
  if (langMatch) return langMatch[1].trim().toLowerCase().split('-')[0];
  return null;
}

const KNOWN_LOCALE_CODES = new Set([
  'en', 'he', 'ar', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh',
  'nl', 'pl', 'sv', 'no', 'da', 'fi', 'el', 'tr', 'th', 'vi', 'id', 'ms',
  'hi', 'cs', 'hu', 'ro', 'uk', 'bg', 'hr', 'sk', 'sl', 'et', 'lv', 'lt',
  'fa', 'ur', 'bn', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'si', 'my',
]);

function extractLanguageVariants(html, baseUrl, detectedLanguage) {
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
    try { href = new URL(href, baseUrl).toString(); } catch { continue; }
    if (rawCode === 'x-default') { xDefaultUrl = href; continue; }
    const code = rawCode.split('-')[0];
    if (!code || code.length > 3) continue;
    if (!variants.has(code)) variants.set(code, { code, url: href, isDefault: false });
  }

  if (variants.size < 2) {
    const prefixVariants = extractPathPrefixLocales(html, baseUrl);
    for (const [code, entry] of prefixVariants) {
      if (!variants.has(code)) variants.set(code, entry);
    }
    if (prefixVariants.size >= 1 && detectedLanguage && !variants.has(detectedLanguage)) {
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
    if (defaultIdx === -1 && detectedLanguage) defaultIdx = list.findIndex(v => v.code === detectedLanguage);
    if (defaultIdx >= 0) list[defaultIdx].isDefault = true;
    else list[0].isDefault = true;
  }

  if (list.length < 2) return [];
  return list;
}

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
