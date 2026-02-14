/**
 * HTML Analyzer — Static HTML analysis using Cheerio
 *
 * Performs comprehensive checks on raw HTML content:
 * - Technical: title, meta desc, headings, canonical, OG, alt text, structured data,
 *              lang, links, favicon, security headers, HTTPS, mixed content, viewport
 * - Performance: TTFB, HTML size, scripts, stylesheets, image optimization,
 *                compression, caching, render-blocking resources
 *
 * All issues use translation keys as messages.
 * Issues from this module have source: "html".
 */

import * as cheerio from 'cheerio';

function extractDomain(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

// ─── Main Analyzer ──────────────────────────────────────────

/**
 * Analyze HTML content and return issues
 * @param {string} html - Raw HTML string
 * @param {string} pageUrl - URL of the page
 * @param {Object} headers - HTTP response headers (optional)
 * @param {number|null} ttfb - Time to first byte in ms (optional)
 * @returns {Array<AuditIssue>}
 */
export function analyzeHtml(html, pageUrl, headers = {}, ttfb = null) {
  const issues = [];
  const $ = cheerio.load(html);
  const hasHeaders = Object.keys(headers).length > 0;

  // ═══════════════════════════════════════════════════════════
  // PERFORMANCE CHECKS
  // ═══════════════════════════════════════════════════════════

  // ── TTFB ──
  if (ttfb !== null) {
    if (ttfb > 3000) {
      issues.push({ type: 'performance', severity: 'error', message: 'audit.issues.ttfbCritical', url: pageUrl, suggestion: 'audit.suggestions.ttfb', source: 'html', details: `${ttfb}ms` });
    } else if (ttfb > 1500) {
      issues.push({ type: 'performance', severity: 'warning', message: 'audit.issues.ttfbSlow', url: pageUrl, suggestion: 'audit.suggestions.ttfb', source: 'html', details: `${ttfb}ms` });
    } else {
      issues.push({ type: 'performance', severity: 'passed', message: 'audit.issues.ttfbGood', url: pageUrl, source: 'html', details: `${ttfb}ms` });
    }
  }

  // ── HTML Size ──
  const htmlSizeKB = Math.round(Buffer.byteLength(html, 'utf8') / 1024);
  if (htmlSizeKB > 500) {
    issues.push({ type: 'performance', severity: 'error', message: 'audit.issues.htmlTooLarge', url: pageUrl, suggestion: 'audit.suggestions.htmlSize', source: 'html', details: `${htmlSizeKB}KB` });
  } else if (htmlSizeKB > 200) {
    issues.push({ type: 'performance', severity: 'warning', message: 'audit.issues.htmlLarge', url: pageUrl, suggestion: 'audit.suggestions.htmlSize', source: 'html', details: `${htmlSizeKB}KB` });
  } else {
    issues.push({ type: 'performance', severity: 'passed', message: 'audit.issues.htmlSizeGood', url: pageUrl, source: 'html', details: `${htmlSizeKB}KB` });
  }

  // ── Inline Scripts ──
  const inlineScripts = $('script:not([src])').length;
  if (inlineScripts > 10) {
    issues.push({ type: 'performance', severity: 'warning', message: 'audit.issues.tooManyInlineScripts', url: pageUrl, suggestion: 'audit.suggestions.inlineScripts', source: 'html', details: `${inlineScripts}` });
  } else {
    issues.push({ type: 'performance', severity: 'passed', message: 'audit.issues.inlineScriptsOk', url: pageUrl, source: 'html', details: `${inlineScripts}` });
  }

  // ── External Scripts ──
  const externalScripts = $('script[src]');
  const scriptUrls = [];
  externalScripts.each((_, el) => {
    const src = $(el).attr('src');
    if (src) scriptUrls.push(src);
  });
  if (scriptUrls.length > 20) {
    issues.push({ type: 'performance', severity: 'error', message: 'audit.issues.tooManyScripts', url: pageUrl, suggestion: 'audit.suggestions.reduceScripts', source: 'html', details: `${scriptUrls.length}`, detailedSources: scriptUrls.slice(0, 30) });
  } else if (scriptUrls.length > 10) {
    issues.push({ type: 'performance', severity: 'warning', message: 'audit.issues.manyScripts', url: pageUrl, suggestion: 'audit.suggestions.reduceScripts', source: 'html', details: `${scriptUrls.length}`, detailedSources: scriptUrls.slice(0, 20) });
  } else {
    issues.push({ type: 'performance', severity: 'passed', message: 'audit.issues.scriptsOk', url: pageUrl, source: 'html', details: `${scriptUrls.length}` });
  }

  // ── Stylesheets ──
  const stylesheets = $('link[rel="stylesheet"]').length;
  if (stylesheets > 10) {
    issues.push({ type: 'performance', severity: 'warning', message: 'audit.issues.tooManyStylesheets', url: pageUrl, suggestion: 'audit.suggestions.reduceStylesheets', source: 'html' });
  } else {
    issues.push({ type: 'performance', severity: 'passed', message: 'audit.issues.stylesheetsOk', url: pageUrl, source: 'html' });
  }

  // ── Image Lazy Loading ──
  const images = $('img');
  const imagesWithoutLazy = images.filter((_, el) => !$(el).attr('loading'));
  if (images.length > 0 && imagesWithoutLazy.length > 5) {
    issues.push({ type: 'performance', severity: 'warning', message: 'audit.issues.imagesNotLazy', url: pageUrl, suggestion: 'audit.suggestions.lazyLoading', source: 'html', details: `${imagesWithoutLazy.length}/${images.length}` });
  } else if (images.length > 0) {
    issues.push({ type: 'performance', severity: 'passed', message: 'audit.issues.lazyLoadingGood', url: pageUrl, source: 'html', details: `${images.length}` });
  }

  // ── Image Dimensions (CLS prevention) ──
  const noDimensions = images.filter((_, el) => {
    const $el = $(el);
    return !$el.attr('width') || !$el.attr('height');
  });
  if (noDimensions.length > 3) {
    issues.push({ type: 'performance', severity: 'warning', message: 'audit.issues.imagesNoDimensions', url: pageUrl, suggestion: 'audit.suggestions.imageDimensions', source: 'html' });
  }

  // ── Compression ──
  if (hasHeaders) {
    const encoding = (headers['content-encoding'] || '').toLowerCase();
    if (encoding.includes('gzip') || encoding.includes('br') || encoding.includes('deflate')) {
      issues.push({ type: 'performance', severity: 'passed', message: 'audit.issues.compressionEnabled', url: pageUrl, source: 'html' });
    } else {
      issues.push({ type: 'performance', severity: 'warning', message: 'audit.issues.noCompression', url: pageUrl, suggestion: 'audit.suggestions.enableCompression', source: 'html' });
    }
  }

  // ── Cache Headers ──
  if (hasHeaders) {
    if (headers['cache-control']) {
      issues.push({ type: 'performance', severity: 'passed', message: 'audit.issues.cacheHeadersGood', url: pageUrl, source: 'html' });
    } else {
      issues.push({ type: 'performance', severity: 'warning', message: 'audit.issues.noCacheHeaders', url: pageUrl, suggestion: 'audit.suggestions.cacheHeaders', source: 'html' });
    }
  }

  // ── Render-Blocking CSS ──
  const renderBlocking = $('link[rel="stylesheet"]:not([media])').length;
  if (renderBlocking > 5) {
    issues.push({ type: 'performance', severity: 'warning', message: 'audit.issues.renderBlockingCSS', url: pageUrl, suggestion: 'audit.suggestions.deferCSS', source: 'html' });
  }

  // ═══════════════════════════════════════════════════════════
  // TECHNICAL / SEO CHECKS
  // ═══════════════════════════════════════════════════════════

  // ── Title Tag ──
  const title = $('title').first().text().trim();
  if (!title) {
    issues.push({ type: 'technical', severity: 'error', message: 'audit.issues.noTitle', url: pageUrl, suggestion: 'audit.suggestions.addTitle', source: 'html' });
  } else if (title.length < 30) {
    issues.push({ type: 'technical', severity: 'warning', message: 'audit.issues.titleTooShort', url: pageUrl, suggestion: 'audit.suggestions.titleLength', source: 'html', details: `${title.length} chars — "${title.slice(0, 50)}"` });
  } else if (title.length > 60) {
    issues.push({ type: 'technical', severity: 'warning', message: 'audit.issues.titleTooLong', url: pageUrl, suggestion: 'audit.suggestions.titleLength', source: 'html', details: `${title.length} chars — "${title.slice(0, 50)}..."` });
  } else {
    issues.push({ type: 'technical', severity: 'passed', message: 'audit.issues.titleGood', url: pageUrl, source: 'html', details: `${title.length} chars` });
  }

  // ── Meta Description ──
  const metaDesc = $('meta[name="description"]').attr('content')?.trim() || '';
  if (!metaDesc) {
    issues.push({ type: 'technical', severity: 'error', message: 'audit.issues.noMetaDescription', url: pageUrl, suggestion: 'audit.suggestions.addMetaDescription', source: 'html' });
  } else if (metaDesc.length < 120) {
    issues.push({ type: 'technical', severity: 'warning', message: 'audit.issues.metaDescriptionShort', url: pageUrl, suggestion: 'audit.suggestions.metaDescriptionLength', source: 'html', details: `${metaDesc.length} chars` });
  } else if (metaDesc.length > 160) {
    issues.push({ type: 'technical', severity: 'warning', message: 'audit.issues.metaDescriptionLong', url: pageUrl, suggestion: 'audit.suggestions.metaDescriptionLength', source: 'html', details: `${metaDesc.length} chars` });
  } else {
    issues.push({ type: 'technical', severity: 'passed', message: 'audit.issues.metaDescriptionGood', url: pageUrl, source: 'html', details: `${metaDesc.length} chars` });
  }

  // ── H1 Tag ──
  const h1s = $('h1');
  if (h1s.length === 0) {
    issues.push({ type: 'technical', severity: 'error', message: 'audit.issues.noH1', url: pageUrl, suggestion: 'audit.suggestions.addH1', source: 'html' });
  } else if (h1s.length > 1) {
    issues.push({ type: 'technical', severity: 'warning', message: 'audit.issues.multipleH1', url: pageUrl, suggestion: 'audit.suggestions.singleH1', source: 'html', details: `${h1s.length} H1 tags` });
  } else {
    issues.push({ type: 'technical', severity: 'passed', message: 'audit.issues.h1Good', url: pageUrl, source: 'html' });
  }

  // ── H2 Subheadings ──
  if ($('h2').length === 0) {
    issues.push({ type: 'technical', severity: 'warning', message: 'audit.issues.noH2', url: pageUrl, suggestion: 'audit.suggestions.addH2', source: 'html' });
  } else {
    issues.push({ type: 'technical', severity: 'passed', message: 'audit.issues.headingStructureGood', url: pageUrl, source: 'html' });
  }

  // ── Canonical Tag ──
  const canonical = $('link[rel="canonical"]').attr('href');
  if (!canonical) {
    issues.push({ type: 'technical', severity: 'warning', message: 'audit.issues.noCanonical', url: pageUrl, suggestion: 'audit.suggestions.addCanonical', source: 'html' });
  } else {
    issues.push({ type: 'technical', severity: 'passed', message: 'audit.issues.canonicalGood', url: pageUrl, source: 'html' });
  }

  // ── Open Graph Tags ──
  const ogTitle = $('meta[property="og:title"]').attr('content');
  const ogDesc = $('meta[property="og:description"]').attr('content');
  const ogImage = $('meta[property="og:image"]').attr('content');
  if (!ogTitle || !ogDesc || !ogImage) {
    issues.push({ type: 'technical', severity: 'warning', message: 'audit.issues.missingOG', url: pageUrl, suggestion: 'audit.suggestions.addOG', source: 'html' });
  } else {
    issues.push({ type: 'technical', severity: 'passed', message: 'audit.issues.ogTagsGood', url: pageUrl, source: 'html' });
  }

  // ── Image Alt Text ──
  const noAlt = images.filter((_, el) => {
    const alt = $(el).attr('alt');
    return !alt || alt.trim() === '';
  });
  const noAltDetails = [];
  noAlt.each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || '';
    noAltDetails.push({ url: src, fileName: src.split('/').pop()?.split('?')[0] || '' });
  });
  if (noAlt.length > 0) {
    issues.push({ type: 'technical', severity: 'warning', message: 'audit.issues.imagesNoAlt', url: pageUrl, suggestion: 'audit.suggestions.addAltText', source: 'html', details: `${noAlt.length}/${images.length}`, detailedSources: noAltDetails.slice(0, 20) });
  } else if (images.length > 0) {
    issues.push({ type: 'technical', severity: 'passed', message: 'audit.issues.allImagesHaveAlt', url: pageUrl, source: 'html' });
  }

  // ── Structured Data (JSON-LD) ──
  if ($('script[type="application/ld+json"]').length === 0) {
    issues.push({ type: 'technical', severity: 'warning', message: 'audit.issues.noStructuredData', url: pageUrl, suggestion: 'audit.suggestions.addStructuredData', source: 'html' });
  } else {
    issues.push({ type: 'technical', severity: 'passed', message: 'audit.issues.structuredDataFound', url: pageUrl, source: 'html' });
  }

  // ── Language Attribute ──
  const lang = $('html').attr('lang');
  if (!lang) {
    issues.push({ type: 'technical', severity: 'warning', message: 'audit.issues.noLangAttribute', url: pageUrl, suggestion: 'audit.suggestions.addLangAttribute', source: 'html' });
  } else {
    issues.push({ type: 'technical', severity: 'passed', message: 'audit.issues.langAttributeGood', url: pageUrl, source: 'html' });
  }

  // ── Internal Links ──
  const domain = extractDomain(pageUrl);
  let internalCount = 0;
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (href.startsWith('/') || href.includes(domain)) internalCount++;
  });
  if (internalCount < 3) {
    issues.push({ type: 'technical', severity: 'warning', message: 'audit.issues.fewInternalLinks', url: pageUrl, suggestion: 'audit.suggestions.addInternalLinks', source: 'html', details: `${internalCount}` });
  } else {
    issues.push({ type: 'technical', severity: 'passed', message: 'audit.issues.internalLinksGood', url: pageUrl, source: 'html', details: `${internalCount}` });
  }

  // ── Favicon ──
  const favicon = $('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]');
  if (favicon.length === 0) {
    issues.push({ type: 'technical', severity: 'warning', message: 'audit.issues.noFavicon', url: pageUrl, suggestion: 'audit.suggestions.addFavicon', source: 'html' });
  } else {
    issues.push({ type: 'technical', severity: 'passed', message: 'audit.issues.faviconGood', url: pageUrl, source: 'html' });
  }

  // ═══════════════════════════════════════════════════════════
  // SECURITY CHECKS (from response headers)
  // ═══════════════════════════════════════════════════════════

  if (hasHeaders) {
    // HTTPS
    if (pageUrl.startsWith('https://')) {
      issues.push({ type: 'technical', severity: 'passed', message: 'audit.issues.httpsEnabled', url: pageUrl, source: 'html' });
    } else {
      issues.push({ type: 'technical', severity: 'error', message: 'audit.issues.noHttps', url: pageUrl, suggestion: 'audit.suggestions.enableHttps', source: 'html' });
    }

    // HSTS
    if (headers['strict-transport-security']) {
      issues.push({ type: 'technical', severity: 'passed', message: 'audit.issues.hstsEnabled', url: pageUrl, source: 'html' });
    } else {
      issues.push({ type: 'technical', severity: 'warning', message: 'audit.issues.noHsts', url: pageUrl, suggestion: 'audit.suggestions.enableHsts', source: 'html' });
    }

    // X-Frame-Options
    if (headers['x-frame-options']) {
      issues.push({ type: 'technical', severity: 'passed', message: 'audit.issues.xFrameOptionsSet', url: pageUrl, source: 'html' });
    } else {
      issues.push({ type: 'technical', severity: 'warning', message: 'audit.issues.noXFrameOptions', url: pageUrl, suggestion: 'audit.suggestions.addXFrameOptions', source: 'html' });
    }

    // X-Content-Type-Options
    if (headers['x-content-type-options'] === 'nosniff') {
      issues.push({ type: 'technical', severity: 'passed', message: 'audit.issues.contentTypeOptionsSet', url: pageUrl, source: 'html' });
    } else {
      issues.push({ type: 'technical', severity: 'warning', message: 'audit.issues.noContentTypeOptions', url: pageUrl, suggestion: 'audit.suggestions.addContentTypeOptions', source: 'html' });
    }

    // Content Security Policy
    if (headers['content-security-policy']) {
      issues.push({ type: 'technical', severity: 'passed', message: 'audit.issues.cspSet', url: pageUrl, source: 'html' });
    } else {
      issues.push({ type: 'technical', severity: 'warning', message: 'audit.issues.noCsp', url: pageUrl, suggestion: 'audit.suggestions.addCsp', source: 'html' });
    }

    // X-XSS-Protection
    if (headers['x-xss-protection']) {
      issues.push({ type: 'technical', severity: 'passed', message: 'audit.issues.xssProtectionSet', url: pageUrl, source: 'html' });
    }

    // Referrer-Policy
    if (headers['referrer-policy']) {
      issues.push({ type: 'technical', severity: 'passed', message: 'audit.issues.referrerPolicySet', url: pageUrl, source: 'html' });
    } else {
      issues.push({ type: 'technical', severity: 'warning', message: 'audit.issues.noReferrerPolicy', url: pageUrl, suggestion: 'audit.suggestions.addReferrerPolicy', source: 'html' });
    }

    // Permissions-Policy
    if (headers['permissions-policy'] || headers['feature-policy']) {
      issues.push({ type: 'technical', severity: 'passed', message: 'audit.issues.permissionsPolicySet', url: pageUrl, source: 'html' });
    } else {
      issues.push({ type: 'technical', severity: 'info', message: 'audit.issues.noPermissionsPolicy', url: pageUrl, suggestion: 'audit.suggestions.addPermissionsPolicy', source: 'html' });
    }

    // Mixed Content
    if (pageUrl.startsWith('https://')) {
      let mixedCount = 0;
      $('[src], [href]').each((_, el) => {
        const attr = $(el).attr('src') || $(el).attr('href') || '';
        if (attr.startsWith('http://') && !attr.includes('localhost')) mixedCount++;
      });
      if (mixedCount > 0) {
        issues.push({ type: 'technical', severity: 'warning', message: 'audit.issues.mixedContent', url: pageUrl, suggestion: 'audit.suggestions.fixMixedContent', source: 'html' });
      } else {
        issues.push({ type: 'technical', severity: 'passed', message: 'audit.issues.noMixedContent', url: pageUrl, source: 'html' });
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // MOBILE CHECKS
  // ═══════════════════════════════════════════════════════════

  // Viewport
  const viewport = $('meta[name="viewport"]');
  if (viewport.length === 0) {
    issues.push({ type: 'technical', severity: 'error', message: 'audit.issues.noViewport', url: pageUrl, suggestion: 'audit.suggestions.addViewport', source: 'html' });
  } else {
    const content = viewport.attr('content') || '';
    if (content.includes('width=device-width')) {
      issues.push({ type: 'technical', severity: 'passed', message: 'audit.issues.viewportGood', url: pageUrl, source: 'html' });
    } else {
      issues.push({ type: 'technical', severity: 'warning', message: 'audit.issues.viewportNoDeviceWidth', url: pageUrl, suggestion: 'audit.suggestions.fixViewport', source: 'html' });
    }
    if (content.includes('user-scalable=no') || content.match(/maximum-scale\s*=\s*1([^.\d]|$)/)) {
      issues.push({ type: 'technical', severity: 'warning', message: 'audit.issues.zoomDisabled', url: pageUrl, suggestion: 'audit.suggestions.enableZoom', source: 'html' });
    }
  }

  // Responsive images
  if (images.length > 5) {
    const responsive = images.filter((_, el) => $(el).attr('srcset'));
    const noSrcset = images.filter((_, el) => !$(el).attr('srcset'));
    const noSrcsetDetails = [];
    noSrcset.each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src') || '';
      noSrcsetDetails.push({ url: src, fileName: src.split('/').pop()?.split('?')[0] || '' });
    });
    if (responsive.length < images.length * 0.3) {
      issues.push({ type: 'technical', severity: 'warning', message: 'audit.issues.noResponsiveImages', url: pageUrl, suggestion: 'audit.suggestions.addSrcset', source: 'html', detailedSources: noSrcsetDetails.slice(0, 15) });
    } else {
      issues.push({ type: 'technical', severity: 'passed', message: 'audit.issues.responsiveImagesGood', url: pageUrl, source: 'html' });
    }
  }

  // Small font sizes (heuristic from inline styles)
  const tinyFonts = [];
  $('[style]').each((_, el) => {
    const style = $(el).attr('style') || '';
    const match = style.match(/font-size\s*:\s*(\d+)\s*px/i);
    if (match && parseInt(match[1]) < 12) tinyFonts.push(match[1]);
  });
  if (tinyFonts.length > 3) {
    issues.push({ type: 'technical', severity: 'warning', message: 'audit.issues.smallFontSizes', url: pageUrl, suggestion: 'audit.suggestions.increaseFontSize', source: 'html' });
  }

  return issues;
}

