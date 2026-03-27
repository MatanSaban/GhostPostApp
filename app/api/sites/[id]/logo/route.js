import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { v2 as cloudinary } from 'cloudinary';
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import prisma from '@/lib/prisma';
import { logAIUsage } from '@/lib/ai/credits.js';

const SESSION_COOKIE = 'user_session';
const LOGO_REFRESH_DAYS = 7;
const VISION_MODEL = 'gemini-2.0-flash';
const MAX_CANDIDATES = 8;

let _cloudinaryConfigured = false;
function ensureCloudinaryConfig() {
  if (_cloudinaryConfigured) return;
  const cUrl = process.env.CLOUDINARY_URL;
  if (cUrl) {
    const match = cUrl.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/);
    if (match) {
      cloudinary.config({ cloud_name: match[3], api_key: match[1], api_secret: match[2], secure: true });
    }
  }
  if (!cloudinary.config().api_key) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }
  _cloudinaryConfigured = true;
}

function getDomain(url) {
  if (!url) return null;
  try {
    const withProtocol = url.startsWith('http') ? url : `https://${url}`;
    return new URL(withProtocol).hostname;
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0];
  }
}

function getBaseUrl(url) {
  if (!url) return null;
  try {
    const withProtocol = url.startsWith('http') ? url : `https://${url}`;
    const parsed = new URL(withProtocol);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

/**
 * Resolve a potentially relative URL to an absolute URL
 */
function resolveUrl(src, baseUrl) {
  if (!src) return null;
  try {
    if (src.startsWith('data:')) return null;
    if (src.startsWith('http://') || src.startsWith('https://')) return src;
    if (src.startsWith('//')) return `https:${src}`;
    if (src.startsWith('/')) return `${baseUrl}${src}`;
    return `${baseUrl}/${src}`;
  } catch {
    return null;
  }
}

/**
 * Extract the src from an <img> tag. Handles src, data-src, data-lazy-src, srcset.
 */
function extractImgSrc(imgTag) {
  // Try src first
  const srcMatch = imgTag.match(/\bsrc="([^"]+)"/i)
    || imgTag.match(/\bsrc='([^']+)'/i);
  if (srcMatch && !srcMatch[1].startsWith('data:')) return srcMatch[1];

  // Try data-src (lazy-loaded)
  const dataSrcMatch = imgTag.match(/\bdata-src="([^"]+)"/i)
    || imgTag.match(/\bdata-src='([^']+)'/i);
  if (dataSrcMatch) return dataSrcMatch[1];

  // Try data-lazy-src
  const lazyMatch = imgTag.match(/\bdata-lazy-src="([^"]+)"/i)
    || imgTag.match(/\bdata-lazy-src='([^']+)'/i);
  if (lazyMatch) return lazyMatch[1];

  // Try first entry from srcset
  const srcsetMatch = imgTag.match(/\bsrcset="([^"]+)"/i)
    || imgTag.match(/\bsrcset='([^']+)'/i);
  if (srcsetMatch) {
    const firstEntry = srcsetMatch[1].split(',')[0].trim().split(/\s+/)[0];
    if (firstEntry && !firstEntry.startsWith('data:')) return firstEntry;
  }

  return null;
}

/**
 * Scan the full HTML for every <img> tag whose tag or surrounding context
 * contains the word "logo" (case-insensitive). Returns deduplicated candidates.
 *
 * For each <img> we check:
 * 1. The <img> tag itself (all attributes: class, id, alt, title, src path, data-*)
 * 2. The surrounding context (300 chars before the <img>) to catch parent
 *    elements like <div class="site-logo">, <a class="logo-link">, etc.
 */
