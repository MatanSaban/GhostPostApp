/**
 * URL fetcher + parser for the chat agent's `fetch_url` tool.
 *
 * Pulls a remote page and returns a structured summary the agent can reason
 * about: title, meta description, canonical, OG image, favicon URLs, and
 * candidate "logo" image URLs (data-id*=logo, src/srcset/alt containing logo).
 *
 * Exists primarily to support the workflow:
 *   - User: "use ACME's logo as a reference image"
 *   - Agent: web_search("ACME logo") → fetch_url(top_result.url) →
 *            picks .logos[0].url → passes it to generate_image.referenceImages
 *
 * If we can't extract anything useful, returns explicit empty arrays so the
 * agent surfaces "I couldn't find a logo - can you upload one?" instead of
 * silently passing junk into the image generator.
 */

import { BOT_FETCH_HEADERS } from '@/lib/bot-identity';

const FETCH_TIMEOUT_MS = 12000;
const MAX_BYTES = 1_500_000; // 1.5MB cap - HTML pages should be smaller

function abs(maybeRelative, baseUrl) {
  if (!maybeRelative) return null;
  try { return new URL(maybeRelative, baseUrl).toString(); } catch { return null; }
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s/>]+))`, 'i'));
  return m ? (m[1] ?? m[2] ?? m[3] ?? null) : null;
}

/**
 * Fetch a URL and parse it for SEO + image-discovery metadata.
 *
 * @param {string} url
 * @param {{ extractImages?: boolean, asImage?: boolean }} [opts]
 *   - extractImages: include all <img> tags (capped at 30) + logo candidates. Default true.
 *   - asImage: if the URL is itself an image (image/* content-type), return
 *              `{ asImage: true, url, contentType, bytes }` instead of HTML parsing.
 *              Default true.
 */
export async function fetchUrl(url, { extractImages = true, asImage = true } = {}) {
  if (!url || typeof url !== 'string') {
    return { error: 'url is required' };
  }
  let parsed;
  try { parsed = new URL(url); } catch { return { error: 'Invalid URL' }; }
  if (!/^https?:$/.test(parsed.protocol)) {
    return { error: 'Only http(s) URLs are supported' };
  }

  const c = new AbortController();
  const timeoutId = setTimeout(() => c.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: BOT_FETCH_HEADERS, signal: c.signal, redirect: 'follow' });
    clearTimeout(timeoutId);
    if (!res.ok) return { error: `HTTP ${res.status}`, status: res.status, url };

    const contentType = res.headers.get('content-type') || '';

    // If the URL is itself an image (e.g. a CDN logo), return image metadata
    // instead of trying to parse HTML. The agent uses this when picking a
    // logo image direct from search results.
    if (asImage && /^image\//i.test(contentType)) {
      const buf = await res.arrayBuffer();
      return {
        asImage: true,
        url: res.url,
        contentType,
        bytes: buf.byteLength,
      };
    }

    // Read up to MAX_BYTES of the body. For huge pages we just look at the
    // first chunk - meta tags + the navigation header (where logos live)
    // are always at the top of the document.
    const reader = res.body?.getReader();
    let html = '';
    if (reader) {
      const decoder = new TextDecoder('utf-8', { fatal: false });
      let received = 0;
      while (received < MAX_BYTES) {
        const { value, done } = await reader.read();
        if (done) break;
        received += value.byteLength;
        html += decoder.decode(value, { stream: true });
      }
      try { reader.cancel(); } catch { /* noop */ }
    } else {
      html = await res.text();
    }

    return parseHtml(html, res.url || url, { extractImages });
  } catch (err) {
    return { error: err.message || 'Fetch failed', url };
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseHtml(html, baseUrl, { extractImages }) {
  const result = {
    url: baseUrl,
    title: null,
    description: null,
    canonical: null,
    ogTitle: null,
    ogDescription: null,
    ogImage: null,
    favicons: [],
    logos: [], // ranked best-guess company-logo candidates
    images: [],
  };

  // <title>
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) result.title = titleMatch[1].replace(/\s+/g, ' ').trim();

  // Meta tags - generic name=description, og:*, etc.
  const metaRe = /<meta\b[^>]*>/gi;
  let m;
  while ((m = metaRe.exec(html)) !== null) {
    const tag = m[0];
    const name = (attr(tag, 'name') || '').toLowerCase();
    const property = (attr(tag, 'property') || '').toLowerCase();
    const content = attr(tag, 'content');
    if (!content) continue;
    if (name === 'description' && !result.description) result.description = content;
    if (property === 'og:title' && !result.ogTitle) result.ogTitle = content;
    if (property === 'og:description' && !result.ogDescription) result.ogDescription = content;
    if ((property === 'og:image' || property === 'og:image:url') && !result.ogImage) {
      result.ogImage = abs(content, baseUrl);
    }
  }

  // Canonical + favicons
  const linkRe = /<link\b[^>]*>/gi;
  while ((m = linkRe.exec(html)) !== null) {
    const tag = m[0];
    const rel = (attr(tag, 'rel') || '').toLowerCase();
    const href = attr(tag, 'href');
    if (!href) continue;
    const absHref = abs(href, baseUrl);
    if (rel === 'canonical' && !result.canonical) result.canonical = absHref;
    if (/icon/.test(rel)) {
      result.favicons.push({
        url: absHref,
        sizes: attr(tag, 'sizes') || null,
        type: attr(tag, 'type') || null,
      });
    }
  }

  if (extractImages) {
    const imgRe = /<img\b[^>]*>/gi;
    const seen = new Set();
    while ((m = imgRe.exec(html)) !== null) {
      const tag = m[0];
      const src = attr(tag, 'src') || attr(tag, 'data-src');
      if (!src) continue;
      const absSrc = abs(src, baseUrl);
      if (!absSrc || seen.has(absSrc)) continue;
      seen.add(absSrc);
      const altText = attr(tag, 'alt') || '';
      const cls = attr(tag, 'class') || '';
      const id = attr(tag, 'id') || '';

      const isLogoHint = /\blogo\b/i.test(`${absSrc} ${altText} ${cls} ${id}`);
      const entry = { url: absSrc, alt: altText, isLogoCandidate: isLogoHint };
      if (isLogoHint) result.logos.push(entry);
      result.images.push(entry);
      if (result.images.length >= 30) break;
    }

    // Surface SVG <use href> inside header anchors that often render the brand
    // mark even when there's no <img>. Cheap heuristic for SVG logos.
    const headerSvgRe = /<svg\b[^>]*>[\s\S]*?<\/svg>/gi;
    let countSvg = 0;
    while ((m = headerSvgRe.exec(html)) !== null && countSvg < 5) {
      const block = m[0];
      if (/\blogo\b/i.test(block)) {
        result.logos.push({ url: null, alt: 'inline-svg-logo', isLogoCandidate: true, inlineSvgLength: block.length });
        countSvg++;
      }
    }

    // De-duplicate logos - prefer the largest-looking (path contains 2x/512/256 etc).
    result.logos = dedupAndRankLogos(result.logos, result.ogImage);
  }

  return result;
}

function dedupAndRankLogos(logos, ogImage) {
  const seen = new Set();
  const out = [];
  for (const l of logos) {
    if (!l.url) { out.push(l); continue; }
    if (seen.has(l.url)) continue;
    seen.add(l.url);
    out.push(l);
  }
  // If OG image looks like a logo (small URL hint), bump it up
  if (ogImage && !seen.has(ogImage) && /\blogo\b/i.test(ogImage)) {
    out.unshift({ url: ogImage, alt: 'og:image', isLogoCandidate: true });
  }
  // Preference: SVG > PNG > JPG > anything else; bigger size hints win.
  return out.sort((a, b) => score(b) - score(a)).slice(0, 8);
}

function score(l) {
  if (!l.url) return -1;
  let s = 0;
  if (/\.svg(\?|$)/i.test(l.url)) s += 50;
  else if (/\.png(\?|$)/i.test(l.url)) s += 30;
  else if (/\.(webp|jpg|jpeg)(\?|$)/i.test(l.url)) s += 10;
  if (/(512|1024|2048|@2x|@3x)/i.test(l.url)) s += 15;
  if (/header|nav|brand/i.test(l.url + ' ' + (l.alt || ''))) s += 5;
  return s;
}