// ─── Robots & Sitemap Checker ─────────────────────────────────

async function fetchWithTimeout(url, timeout = 8000) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'GhostPost-SiteAuditor/2.0' },
    });
    clearTimeout(tid);
    return res;
  } catch (err) {
    clearTimeout(tid);
    throw err;
  }
}

/**
 * Check robots.txt and sitemap.xml for the site root
 * @param {string} baseUrl - Site origin (e.g., "https://example.com")
 * @returns {Array<AuditIssue>}
 */
export async function checkRobotsAndSitemap(baseUrl) {
  const issues = [];

  // ── robots.txt ──
  try {
    const res = await fetchWithTimeout(`${baseUrl}/robots.txt`);
    if (res.ok) {
      const text = await res.text();
      issues.push({ type: 'technical', severity: 'passed', message: 'audit.issues.robotsTxtFound', source: 'html' });
      if (text.toLowerCase().includes('sitemap:')) {
        issues.push({ type: 'technical', severity: 'passed', message: 'audit.issues.sitemapInRobotsTxt', source: 'html' });
      }
    } else {
      issues.push({ type: 'technical', severity: 'warning', message: 'audit.issues.noRobotsTxt', suggestion: 'audit.suggestions.addRobotsTxt', source: 'html' });
    }
  } catch {
    issues.push({ type: 'technical', severity: 'warning', message: 'audit.issues.robotsTxtError', source: 'html' });
  }

  // ── sitemap.xml ──
  try {
    const res = await fetchWithTimeout(`${baseUrl}/sitemap.xml`);
    if (res.ok) {
      const text = await res.text();
      if (text.includes('<urlset') || text.includes('<sitemapindex')) {
        issues.push({ type: 'technical', severity: 'passed', message: 'audit.issues.sitemapFound', source: 'html' });
      } else {
        issues.push({ type: 'technical', severity: 'warning', message: 'audit.issues.sitemapInvalid', suggestion: 'audit.suggestions.fixSitemap', source: 'html' });
      }
    } else {
      // Fallback paths
      let found = false;
      for (const path of ['/sitemap_index.xml', '/wp-sitemap.xml']) {
        try {
          const r = await fetchWithTimeout(`${baseUrl}${path}`, 5000);
          if (r.ok) {
            issues.push({ type: 'technical', severity: 'passed', message: 'audit.issues.sitemapFound', source: 'html' });
            found = true;
            break;
          }
        } catch { /* skip */ }
      }
      if (!found) {
        issues.push({ type: 'technical', severity: 'warning', message: 'audit.issues.noSitemap', suggestion: 'audit.suggestions.addSitemap', source: 'html' });
      }
    }
  } catch {
    issues.push({ type: 'technical', severity: 'warning', message: 'audit.issues.sitemapError', source: 'html' });
  }

  return issues;
}