function extractLogoCandidates(html, baseUrl) {
  const candidates = [];
  const seen = new Set();

  function add(url, reason, context, inHeaderFooter = false) {
    // Decode common HTML entities in URLs (e.g. &amp; → &)
    const cleaned = url.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
    const resolved = resolveUrl(cleaned, baseUrl);
    if (!resolved || seen.has(resolved)) return;
    seen.add(resolved);
    candidates.push({ url: resolved, reason, context: context?.substring(0, 500), inHeaderFooter });
  }

  /**
   * Scan a chunk of HTML for <img> tags whose tag or 300-char parent context
   * contains "logo". The inHeaderFooter flag marks whether this chunk is from
   * a <header>/<footer>/<nav> block.
   */
  function scanImgTags(htmlChunk, chunkOffset, inHeaderFooter) {
    const imgTagRe = /<img\b[^>]*>/gi;
    let match;
    while ((match = imgTagRe.exec(htmlChunk)) !== null) {
      const imgTag = match[0];
      const imgPos = match.index;
      const src = extractImgSrc(imgTag);
      if (!src) continue;

      // Get 300 chars before this <img> as parent context
      const absPos = chunkOffset + imgPos;
      const contextStart = Math.max(0, absPos - 300);
      const parentContext = html.substring(contextStart, absPos);

      // Check if "logo" appears in the img tag itself OR in parent context
      const logoInTag = /logo/i.test(imgTag);
      const logoInContext = /logo/i.test(parentContext);
      const logoInSrc = /logo/i.test(src);

      if (logoInTag || logoInContext || logoInSrc) {
        let reason = 'unknown';
        if (logoInTag && logoInContext) reason = 'logo-in-tag+context';
        else if (logoInTag) reason = 'logo-in-tag';
        else if (logoInSrc) reason = 'logo-in-src';
        else if (logoInContext) reason = 'logo-in-parent';

        add(src, reason, parentContext + imgTag, inHeaderFooter);
      }
    }
  }

  // Strategy 1a: Scan <header>, <footer>, <nav> blocks first (most likely logo locations)
  const structuralRe = /<(header|footer|nav)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let structMatch;
  while ((structMatch = structuralRe.exec(html)) !== null) {
    scanImgTags(structMatch[2], structMatch.index + structMatch[0].indexOf(structMatch[2]), true);
  }

  // Strategy 1b: Scan the full page for any remaining logo images not in header/footer
  scanImgTags(html, 0, false);

  // Strategy 2: Schema.org structured data "logo" field  
  const schemaLogoRe = /"logo"\s*:\s*(?:"([^"]+)"|{\s*[^}]*"url"\s*:\s*"([^"]+)")/gi;
  let schemaMatch;
  while ((schemaMatch = schemaLogoRe.exec(html)) !== null) {
    const url = schemaMatch[1] || schemaMatch[2];
    if (url && /^https?:\/\//.test(url)) {
      add(url, 'schema-org', 'JSON-LD logo field');
    }
  }

  // Strategy 3: WordPress custom-logo (might use data-src and not be caught above)
  const wpMatch = html.match(/class="[^"]*custom-logo[^"]*"/i);
  if (wpMatch) {
    const wpImgRe = /<img[^>]*class="[^"]*custom-logo[^"]*"[^>]*>/gi;
    let m;
    while ((m = wpImgRe.exec(html)) !== null) {
      const src = extractImgSrc(m[0]);
      if (src) add(src, 'wp-custom-logo', m[0]);
    }
  }

  // Strategy 4: Open Graph image (og:image meta tag) - often a branded/logo image
  const ogImageRe = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi;
  const ogImageRe2 = /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/gi;
  for (const re of [ogImageRe, ogImageRe2]) {
    let ogMatch;
    while ((ogMatch = re.exec(html)) !== null) {
      if (ogMatch[1]) add(ogMatch[1], 'og-image', 'Open Graph og:image');
    }
  }

  // Strategy 5: Apple touch icon / large favicon - often a high-res logo
  const touchIconRe = /<link[^>]+rel=["']apple-touch-icon[^"']*["'][^>]+href=["']([^"']+)["']/gi;
  const touchIconRe2 = /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']apple-touch-icon[^"']*["']/gi;
  for (const re of [touchIconRe, touchIconRe2]) {
    let tiMatch;
    while ((tiMatch = re.exec(html)) !== null) {
      if (tiMatch[1]) add(tiMatch[1], 'apple-touch-icon', 'link rel=apple-touch-icon');
    }
  }

  // Sort: header/footer candidates first, then others
  candidates.sort((a, b) => (b.inHeaderFooter ? 1 : 0) - (a.inHeaderFooter ? 1 : 0));

  const limited = candidates.slice(0, MAX_CANDIDATES);
  console.log(`[Logo] Extracted ${candidates.length} candidates (using top ${limited.length}) for ${baseUrl}`);
  for (const c of limited) {
    console.log(`  [Logo]   - ${c.reason}${c.inHeaderFooter ? ' [header/footer]' : ''}: ${c.url}`);
  }
  return limited;
}

/**
 * Download an image and return its buffer + content type.
 * Returns null if the image can't be fetched or is too small.
 */
async function downloadImage(url) {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GhostPostBot/1.0)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      console.log(`  [Logo]   Download FAILED (${response.status}): ${url}`);
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    const isSvg = contentType.includes('svg') || url.toLowerCase().endsWith('.svg');

    if (!contentType.includes('image/') && !isSvg) {
      console.log(`  [Logo]   Download SKIP (not image: ${contentType}): ${url}`);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 100) {
      console.log(`  [Logo]   Download SKIP (too small: ${buffer.length}b): ${url}`);
      return null;
    }

    const mimeType = isSvg ? 'image/svg+xml' : contentType.split(';')[0];
    console.log(`  [Logo]   Downloaded OK (${(buffer.length / 1024).toFixed(1)}KB, ${mimeType}${isSvg ? ' [SVG]' : ''}): ${url}`);
    return { buffer, mimeType, isSvg };
  } catch (err) {
    console.log(`  [Logo]   Download ERROR: ${url} - ${err.message}`);
    return null;
  }
}

/**
 * Score an SVG candidate using heuristic signals.
 * Gemini Vision can't process SVGs, so we use context-based scoring instead.
 */
function scoreSvgCandidate(candidate, html) {
  let score = 0;
  const url = candidate.url || '';
  const context = (candidate.context || '').toLowerCase();

  // Filename analysis
  const filename = url.split('/').pop()?.split('?')[0]?.toLowerCase() || '';
  if (/^logo[^a-z]/i.test(filename) || filename === 'logo.svg') score += 5;
  else if (/logo/i.test(filename)) score += 3;

  // Penalty for clearly non-logo filenames (icons, social, clock, etc.)
  // Only apply if filename does NOT also contain "logo"
  if (!/logo/i.test(filename) && /icon|clock|search|arrow|chevron|facebook|google|instagram|twitter|whatsapp|email/i.test(filename)) score -= 4;

  // "logo" in alt text
  if (/alt=["'][^"']*logo[^"']*["']/i.test(candidate.context || '')) score += 4;

  // Appears in header/nav context (text-based check)
  if (/header|nav\b|brand|site-logo/i.test(context)) score += 3;

  // Found inside a <header>, <footer>, or <nav> element (structural check)
  if (candidate.inHeaderFooter) score += 4;

  // Source is from og:image or apple-touch-icon (strong signal)
  if (candidate.reason === 'og-image' || candidate.reason === 'apple-touch-icon') score += 3;

  // Position in HTML - earlier = likely header logo
  const pos = html.indexOf(url);
  if (pos >= 0) {
    const ratio = pos / html.length;
    if (ratio < 0.1) score += 4;
    else if (ratio < 0.2) score += 3;
    else if (ratio < 0.3) score += 2;
  }

  // Penalty for appearing many times (template/fallback, not main logo)
  const occurrences = html.split(url).length - 1;
  if (occurrences > 3) score -= 3;
  if (occurrences > 5) score -= 3;

  return score;
}

/**
 * Use Gemini Vision to pick the best logo from candidate images.
 * Sends all candidates in a single request and asks AI to pick one.
 * Returns the 1-based index of the best logo, or 0 if none is a logo.
 */
async function aiPickLogo(candidateImages, domain) {
  console.log(`[Logo AI] Sending ${candidateImages.length} images to Gemini for ${domain}...`);

  const content = [
    {
      type: 'text',
      text: `You are analyzing images extracted from the website "${domain}".
These are candidate logo images found on the home page. Your task:
1. Identify which image is the **primary website/brand logo**.
2. A logo is typically: a company name in stylized text, a symbol/icon representing the brand, or a combination mark. It's usually found in the header/navigation area.
3. Ignore: hero banners, product photos, background images, generic icons, social media icons, advertising images, and partner/client logos.
4. If multiple candidates could be logos, pick the one most likely to be the main site logo.
5. If NONE of the images is a website logo, respond with 0.

There are ${candidateImages.length} candidate image(s) numbered 1 through ${candidateImages.length}.
Reply with ONLY a single number (the 1-based index of the best logo, or 0 if none). No explanation.`,
    },
  ];

  for (const img of candidateImages) {
    content.push({ type: 'image', image: img.buffer, mimeType: img.mimeType });
  }

  try {
    const result = await generateText({
      model: google(VISION_MODEL),
      messages: [{ role: 'user', content }],
      temperature: 0.1,
      maxTokens: 10,
    });

    const usage = result.usage || {};
    logAIUsage({
      operation: 'DETECT_SITE_LOGO',
      inputTokens: usage.promptTokens || 0,
      outputTokens: usage.completionTokens || 0,
      totalTokens: usage.totalTokens || 0,
      model: VISION_MODEL,
      metadata: { domain, candidateCount: candidateImages.length },
    });

    const answer = (result.text || '').trim();
    const idx = parseInt(answer, 10);
    console.log(`[Logo AI] Gemini answered: "${answer}" → index ${idx}`);

    if (isNaN(idx) || idx < 0 || idx > candidateImages.length) return 0;
    return idx;
  } catch (error) {
    console.error('[Logo AI] Gemini vision failed:', error.message);
    return 0;
  }
}

/**
 * Use AI to determine the ideal background color for the logo in light and dark themes.
 * For SVGs: convert to PNG via Cloudinary to make it analyzable by Gemini.
 * Returns { logoBgLight, logoBgDark } with CSS color values.
 */
async function aiDetermineLogoBg(chosenImage, domain) {
  const defaults = { logoBgLight: 'transparent', logoBgDark: 'transparent' };
  try {
    let imageBuffer = chosenImage.buffer;
    let imageMimeType = chosenImage.mimeType;

    // SVGs can't be analyzed by Gemini Vision - convert to PNG via re-download from Cloudinary
    if (chosenImage.isSvg) {
      // Upload temporarily if not already, or use the already-uploaded Cloudinary URL
      // We use the original SVG buffer and wrap it as a data URI for conversion
      const svgBase64 = chosenImage.buffer.toString('base64');
      const svgDataUri = `data:image/svg+xml;base64,${svgBase64}`;
      ensureCloudinaryConfig();
      const tmpResult = await cloudinary.uploader.upload(svgDataUri, {
        folder: 'ghostpost/tmp',
        public_id: `logo-bg-check-${Date.now()}`,
        resource_type: 'image',
        format: 'png',
        overwrite: true,
      });
      // Download the PNG version
      const pngUrl = tmpResult.secure_url;
      const pngRes = await fetch(pngUrl, { signal: AbortSignal.timeout(8000) });
      if (pngRes.ok) {
        imageBuffer = Buffer.from(await pngRes.arrayBuffer());
        imageMimeType = 'image/png';
      }
      // Clean up temp file (fire-and-forget)
      cloudinary.uploader.destroy(tmpResult.public_id, { resource_type: 'image' }).catch(() => {});
    }

    console.log(`[Logo BG] Analyzing logo background needs for ${domain}...`);

    const result = await generateText({
      model: google(VISION_MODEL),
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Analyze this website logo image. I need to display it on both light and dark themed backgrounds.

Determine the ideal background for each theme:
- **Light theme** (white/light gray page): Does the logo need a background to be visible? If the logo has transparent parts that blend into white, or is mostly white/very light, suggest a subtle contrasting background.
- **Dark theme** (very dark/black page): Does the logo need a background to be visible? If the logo is mostly black/very dark, or has dark elements that would disappear on a dark background, suggest a suitable contrasting background.

Rules:
- If the logo is clearly visible on the theme's background, use "transparent" (no background needed).
- If a background is needed, provide a subtle, rounded-corner-friendly CSS color that makes the logo pop without clashing. Prefer soft neutrals or very light/dark shades.
- Use hex colors (e.g., #ffffff, #1a1a1a, #f0f0f0) or "transparent".

Reply with EXACTLY this JSON format, nothing else:
{"light":"<css-color>","dark":"<css-color>"}`,
          },
          { type: 'image', image: imageBuffer, mimeType: imageMimeType },
        ],
      }],
      temperature: 0.1,
      maxTokens: 50,
    });

    const usage = result.usage || {};
    logAIUsage({
      operation: 'DETECT_LOGO_BG',
      inputTokens: usage.promptTokens || 0,
      outputTokens: usage.completionTokens || 0,
      totalTokens: usage.totalTokens || 0,
      model: VISION_MODEL,
      metadata: { domain },
    });

    const text = (result.text || '').trim();
    console.log(`[Logo BG] AI response: ${text}`);

    // Parse JSON from response (handle markdown code blocks)
    const jsonStr = text.replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(jsonStr);
    const light = parsed.light || 'transparent';
    const dark = parsed.dark || 'transparent';

    // Validate values look like CSS colors
    const isValid = (v) => v === 'transparent' || /^#[0-9a-f]{3,8}$/i.test(v) || /^rgba?\(/i.test(v);
    return {
      logoBgLight: isValid(light) ? light : 'transparent',
      logoBgDark: isValid(dark) ? dark : 'transparent',
    };
  } catch (err) {
    console.error(`[Logo BG] Failed to determine backgrounds:`, err.message);
    return defaults;
  }
}

/**
 * Fetch, identify, and upload site logo to Cloudinary.
 * Pipeline: scrape HTML → extract candidates → download images → AI pick → upload
 */
async function fetchAndUploadLogo(siteUrl, siteId) {
  const domain = getDomain(siteUrl);
  const baseUrl = getBaseUrl(siteUrl);
  if (!domain || !baseUrl) return null;

  console.log(`[Logo] Starting logo detection for ${domain} (${baseUrl})`);

  // Step 1: Fetch the home page HTML
  let html = '';
  try {
    const htmlResponse = await fetch(baseUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      signal: AbortSignal.timeout(15000),
    });
    if (!htmlResponse.ok) {
      console.log(`[Logo] Failed to fetch ${baseUrl}: HTTP ${htmlResponse.status}`);
      return null;
    }
    html = await htmlResponse.text();
    console.log(`[Logo] Fetched HTML: ${(html.length / 1024).toFixed(1)}KB`);
  } catch (err) {
    console.log(`[Logo] Failed to fetch ${baseUrl}: ${err.message}`);
    return null;
  }

  // Step 2: Extract logo candidates from DOM
  const candidates = extractLogoCandidates(html, baseUrl);
  if (candidates.length === 0) {
    console.log(`[Logo] No logo candidates found for ${domain}`);
    return null;
  }

  // Step 3: Download candidate images in parallel
  console.log(`[Logo] Downloading ${candidates.length} candidate images...`);
  const downloadResults = await Promise.all(
    candidates.map(async (c) => {
      const img = await downloadImage(c.url);
      return img ? { ...img, url: c.url, reason: c.reason } : null;
    })
  );
  const validImages = downloadResults.filter(Boolean);
  console.log(`[Logo] ${validImages.length}/${candidates.length} images downloaded successfully`);

  if (validImages.length === 0) {
    console.log(`[Logo] No valid images downloaded for ${domain}`);
    return null;
  }

  // Step 4: Separate SVG and raster images (Gemini Vision can't process SVGs)
  const svgImages = validImages.filter(img => img.isSvg);
  const rasterImages = validImages.filter(img => !img.isSvg);
  console.log(`[Logo] ${rasterImages.length} raster + ${svgImages.length} SVG images`);

  let chosenImage = null;

  // Try AI with raster images first
  if (rasterImages.length > 0) {
    const aiChoice = await aiPickLogo(rasterImages, domain);
    if (aiChoice > 0 && aiChoice <= rasterImages.length) {
      chosenImage = rasterImages[aiChoice - 1];
      console.log(`[Logo] AI chose raster #${aiChoice} (${chosenImage.reason}): ${chosenImage.url}`);
    }
  }

  // If AI didn't find a logo in rasters, try SVG heuristic scoring
  if (!chosenImage && svgImages.length > 0) {
    console.log(`[Logo] Trying SVG heuristic scoring (${svgImages.length} SVG candidates)...`);
    const scored = svgImages
      .map((img) => {
        const candidate = candidates.find(c => c.url === img.url) || { url: img.url, context: '' };
        const score = scoreSvgCandidate(candidate, html);
        console.log(`  [Logo]   SVG score=${score}: ${img.url}`);
        return { img, score };
      })
      .sort((a, b) => b.score - a.score);

    if (scored[0].score >= 3) {
      chosenImage = scored[0].img;
      console.log(`[Logo] Picked SVG by heuristic (score=${scored[0].score}): ${chosenImage.url}`);
    } else {
      console.log(`[Logo] SVG candidates scored too low (best: ${scored[0].score})`);
    }
  }

  if (!chosenImage) {
    console.log(`[Logo] No logo identified for ${domain}`);
    return null;
  }

  // Step 5: Upload to Cloudinary
  console.log(`[Logo] Uploading to Cloudinary: ghostpost/logos/site-${siteId}`);
  const base64 = chosenImage.buffer.toString('base64');
  const dataUri = `data:${chosenImage.mimeType};base64,${base64}`;

  ensureCloudinaryConfig();

  const result = await cloudinary.uploader.upload(dataUri, {
    folder: 'ghostpost/logos',
    public_id: `site-${siteId}`,
    resource_type: 'image',
    overwrite: true,
  });

  console.log(`[Logo] ✓ Logo saved for ${domain}: ${result.secure_url}`);

  // Step 6: Use AI to determine ideal backgrounds for light/dark themes
  const logoBg = await aiDetermineLogoBg(chosenImage, domain);

  return { logoUrl: result.secure_url, ...logoBg };
}

// POST - Check and refresh logo for a site
export async function POST(request, { params }) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: siteId } = await params;
    console.log(`[Logo] Check requested for site ${siteId}`);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { lastSelectedAccountId: true, isSuperAdmin: true },
    });

    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, url: true, accountId: true, logo: true, logoCheckedAt: true, logoBgLight: true, logoBgDark: true },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    if (!user?.isSuperAdmin && site.accountId !== user?.lastSelectedAccountId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Check if refresh is needed (force=true bypasses cache)
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';
    const now = new Date();
    const needsRefresh = force || !site.logo || !site.logoCheckedAt ||
      (now - new Date(site.logoCheckedAt)) > LOGO_REFRESH_DAYS * 24 * 60 * 60 * 1000;

    if (!needsRefresh) {
      console.log(`[Logo] No refresh needed for ${site.url} (checked ${site.logoCheckedAt})`);
      return NextResponse.json({ logo: site.logo, logoBgLight: site.logoBgLight, logoBgDark: site.logoBgDark, refreshed: false });
    }

    console.log(`[Logo] Refresh needed for ${site.url}${force ? ' (forced)' : ''}`);

    try {
      const result = await fetchAndUploadLogo(site.url, site.id);
      const newLogoUrl = result?.logoUrl;
      const logoBgLight = result?.logoBgLight || null;
      const logoBgDark = result?.logoBgDark || null;

      await prisma.site.update({
        where: { id: siteId },
        data: {
          logo: newLogoUrl || site.logo,
          logoCheckedAt: now,
          logoBgLight,
          logoBgDark,
        },
      });

      return NextResponse.json({
        logo: newLogoUrl || site.logo,
        logoBgLight,
        logoBgDark,
        refreshed: true,
      });
    } catch (fetchError) {
      console.error(`[Logo] Failed to fetch logo for ${site.url}:`, fetchError.message);

      await prisma.site.update({
        where: { id: siteId },
        data: { logoCheckedAt: now },
      });

      return NextResponse.json({ logo: site.logo, logoBgLight: site.logoBgLight, logoBgDark: site.logoBgDark, refreshed: false });
    }
  } catch (error) {
    console.error('[Logo] Error:', error);
    return NextResponse.json({ error: 'Failed to check logo' }, { status: 500 });
  }
}
