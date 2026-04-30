import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { generateStructuredResponse } from '@/lib/ai/gemini';
import { trackAIUsage } from '@/lib/ai/credits-service';
import { enforceCredits } from '@/lib/account-limits';
import { BOT_FETCH_HEADERS, WAF_BLOCK_STATUSES } from '@/lib/bot-identity';
import { z } from 'zod';

const SESSION_COOKIE = 'user_session';

/**
 * POST /api/interview/analyze
 * Proactive Onboarding: Analyze a website and extract business intelligence
 * 
 * This endpoint performs:
 * 1. URL validation & health check
 * 2. Platform detection (WordPress, Shopify, Wix, etc.)
 * 3. Content extraction (business name, niche, services, keywords)
 * 4. AI inference for goals and audience
 * 5. Competitor discovery via SERP analysis
 */
export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    // Registered users AND mid-registration draft users both carry user_session.
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Load the user's account. For mid-registration drafts we skip credits
    // entirely - the account has no balance yet and isn't a real customer.
    let accountId = null;
    let isDraftAccount = false;
    {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          lastSelectedAccountId: true,
          accountMemberships: {
            select: { accountId: true, account: { select: { id: true, isDraft: true } } },
            take: 1,
          },
        },
      });
      if (user) {
        const lastSelected = user.lastSelectedAccountId;
        const firstMembership = user.accountMemberships?.[0];
        accountId = lastSelected || firstMembership?.accountId || null;
        if (accountId) {
          if (firstMembership?.account?.id === accountId) {
            isDraftAccount = !!firstMembership.account.isDraft;
          } else {
            const acc = await prisma.account.findUnique({
              where: { id: accountId },
              select: { isDraft: true },
            });
            isDraftAccount = !!acc?.isDraft;
          }
        }
      }
    }

    const { url, userLocale } = await request.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // ── Enforce Ai-GCoin limit (real accounts only) ─────────
    if (accountId && !isDraftAccount) {
      const creditCheck = await enforceCredits(accountId, 5); // CRAWL_WEBSITE = 5 credits
      if (!creditCheck.allowed) {
        return NextResponse.json(
          { ...creditCheck, errorCode: 'INSUFFICIENT_CREDITS' },
          { status: 402 }
        );
      }
    }

    // Normalize URL
    const normalizedUrl = normalizeUrl(url);

    // Run analysis. userLocale (user's UI locale) is forwarded to the AI step
    // so human-readable fields (description, niche, services, audience, goals)
    // come back in the chat's language even when the site itself is in another.
    const analysis = await analyzeWebsite(normalizedUrl, { userLocale });

    // Track AI usage if user is logged in with a real (non-draft) account
    let creditsUsed = 0;
    if (accountId && userId && !isDraftAccount) {
      const trackResult = await trackAIUsage({
        accountId,
        userId,
        operation: 'CRAWL_WEBSITE',
        description: `Website analysis for ${normalizedUrl}`,
        metadata: { url: normalizedUrl },
      });
      
      if (trackResult.success) {
        creditsUsed = trackResult.totalUsed;
      }
    }

    // If the site was unreachable, surface an error code the client can translate.
    // WAF_BLOCKED is distinct from SITE_UNREACHABLE so the UI can show
    // allowlist instructions instead of "site unreachable, check the URL".
    if (analysis && analysis.isReachable === false) {
      return NextResponse.json(
        {
          success: false,
          errorCode: analysis.wafBlocked ? 'WAF_BLOCKED' : 'SITE_UNREACHABLE',
          error: analysis.error || 'Site unreachable',
          analysis,
        },
        { status: 200 }
      );
    }

    return NextResponse.json({
      success: true,
      analysis,
      // Include updated credits for frontend to update UI
      creditsUpdated: creditsUsed > 0 ? { used: creditsUsed } : null,
    });

  } catch (error) {
    console.error('[Analyze] Error:', error);
    const isInvalidUrl = /invalid url/i.test(error?.message || '');
    return NextResponse.json(
      {
        success: false,
        errorCode: isInvalidUrl ? 'INVALID_URL' : 'ANALYSIS_FAILED',
        error: error.message || 'Analysis failed',
      },
      { status: isInvalidUrl ? 400 : 500 }
    );
  }
}

/**
 * Map an ISO 639-1 language code to a human-readable language name. Used
 * in AI prompts so the model gets the actual language name ("Hebrew") rather
 * than a code ("he") it might mis-handle. Defaults to "English" for codes
 * we don't have a friendly name for.
 */
function languageCodeToName(code) {
  const map = {
    he: 'Hebrew', en: 'English', ar: 'Arabic', es: 'Spanish', fr: 'French',
    de: 'German', it: 'Italian', pt: 'Portuguese', ru: 'Russian',
    nl: 'Dutch', pl: 'Polish', sv: 'Swedish', no: 'Norwegian', da: 'Danish',
    fi: 'Finnish', el: 'Greek', tr: 'Turkish', th: 'Thai', vi: 'Vietnamese',
    id: 'Indonesian', ms: 'Malay', hi: 'Hindi', zh: 'Chinese', ja: 'Japanese',
    ko: 'Korean', cs: 'Czech', hu: 'Hungarian', ro: 'Romanian', uk: 'Ukrainian',
  };
  return map[(code || '').toLowerCase()] || 'English';
}

/**
 * Normalize URL (add https://, handle www, etc.)
 */
function normalizeUrl(url) {
  let normalized = url.trim();
  
  // Remove trailing slash
  normalized = normalized.replace(/\/+$/, '');
  
  // Add protocol if missing
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = 'https://' + normalized;
  }
  
  // Try to parse and validate
  try {
    const parsed = new URL(normalized);
    return parsed.origin;
  } catch {
    throw new Error('Invalid URL format');
  }
}

/**
 * Main analysis function
 *
 * @param {string} url
 * @param {object} options
 * @param {string} [options.userLocale] - User UI locale ("he", "en", ...).
 *   When provided, AI text fields are written in this locale regardless of
 *   the site's own language, so the registration chat stays monolingual.
 */
async function analyzeWebsite(url, options = {}) {
  const { userLocale } = options;
  const results = {
    url,
    isReachable: false,
    platform: null,
    businessInfo: {
      name: null,
      niche: null,
      description: null,
    },
    services: [],
    keywords: {
      fromMeta: [],
      fromHeadings: [],
      suggested: [],
    },
    seoData: {
      title: null,
      description: null,
      hasH1: false,
      hasSitemap: false,
    },
    contentStyle: {
      hasBlog: false,
      tone: null,
      language: null,
    },
    // Language variants discovered via hreflang (only populated when >= 2 variants found)
    languages: [],
    competitors: [],
    inferredGoals: [],
    inferredAudience: null,
  };

  // Step 1: Health check & fetch homepage
  const homepageData = await fetchAndParsePage(url);

  if (!homepageData.success) {
    results.error = homepageData.error;
    if (homepageData.wafBlocked) {
      results.wafBlocked = true;
    }
    return results;
  }
  
  results.isReachable = true;
  
  // Step 2: Extract data from homepage
  const { html, headers } = homepageData;
  
  // Platform detection
  results.platform = detectPlatform(html, headers);
  
  // Extract SEO data
  results.seoData = extractSeoData(html);
  
  // Extract business info
  results.businessInfo = extractBusinessInfo(html, url);
  
  // Extract keywords from headings and meta
  results.keywords = extractKeywords(html);
  
  console.log('[Analyze] Extracted keywords:', {
    fromMeta: results.keywords.fromMeta?.length || 0,
    fromHeadings: results.keywords.fromHeadings?.length || 0,
    headings: results.keywords.fromHeadings?.slice(0, 5).map(h => `${h.level}: ${h.text}`),
  });
  
  // Detect language
  results.contentStyle.language = detectLanguage(html);

  // Detect multi-language variants via hreflang
  results.languages = extractLanguageVariants(html, url, results.contentStyle.language);
  
  console.log('[Analyze] Detection results:', {
    platform: results.platform?.name,
    language: results.contentStyle.language,
    businessName: results.businessInfo?.name,
    title: results.seoData?.title,
  });
  
  // Step 3: Check for blog/content
  results.contentStyle.hasBlog = await checkForBlog(url, results.platform);
  
  // Step 4: Check for sitemap
  results.seoData.hasSitemap = await checkSitemap(url);
  
  // Step 5: Fetch additional pages for more context
  const additionalData = await fetchAdditionalPages(url, html);
  
  // Merge services from about/services pages
  if (additionalData.services.length > 0) {
    results.services = additionalData.services;
  }
  
  // Step 6: AI-powered analysis for keywords, competitors, and business understanding
  console.log('[Analyze] Running AI analysis...');
  const aiAnalysis = await analyzeWithAI(
    results,
    html,
    additionalData.pagesContent || [],
    { userLocale },
  );
  
  // Merge AI insights
  if (aiAnalysis) {
    // AI-suggested keywords
    if (aiAnalysis.keywords?.length > 0) {
      results.keywords.suggested = aiAnalysis.keywords;
    }
    
    // AI-suggested competitors
    if (aiAnalysis.competitors?.length > 0) {
      results.competitors = aiAnalysis.competitors.map((c, i) => ({
        domain: c.domain || c.name.toLowerCase().replace(/\s+/g, '') + '.co.il',
        url: c.url || `https://${c.domain || c.name.toLowerCase().replace(/\s+/g, '') + '.co.il'}`,
        name: c.name,
        reasoning: c.reasoning,
        ranking: i + 1,
      }));
    }
    
    // AI-refined business info
    if (aiAnalysis.businessDescription) {
      results.businessInfo.description = aiAnalysis.businessDescription;
    }
    if (aiAnalysis.businessNiche && !results.businessInfo.niche) {
      results.businessInfo.niche = aiAnalysis.businessNiche;
    }
    if (aiAnalysis.services?.length > 0) {
      results.services = aiAnalysis.services;
    }
    
    // AI-inferred goals and audience
    if (aiAnalysis.goals?.length > 0) {
      results.inferredGoals = aiAnalysis.goals.map((g, i) => ({
        id: `goal-${i}`,
        label: g.labelEn,
        labelHe: g.labelHe,
        confidence: g.confidence || 0.8,
      }));
    }
    if (aiAnalysis.targetAudience) {
      results.inferredAudience = aiAnalysis.targetAudience;
    }
  } else {
    // Fallback to rule-based inference if AI fails. Pass userLocale so the
    // rule-based audience copy still matches the chat's display language.
    results.inferredGoals = inferSeoGoals(results);
    results.inferredAudience = inferTargetAudience(results, userLocale);

    // Try Google search for competitors as fallback
    results.competitors = await findCompetitors(results);
  }

  // Step 7: Lightweight SEO audit - rule-based checks on the raw data we
  // already have. Surfaced to the user at the end of the onboarding flow.
  results.seoIssues = detectSeoIssues(results, html);

  return results;
}

/**
 * Detect common SEO issues from the already-extracted data.
 * Each issue has a stable `type`, a `severity`, and `titleKey`/`descriptionKey`
 * that the client resolves via its i18n dictionary.
 */
function detectSeoIssues(results, html) {
  const issues = [];
  const seo = results.seoData || {};
  const title = seo.title || '';
  const description = seo.description || '';

  if (!title) {
    issues.push({ type: 'MISSING_TITLE', severity: 'error' });
  } else if (title.length < 30) {
    issues.push({ type: 'SHORT_TITLE', severity: 'warning', meta: { length: title.length } });
  } else if (title.length > 65) {
    issues.push({ type: 'LONG_TITLE', severity: 'warning', meta: { length: title.length } });
  }

  if (!description) {
    issues.push({ type: 'MISSING_META_DESCRIPTION', severity: 'error' });
  } else if (description.length < 120) {
    issues.push({ type: 'SHORT_META_DESCRIPTION', severity: 'warning', meta: { length: description.length } });
  } else if (description.length > 160) {
    issues.push({ type: 'LONG_META_DESCRIPTION', severity: 'warning', meta: { length: description.length } });
  }

  if (!seo.hasH1) {
    issues.push({ type: 'MISSING_H1', severity: 'error' });
  }

  if (!seo.hasSitemap) {
    issues.push({ type: 'MISSING_SITEMAP', severity: 'warning' });
  }

  const headings = results.keywords?.fromHeadings || [];
  if (headings.length > 0 && headings.length < 3) {
    issues.push({ type: 'LOW_HEADING_COUNT', severity: 'warning', meta: { count: headings.length } });
  }

  // Image alt text - scan for <img> tags missing alt attributes (simple check)
  const imgTags = (html.match(/<img\b[^>]*>/gi) || []);
  if (imgTags.length) {
    const missingAlt = imgTags.filter((tag) => !/\balt=["']/.test(tag)).length;
    if (missingAlt > 0) {
      issues.push({
        type: 'IMAGES_MISSING_ALT',
        severity: 'warning',
        meta: { missing: missingAlt, total: imgTags.length },
      });
    }
  }

  // Open Graph check - no og:title
  if (!/<meta[^>]+property=["']og:title["']/i.test(html)) {
    issues.push({ type: 'MISSING_OG_TAGS', severity: 'info' });
  }

  return issues;
}

/**
 * Fetch and parse a webpage. Sends the GhostSEOBot identity in the User-Agent
 * so site owners can recognize and allowlist us in their WAF instead of us
 * having to spoof a browser. Surfaces WAF-shaped status codes (401/403/406/429/503)
 * as `wafBlocked` so the caller can show allowlist instructions rather than
 * a generic "site unreachable" error.
 */
async function fetchAndParsePage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      headers: BOT_FETCH_HEADERS,
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);
    if (!response.ok) {
      const wafBlocked = WAF_BLOCK_STATUSES.has(response.status);
      console.log(`[Analyze] Fetch failed for ${url}: HTTP ${response.status}${wafBlocked ? ' (WAF block)' : ''}`);
      return { success: false, status: response.status, wafBlocked, error: `HTTP ${response.status}` };
    }
    const html = await response.text();
    const responseHeaders = Object.fromEntries(response.headers.entries());
    console.log(`[Analyze] Fetched ${url}: ${html.length} chars`);
    return { success: true, html, headers: responseHeaders };
  } catch (error) {
    clearTimeout(timeout);
    return { success: false, error: error.message };
  }
}

/**
 * Detect CMS/Platform
 */
function detectPlatform(html, headers) {
  const platforms = [];
  
  // WordPress indicators - match multiple signals for robustness
  const wpSignals = [
    /(?:src|href)=["'][^"']*\/wp-content\//i.test(html),
    /(?:src|href)=["'][^"']*\/wp-includes\//i.test(html),
    /<meta[^>]*generator[^>]*WordPress/i.test(html),
    /<link[^>]*rel=["']https:\/\/api\.w\.org\//i.test(html),
    /\/wp-json\//i.test(html),
    /wp-emoji/i.test(html),
    /<link[^>]*wp-block-/i.test(html),
  ];
  const wpScore = wpSignals.filter(Boolean).length;
  
  if (wpScore >= 1) {
    platforms.push({ name: 'WordPress', confidence: Math.min(0.5 + wpScore * 0.1, 0.95) });
    console.log(`[Analyze] WordPress detected with ${wpScore}/7 signals`);
  }
  
  // Shopify indicators
  if (html.includes('cdn.shopify.com') || html.includes('Shopify.theme')) {
    platforms.push({ name: 'Shopify', confidence: 0.9 });
  }
  
  // Wix indicators
  if (html.includes('wix.com') || html.includes('wixstatic.com') || html.includes('_wix_browser_sess')) {
    platforms.push({ name: 'Wix', confidence: 0.9 });
  }
  
  // Squarespace indicators
  if (html.includes('squarespace.com') || html.includes('static1.squarespace.com')) {
    platforms.push({ name: 'Squarespace', confidence: 0.9 });
  }
  
  // Webflow indicators
  if (html.includes('webflow.com') || (html.includes('w-nav') && html.includes('w-container'))) {
    platforms.push({ name: 'Webflow', confidence: 0.8 });
  }
  
  // Elementor (WordPress plugin)
  if (html.includes('elementor')) {
    const wpPlatform = platforms.find(p => p.name === 'WordPress');
    if (wpPlatform) {
      wpPlatform.builder = 'Elementor';
    }
  }
  
  // Divi (WordPress theme)
  if (html.includes('et-boc') || html.includes('et_pb_')) {
    const wpPlatform = platforms.find(p => p.name === 'WordPress');
    if (wpPlatform) {
      wpPlatform.builder = 'Divi';
    }
  }
  
  // Header-based detection
  if (headers['x-powered-by']) {
    const powered = headers['x-powered-by'].toLowerCase();
    if (powered.includes('next.js')) {
      platforms.push({ name: 'Next.js', confidence: 0.95 });
    }
  }
  
  // Return highest confidence or Custom
  if (platforms.length === 0) {
    console.log('[Analyze] No platform detected, defaulting to Custom');
    return { name: 'Custom', confidence: 0.5 };
  }
  
  platforms.sort((a, b) => b.confidence - a.confidence);
  console.log('[Analyze] Platform detected:', platforms[0].name, 'confidence:', platforms[0].confidence);
  return platforms[0];
}

/**
 * Extract SEO-related data
 */
function extractSeoData(html) {
  const data = {
    title: null,
    description: null,
    hasH1: false,
    ogTitle: null,
    ogDescription: null,
    ogImage: null,
  };
  
  // Title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    data.title = titleMatch[1].trim();
  }
  
  // Meta description
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
                    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  if (descMatch) {
    data.description = descMatch[1].trim();
  }
  
  // OG tags
  const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (ogTitleMatch) {
    data.ogTitle = ogTitleMatch[1].trim();
  }
  
  const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  if (ogDescMatch) {
    data.ogDescription = ogDescMatch[1].trim();
  }
  
  const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  if (ogImageMatch) {
    data.ogImage = ogImageMatch[1].trim();
  }
  
  // H1
  data.hasH1 = /<h1[^>]*>/i.test(html);
  
  return data;
}

/**
 * Extract business information
 */
function extractBusinessInfo(html, url) {
  const info = {
    name: null,
    niche: null,
    description: null,
  };
  
  // Try to extract business name from:
  // 1. Schema.org Organization
  const schemaMatch = html.match(/"@type"\s*:\s*"Organization"[^}]*"name"\s*:\s*"([^"]+)"/i) ||
                      html.match(/"name"\s*:\s*"([^"]+)"[^}]*"@type"\s*:\s*"Organization"/i);
  if (schemaMatch) {
    info.name = schemaMatch[1];
  }
  
  // 2. OG site_name
  if (!info.name) {
    const siteNameMatch = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i);
    if (siteNameMatch) {
      info.name = siteNameMatch[1];
    }
  }
  
  // 3. Title (cleaned)
  if (!info.name) {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      // Take first part before common separators
      let title = titleMatch[1].trim();
      const separators = [' | ', ' - ', ' – ', ' • ', ' :: '];
      for (const sep of separators) {
        if (title.includes(sep)) {
          title = title.split(sep)[0].trim();
          break;
        }
      }
      info.name = title;
    }
  }
  
  // Try to infer niche from content
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  if (descMatch) {
    info.description = descMatch[1].trim();
    info.niche = inferNicheFromDescription(descMatch[1]);
  }
  
  return info;
}

/**
 * Infer business niche from description
 */
function inferNicheFromDescription(description) {
  const nicheKeywords = {
    'law': ['עורך דין', 'עורכי דין', 'משפטי', 'lawyer', 'attorney', 'law firm', 'legal'],
    'medical': ['רפואה', 'רופא', 'מרפאה', 'clinic', 'medical', 'doctor', 'health'],
    'dental': ['שיניים', 'רופא שיניים', 'dental', 'dentist'],
    'real-estate': ['נדל"ן', 'נדלן', 'real estate', 'property', 'housing'],
    'ecommerce': ['חנות', 'קנייה', 'shop', 'store', 'buy', 'e-commerce', 'ecommerce'],
    'restaurant': ['מסעדה', 'אוכל', 'restaurant', 'food', 'dining'],
    'tech': ['טכנולוגיה', 'תוכנה', 'software', 'tech', 'technology', 'saas', 'app'],
    'marketing': ['שיווק', 'פרסום', 'marketing', 'advertising', 'digital'],
    'education': ['לימודים', 'קורסים', 'education', 'course', 'learning', 'training'],
    'finance': ['פיננסים', 'השקעות', 'finance', 'investment', 'banking', 'accounting'],
  };
  
  const lowerDesc = description.toLowerCase();
  
  for (const [niche, keywords] of Object.entries(nicheKeywords)) {
    for (const keyword of keywords) {
      if (lowerDesc.includes(keyword.toLowerCase())) {
        return niche;
      }
    }
  }
  
  return null;
}

/**
 * Extract keywords from page content
 */
function extractKeywords(html) {
  const keywords = {
    fromMeta: [],
    fromHeadings: [],
    suggested: [],
  };
  
  // Meta keywords (if present)
  const metaKeywordsMatch = html.match(/<meta[^>]+name=["']keywords["'][^>]+content=["']([^"']+)["']/i);
  if (metaKeywordsMatch) {
    keywords.fromMeta = metaKeywordsMatch[1].split(',').map(k => k.trim()).filter(Boolean);
  }
  
  // Extract H1s
  const h1Matches = html.matchAll(/<h1[^>]*>([^<]+)<\/h1>/gi);
  for (const match of h1Matches) {
    const text = match[1].trim().replace(/\s+/g, ' ');
    if (text && text.length < 100) {
      keywords.fromHeadings.push({ level: 'h1', text });
    }
  }
  
  // Extract H2s
  const h2Matches = html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/gi);
  for (const match of h2Matches) {
    const text = match[1].trim().replace(/\s+/g, ' ');
    if (text && text.length < 100) {
      keywords.fromHeadings.push({ level: 'h2', text });
    }
  }
  
  // Extract H3s (limited)
  const h3Matches = html.matchAll(/<h3[^>]*>([^<]+)<\/h3>/gi);
  let h3Count = 0;
  for (const match of h3Matches) {
    if (h3Count >= 10) break;
    const text = match[1].trim().replace(/\s+/g, ' ');
    if (text && text.length < 100) {
      keywords.fromHeadings.push({ level: 'h3', text });
      h3Count++;
    }
  }
  
  return keywords;
}

/**
 * AI-powered analysis using Gemini
 * Analyzes page content to understand business, suggest keywords and competitors.
 *
 * @param {object} basicAnalysis
 * @param {string} homepageHtml
 * @param {Array} additionalPagesContent
 * @param {object} options
 * @param {string} [options.userLocale] - User UI locale. When provided, this
 *   becomes the language for human-readable fields (description, niche label,
 *   services, target audience, goal labels). Keywords still target the site
 *   language since those are SEO terms users actually search for.
 */
async function analyzeWithAI(basicAnalysis, homepageHtml, additionalPagesContent = [], options = {}) {
  const { userLocale } = options;
  try {
    // Extract clean text content from HTML
    const cleanContent = extractTextContent(homepageHtml);
    const additionalContent = additionalPagesContent.map(p => 
      `--- ${p.type} page ---\n${extractTextContent(p.html)}`
    ).join('\n\n');
    
    // Build context for AI
    const context = `
Website URL: ${basicAnalysis.url}
Detected Platform: ${basicAnalysis.platform?.name || 'Unknown'}
Site Language: ${basicAnalysis.contentStyle?.language || 'he'}
Has Blog: ${basicAnalysis.contentStyle?.hasBlog ? 'Yes' : 'No'}
Meta Title: ${basicAnalysis.seoData?.title || 'N/A'}
Meta Description: ${basicAnalysis.seoData?.description || 'N/A'}

=== HOMEPAGE CONTENT ===
${cleanContent.slice(0, 4000)}

${additionalContent ? `=== ADDITIONAL PAGES ===\n${additionalContent.slice(0, 2000)}` : ''}
`.trim();

    // Resolve display/site languages BEFORE building the Zod schema — the
    // schema's `.describe(...)` strings interpolate displayLanguageName, so
    // declaring those names later put them in the TDZ and made the schema
    // construction throw ReferenceError. The throw was caught by the outer
    // try/catch and the whole AI analysis silently returned null, leaving
    // competitors and keywords empty.
    const siteLang = basicAnalysis.contentStyle?.language || 'en';
    const isHebrewSite = siteLang === 'he';
    // Display language = the chat's language. Falls back to site language if
    // the caller didn't pass a userLocale (older clients, server-side calls).
    const displayLang = (userLocale || siteLang || 'en').toLowerCase();
    const displayLanguageName = languageCodeToName(displayLang);
    const isHebrewDisplay = displayLang === 'he';

    // Define the schema for AI response. Field-level language hints reinforce
    // the system-prompt rules so the AI keeps keywords in site language while
    // emitting display fields in the user's UI language.
    const analysisSchema = z.object({
      businessDescription: z.string().describe(`A clear, concise description of what this business does (1-2 sentences). MUST be written in ${displayLanguageName} (the user's UI language), even if the website is in another language.`),
      businessNiche: z.string().describe('The business niche/category (e.g., law, medical, ecommerce, tech, marketing, education, real-estate, restaurant, finance, other)'),
      services: z.array(z.string()).describe(`List of main services or products offered (max 8 items). Write in ${displayLanguageName}.`),
      keywords: z.array(z.object({
        keyword: z.string().describe('A real SEO search query that people type into Google to find this type of business. NOT a heading or title from the website. Example: "עורך דין מקרקעין תל אביב" or "התחדשות עירונית ייעוץ משפטי"'),
        intent: z.enum(['commercial', 'informational', 'navigational', 'transactional']).describe('Search intent'),
        difficulty: z.enum(['low', 'medium', 'high']).describe('Estimated keyword difficulty'),
        volume: z.enum(['low', 'medium', 'high']).describe('Estimated monthly search volume'),
      })).describe('8-12 real SEO keywords - actual Google search queries people use to find this type of business'),
      competitors: z.array(z.object({
        name: z.string().describe('Competitor business name'),
        domain: z.string().optional().describe('Competitor domain if known (e.g., example.co.il)'),
        url: z.string().optional().describe('Full URL if known'),
        reasoning: z.string().describe('Why this is a competitor'),
      })).describe('3-5 likely competitors in the same niche and market'),
      goals: z.array(z.object({
        labelHe: z.string().describe('Goal in Hebrew'),
        labelEn: z.string().describe('Goal in English'),
        confidence: z.number().describe('Confidence score 0-1'),
      })).describe('2-4 likely SEO/marketing goals for this business'),
      targetAudience: z.string().describe(`Description of target audience. Write in ${displayLanguageName}.`),
    });

    const systemPrompt = `You are an expert SEO analyst specializing in keyword research.
Analyze the provided website content and generate REAL SEO KEYWORDS.

CRITICAL - KEYWORDS MUST BE REAL SEARCH QUERIES:
Keywords are NOT headings, titles, or text extracted from the website.
Keywords ARE the actual search terms people type into Google to find this business.

EXAMPLES OF GOOD KEYWORDS (for a real estate lawyer in Tel Aviv):
✅ "עורך דין מקרקעין תל אביב"
✅ "ייעוץ משפטי נדלן"
✅ "עורך דין התחדשות עירונית"
✅ "בדיקת חוזה דירה"
✅ "פינוי בינוי ייצוג משפטי"
✅ "איחור במסירת דירה פיצוי"

EXAMPLES OF BAD KEYWORDS (these are NOT keywords):
❌ "משרד עורכי דין רמי אבלס" (this is the business name)
❌ "קיבלתם את הדירה באיחור?" (this is a headline)
❌ "סיפורי ההצלחה שלנו" (this is a menu item)
❌ "כתבות מהתקשורת" (this is a section title)

KEYWORD TYPES TO INCLUDE:
1. Service keywords: What services does the business offer? (e.g., "עורך דין מקרקעין")
2. Problem keywords: What problems do customers have? (e.g., "איחור במסירת דירה מה עושים")
3. Location keywords: Service + location (e.g., "עורך דין נדלן תל אביב")
4. Long-tail keywords: Specific queries (e.g., "כמה עולה עורך דין לקניית דירה")
5. Informational keywords: Questions people ask (e.g., "האם צריך עורך דין לקניית דירה")

For competitors: Suggest real businesses that compete in the same market. ${isHebrewSite ? 'For Israeli businesses, suggest Israeli competitors.' : 'Focus on the same geographic market.'}

LANGUAGE RULES — CRITICAL, FOLLOW EXACTLY:
- Keywords (the \`keywords\` field) MUST be in the SITE LANGUAGE (${siteLang}). Those are real Google queries that real searchers type, so they have to match what people actually search in that market.
- Every other human-readable text field — businessDescription, businessNiche, services, targetAudience, competitors[].reasoning, goals[].labelHe/labelEn — MUST be written in ${displayLanguageName} (locale: ${displayLang}). The user is reading these in a chat that is rendering in ${displayLanguageName}; mixing in ${siteLang === displayLang ? 'a different language' : siteLang + ' text'} produces a bilingual mess.
- For \`goals\`: the \`labelHe\` field stays Hebrew and \`labelEn\` stays English regardless (those keys are language-tagged), but pick the recommended display label to match ${displayLanguageName}.
- Never repeat a sentence in two languages. Translate cleanly into ${displayLanguageName}.`;

    const result = await generateStructuredResponse({
      system: systemPrompt,
      prompt: context,
      schema: analysisSchema,
      temperature: 0.3,
    });

    console.log('[Analyze] AI analysis completed:', {
      keywords: result.keywords?.length || 0,
      competitors: result.competitors?.length || 0,
      services: result.services?.length || 0,
    });

    return result;
  } catch (error) {
    console.error('[Analyze] AI analysis failed:', error.message);
    return null;
  }
}

/**
 * Extract clean text content from HTML
 */
function extractTextContent(html) {
  if (!html) return '';
  
  // Remove script and style tags
  let clean = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  clean = clean.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  
  // Remove all HTML tags but keep content
  clean = clean.replace(/<[^>]+>/g, ' ');
  
  // Decode HTML entities
  clean = clean.replace(/&nbsp;/g, ' ');
  clean = clean.replace(/&amp;/g, '&');
  clean = clean.replace(/&lt;/g, '<');
  clean = clean.replace(/&gt;/g, '>');
  clean = clean.replace(/&quot;/g, '"');
  clean = clean.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(num));
  
  // Clean up whitespace
  clean = clean.replace(/\s+/g, ' ').trim();
  
  return clean;
}

/**
 * Detect page language
 */
function detectLanguage(html) {
  // Check html lang attribute
  const langMatch = html.match(/<html[^>]+lang=["']([^"']+)["']/i);
  if (langMatch) {
    const lang = langMatch[1].toLowerCase();
    console.log('[Analyze] HTML lang attribute:', lang);
    if (lang.startsWith('he')) return 'he';
    if (lang.startsWith('en')) return 'en';
    if (lang.startsWith('ar')) return 'ar';
    return lang.split('-')[0];
  }
  
  // Check dir attribute (RTL is strong indicator for Hebrew/Arabic)
  const dirMatch = html.match(/<html[^>]+dir=["']rtl["']/i);
  if (dirMatch) {
    console.log('[Analyze] HTML dir=rtl detected, checking if Hebrew');
  }
  
  // Check content-language meta tag
  const contentLangMatch = html.match(/<meta[^>]+http-equiv=["']content-language["'][^>]+content=["']([^"']+)["']/i);
  if (contentLangMatch) {
    const lang = contentLangMatch[1].toLowerCase();
    console.log('[Analyze] Content-Language meta:', lang);
    if (lang.startsWith('he')) return 'he';
    if (lang.startsWith('en')) return 'en';
    return lang.split('-')[0];
  }
  
  // Fallback: Count Hebrew vs English characters in CLEAN text content (no JS/CSS/HTML)
  let cleanText = html;
  // Remove script tags and content
  cleanText = cleanText.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  // Remove style tags and content
  cleanText = cleanText.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  // Remove all HTML tags
  cleanText = cleanText.replace(/<[^>]+>/g, ' ');
  
  const hebrewChars = (cleanText.match(/[\u0590-\u05FF]/g) || []).length;
  const englishChars = (cleanText.match(/[a-zA-Z]/g) || []).length;
  
  console.log('[Analyze] Language fallback - Hebrew chars:', hebrewChars, 'English chars:', englishChars);
  
  // Hebrew content should dominate after stripping code
  if (hebrewChars > 50 && hebrewChars > englishChars * 0.3) {
    return 'he';
  }
  
  // If dir=rtl was found and we have SOME Hebrew, it's likely Hebrew
  if (dirMatch && hebrewChars > 20) {
    return 'he';
  }
  
  return 'en';
}

/**
 * Extract language variants from hreflang alternate links.
 * Returns [] when only one (or zero) distinct language is found.
 * Returns [{ code, url, isDefault }, ...] when >= 2 distinct languages exist.
 */
function extractLanguageVariants(html, baseUrl, detectedLanguage) {
  const variants = new Map(); // code -> { code, url, isDefault }

  // Match <link rel="alternate" hreflang="..." href="..."> (attributes can be in any order)
  const linkRegex = /<link\b[^>]*\brel=["']alternate["'][^>]*>/gi;
  const links = html.match(linkRegex) || [];

  for (const tag of links) {
    const hreflangMatch = tag.match(/hreflang=["']([^"']+)["']/i);
    const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
    if (!hreflangMatch || !hrefMatch) continue;

    const rawCode = hreflangMatch[1].trim().toLowerCase();
    let href = hrefMatch[1].trim();

    // Resolve relative URLs
    try {
      href = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }

    // x-default points to the fallback language - track the URL but not a code
    if (rawCode === 'x-default') {
      if (!variants.has('__x_default__')) {
        variants.set('__x_default__', { code: 'x-default', url: href, isDefault: true });
      }
      continue;
    }

    // Normalize: "en-us" → "en"
    const code = rawCode.split('-')[0];
    if (!code || code.length > 3) continue;

    if (!variants.has(code)) {
      variants.set(code, { code, url: href, isDefault: false });
    }
  }

  // Remove x-default placeholder - it's just metadata
  const xDefault = variants.get('__x_default__');
  variants.delete('__x_default__');

  // Fallback: if hreflang didn't yield multiple languages, scan internal anchor
  // links for locale-prefix patterns like "/en/", "/he/". Common in Next.js i18n
  // and other frameworks where hreflang isn't emitted in SSR HTML.
  if (variants.size < 2) {
    const pathPrefixVariants = extractPathPrefixLocales(html, baseUrl);
    for (const [code, entry] of pathPrefixVariants) {
      if (!variants.has(code)) variants.set(code, entry);
    }
    // If the base site is un-prefixed but links to a prefixed locale variant,
    // include the base URL as its own variant (tagged with the detected language).
    if (pathPrefixVariants.size >= 1 && detectedLanguage && !variants.has(detectedLanguage)) {
      try {
        const baseOrigin = new URL(baseUrl).origin;
        variants.set(detectedLanguage, { code: detectedLanguage, url: baseOrigin, isDefault: true });
      } catch {}
    }
  }

  const list = Array.from(variants.values());

  // Mark the variant matching the detected language (or the x-default URL) as default
  if (list.length) {
    let defaultIdx = -1;
    if (xDefault) {
      defaultIdx = list.findIndex((v) => v.url === xDefault.url);
    }
    if (defaultIdx === -1 && detectedLanguage) {
      defaultIdx = list.findIndex((v) => v.code === detectedLanguage);
    }
    if (defaultIdx >= 0) {
      list[defaultIdx].isDefault = true;
    } else {
      list[0].isDefault = true;
    }
  }

  // Only return when there are genuinely multiple languages
  if (list.length < 2) return [];

  console.log('[Analyze] Detected', list.length, 'language variants:', list.map((v) => v.code));
  return list;
}

// Known ISO-639-1 codes we treat as valid locale prefixes when we see them in URLs.
const KNOWN_LOCALE_CODES = new Set([
  'en', 'he', 'ar', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh',
  'nl', 'pl', 'sv', 'no', 'da', 'fi', 'el', 'tr', 'th', 'vi', 'id', 'ms',
  'hi', 'cs', 'hu', 'ro', 'uk', 'bg', 'hr', 'sk', 'sl', 'et', 'lv', 'lt',
  'fa', 'ur', 'bn', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'si', 'my',
]);

/**
 * Scan anchor hrefs for locale path prefixes (e.g. "/en/", "/he/").
 * Returns a Map<code, { code, url, isDefault: false }> of distinct locales.
 */
function extractPathPrefixLocales(html, baseUrl) {
  const found = new Map();
  let base;
  try {
    base = new URL(baseUrl);
  } catch {
    return found;
  }

  const anchorRegex = /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = anchorRegex.exec(html)) !== null) {
    const rawHref = match[1].trim();
    if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('mailto:') || rawHref.startsWith('tel:')) continue;

    let resolved;
    try {
      resolved = new URL(rawHref, baseUrl);
    } catch {
      continue;
    }

    // Only same-origin links qualify as language variants
    if (resolved.origin !== base.origin) continue;

    const segments = resolved.pathname.split('/').filter(Boolean);
    if (!segments.length) continue;

    const first = segments[0].toLowerCase();
    // Accept "en" or "en-us" style; normalize to 2-letter code
    const code = first.split('-')[0];
    if (code.length !== 2 || !KNOWN_LOCALE_CODES.has(code)) continue;

    if (!found.has(code)) {
      // Variant URL = origin + "/{code}" (the locale root)
      const variantUrl = `${base.origin}/${first}`;
      found.set(code, { code, url: variantUrl, isDefault: false });
    }
  }

  // If we only saw a single locale prefix, also infer the un-prefixed root as
  // another variant - the base site itself may be in a different language.
  if (found.size === 1) {
    // We don't know the root's language here, so skip adding a synthetic entry.
    // The caller will treat a single-entry map as "not multi-language" anyway.
  }

  return found;
}

/**
 * Check if site has a blog
 */
async function checkForBlog(url, platform) {
  const blogPaths = ['/blog', '/articles', '/news', '/posts', '/בלוג', '/מאמרים'];

  for (const path of blogPaths) {
    try {
      const response = await fetch(`${url}${path}`, {
        method: 'HEAD',
        headers: BOT_FETCH_HEADERS,
        redirect: 'follow',
      });

      if (response.ok) {
        return true;
      }
    } catch {
      // Continue checking
    }
  }

  return false;
}

/**
 * Check for sitemap
 */
async function checkSitemap(url) {
  const sitemapPaths = ['/sitemap.xml', '/sitemap_index.xml', '/wp-sitemap.xml'];

  for (const path of sitemapPaths) {
    try {
      const response = await fetch(`${url}${path}`, {
        method: 'HEAD',
        headers: BOT_FETCH_HEADERS,
        redirect: 'follow',
      });

      if (response.ok) {
        return true;
      }
    } catch {
      // Continue checking
    }
  }

  return false;
}

/**
 * Fetch additional pages for more context
 */
async function fetchAdditionalPages(baseUrl, homeHtml) {
  const data = {
    services: [],
    aboutInfo: null,
    pagesContent: [], // Store page content for AI analysis
  };
  
  // Find links to about/services pages
  const linkPatterns = [
    { pattern: /href=["']([^"']*(?:about|אודות)[^"']*)["']/gi, type: 'about' },
    { pattern: /href=["']([^"']*(?:services|שירותים)[^"']*)["']/gi, type: 'services' },
    { pattern: /href=["']([^"']*(?:products|מוצרים)[^"']*)["']/gi, type: 'products' },
  ];
  
  const linksToFetch = new Map(); // Map of href -> type
  
  for (const { pattern, type } of linkPatterns) {
    const matches = homeHtml.matchAll(pattern);
    for (const match of matches) {
      let href = match[1];
      
      // Skip external links and anchors
      if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        continue;
      }
      
      // Convert relative to absolute
      if (href.startsWith('/')) {
        href = baseUrl + href;
      } else if (!href.startsWith('http')) {
        href = baseUrl + '/' + href;
      }
      
      // Only include same-domain links
      try {
        const linkUrl = new URL(href);
        const baseUrlObj = new URL(baseUrl);
        if (linkUrl.hostname === baseUrlObj.hostname && !linksToFetch.has(href)) {
          linksToFetch.set(href, type);
        }
      } catch {
        // Invalid URL, skip
      }
    }
  }
  
  // Fetch up to 3 additional pages
  const pagesToFetch = Array.from(linksToFetch.entries()).slice(0, 3);
  
  for (const [pageUrl, pageType] of pagesToFetch) {
    try {
      const pageData = await fetchAndParsePage(pageUrl);
      if (pageData.success) {
        // Store content for AI analysis
        data.pagesContent.push({
          url: pageUrl,
          type: pageType,
          html: pageData.html,
        });
        
        // Extract services/products from lists
        const listItems = pageData.html.matchAll(/<li[^>]*>([^<]{5,100})<\/li>/gi);
        for (const item of listItems) {
          const text = item[1].trim();
          if (text && !text.includes('<') && data.services.length < 10) {
            data.services.push(text);
          }
        }
        
        // Extract from h2/h3 in services pages
        if (pageUrl.toLowerCase().includes('service') || pageUrl.includes('שירות')) {
          const headings = pageData.html.matchAll(/<h[23][^>]*>([^<]{5,80})<\/h[23]>/gi);
          for (const heading of headings) {
            const text = heading[1].trim();
            if (text && !data.services.includes(text) && data.services.length < 10) {
              data.services.push(text);
            }
          }
        }
      }
    } catch {
      // Skip failed pages
    }
  }
  
  return data;
}

/**
 * Infer SEO goals based on analysis
 */
function inferSeoGoals(analysis) {
  const goals = [];
  
  // E-commerce detection
  if (analysis.platform?.name === 'Shopify' || 
      analysis.businessInfo?.niche === 'ecommerce') {
    goals.push({
      id: 'increase-sales',
      label: 'Increase Online Sales',
      labelHe: 'הגדלת מכירות אונליין',
      confidence: 0.9,
    });
  }
  
  // Local business detection
  const localIndicators = ['מרכז', 'תל אביב', 'ירושלים', 'חיפה', 'location', 'address', 'phone'];
  const hasLocalIndicators = localIndicators.some(ind => 
    analysis.seoData?.description?.toLowerCase().includes(ind.toLowerCase())
  );
  
  if (hasLocalIndicators) {
    goals.push({
      id: 'local-visibility',
      label: 'Local Search Visibility',
      labelHe: 'נראות בחיפוש מקומי',
      confidence: 0.8,
    });
  }
  
  // Lead generation (for services)
  if (['law', 'medical', 'dental', 'real-estate', 'finance'].includes(analysis.businessInfo?.niche)) {
    goals.push({
      id: 'lead-generation',
      label: 'Generate Quality Leads',
      labelHe: 'יצירת לידים איכותיים',
      confidence: 0.85,
    });
  }
  
  // Content/Authority building (if has blog)
  if (analysis.contentStyle?.hasBlog) {
    goals.push({
      id: 'build-authority',
      label: 'Build Domain Authority',
      labelHe: 'בניית סמכות תחומית',
      confidence: 0.7,
    });
  }
  
  // Default goal
  if (goals.length === 0) {
    goals.push({
      id: 'increase-traffic',
      label: 'Increase Organic Traffic',
      labelHe: 'הגדלת תנועה אורגנית',
      confidence: 0.6,
    });
  }
  
  return goals;
}

/**
 * Infer target audience based on analysis. The display language is the
 * user's UI locale when provided, falling back to the site's content
 * language so older callers keep their old behavior.
 */
function inferTargetAudience(analysis, userLocale) {
  const niche = analysis.businessInfo?.niche;
  const displayLang = (userLocale || analysis.contentStyle?.language || 'en').toLowerCase();

  const audiences = {
    'law': { he: 'אנשים פרטיים ועסקים הזקוקים לייעוץ משפטי', en: 'Individuals and businesses needing legal advice' },
    'medical': { he: 'מטופלים המחפשים שירותי בריאות', en: 'Patients seeking healthcare services' },
    'dental': { he: 'מטופלים המחפשים טיפולי שיניים', en: 'Patients seeking dental care' },
    'real-estate': { he: 'קונים, מוכרים ומשקיעי נדל"ן', en: 'Home buyers, sellers, and real estate investors' },
    'ecommerce': { he: 'צרכנים המחפשים לרכוש מוצרים אונליין', en: 'Consumers looking to purchase products online' },
    'tech': { he: 'עסקים ומפתחים המחפשים פתרונות טכנולוגיים', en: 'Businesses and developers seeking tech solutions' },
    'marketing': { he: 'עסקים המחפשים לשפר את הנוכחות הדיגיטלית שלהם', en: 'Businesses looking to improve digital presence' },
    'education': { he: 'סטודנטים ואנשי מקצוע המחפשים ללמוד', en: 'Students and professionals looking to learn' },
  };

  if (niche && audiences[niche]) {
    return displayLang === 'he' ? audiences[niche].he : audiences[niche].en;
  }

  return displayLang === 'he'
    ? 'קהל המחפש את השירותים/המוצרים שלך'
    : 'People searching for your services/products';
}

/**
 * Find competitors using Google search
 * Searches for top keywords and extracts competing domains
 */
async function findCompetitors(analysis) {
  const competitors = [];
  const siteUrl = analysis.url;
  const siteDomain = new URL(siteUrl).hostname.replace('www.', '');
  
  // Get keywords to search for
  const searchKeywords = getSearchKeywords(analysis);
  
  if (searchKeywords.length === 0) {
    console.log('[Analyze] No keywords found for competitor search');
    return competitors;
  }
  
  console.log('[Analyze] Searching competitors with keywords:', searchKeywords);
  
  // Track domain frequency across searches
  const domainCounts = new Map();
  
  // Search for each keyword
  for (const keyword of searchKeywords.slice(0, 3)) { // Limit to 3 searches
    try {
      const searchResults = await searchGoogle(keyword, analysis.contentStyle?.language || 'he');
      
      for (const result of searchResults) {
        // Skip the analyzed site itself
        if (result.domain === siteDomain || result.domain.includes(siteDomain)) {
          continue;
        }
        
        // Count domain appearances
        const count = domainCounts.get(result.domain) || { count: 0, url: result.url, title: result.title };
        count.count++;
        domainCounts.set(result.domain, count);
      }
      
      // Small delay between searches to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error('[Analyze] Search error for keyword:', keyword, error.message);
    }
  }
  
  // Sort by frequency and take top 5
  const sortedDomains = Array.from(domainCounts.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5);
  
  for (const [domain, data] of sortedDomains) {
    competitors.push({
      domain,
      url: data.url,
      name: data.title || domain,
      ranking: data.count,
    });
  }
  
  console.log('[Analyze] Found competitors:', competitors.map(c => c.domain));
  
  return competitors;
}

/**
 * Get search keywords from analysis
 */
function getSearchKeywords(analysis) {
  const keywords = [];
  
  // From H1 headings
  const h1s = analysis.keywords?.fromHeadings?.filter(h => h.level === 'h1') || [];
  for (const h of h1s.slice(0, 2)) {
    if (h.text && h.text.length > 3 && h.text.length < 60) {
      keywords.push(h.text);
    }
  }
  
  // From meta description (extract key phrases)
  if (analysis.seoData?.description) {
    // Add the business type + niche as a keyword
    if (analysis.businessInfo?.niche) {
      const nicheKeyword = analysis.contentStyle?.language === 'he'
        ? getNicheKeywordHe(analysis.businessInfo.niche)
        : getNicheKeywordEn(analysis.businessInfo.niche);
      if (nicheKeyword) {
        keywords.push(nicheKeyword);
      }
    }
  }
  
  // From meta title
  if (analysis.seoData?.title && analysis.seoData.title.length < 60) {
    keywords.push(analysis.seoData.title);
  }
  
  // From H2 headings (if we don't have enough)
  if (keywords.length < 3) {
    const h2s = analysis.keywords?.fromHeadings?.filter(h => h.level === 'h2') || [];
    for (const h of h2s.slice(0, 2)) {
      if (h.text && h.text.length > 3 && h.text.length < 50) {
        keywords.push(h.text);
      }
    }
  }
  
  // Deduplicate and limit
  return [...new Set(keywords)].slice(0, 5);
}

/**
 * Get Hebrew keyword for niche
 */
function getNicheKeywordHe(niche) {
  const keywords = {
    'law': 'עורך דין',
    'medical': 'מרפאה',
    'dental': 'רופא שיניים',
    'real-estate': 'נדלן',
    'ecommerce': 'חנות אונליין',
    'restaurant': 'מסעדה',
    'tech': 'פיתוח תוכנה',
    'marketing': 'שיווק דיגיטלי',
    'education': 'קורסים',
    'finance': 'ייעוץ פיננסי',
  };
  return keywords[niche];
}

/**
 * Get English keyword for niche
 */
function getNicheKeywordEn(niche) {
  const keywords = {
    'law': 'law firm',
    'medical': 'medical clinic',
    'dental': 'dentist',
    'real-estate': 'real estate',
    'ecommerce': 'online store',
    'restaurant': 'restaurant',
    'tech': 'software development',
    'marketing': 'digital marketing',
    'education': 'online courses',
    'finance': 'financial advisor',
  };
  return keywords[niche];
}

/**
 * Search Google and extract results
 */
async function searchGoogle(query, language = 'he') {
  const results = [];
  
  try {
    // Use Google search with appropriate parameters
    const searchUrl = new URL('https://www.google.com/search');
    searchUrl.searchParams.set('q', query);
    searchUrl.searchParams.set('num', '10');
    searchUrl.searchParams.set('hl', language);
    
    // For Hebrew, add Israel location
    if (language === 'he') {
      searchUrl.searchParams.set('gl', 'il');
    }
    
    console.log('[Analyze] Searching Google for:', query);
    
    const response = await fetch(searchUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': language === 'he' ? 'he-IL,he;q=0.9,en;q=0.8' : 'en-US,en;q=0.9',
      },
    });
    
    if (!response.ok) {
      console.log('[Analyze] Google search failed:', response.status);
      return results;
    }
    
    const html = await response.text();
    
    // Extract search result URLs
    // Google uses various patterns for result links
    const urlPatterns = [
      /href="\/url\?q=([^&"]+)/g,
      /data-href="(https?:\/\/[^"]+)"/g,
      /<a href="(https?:\/\/(?!www\.google|webcache|translate\.google)[^"]+)"/g,
    ];
    
    const foundUrls = new Set();
    
    for (const pattern of urlPatterns) {
      const matches = html.matchAll(pattern);
      for (const match of matches) {
        let url = match[1];
        
        // Decode URL if needed
        if (url.includes('%')) {
          try {
            url = decodeURIComponent(url);
          } catch {
            // Keep original if decode fails
          }
        }
        
        // Skip Google's own domains and common non-competitor sites
        if (url.includes('google.') || 
            url.includes('youtube.') ||
            url.includes('facebook.') ||
            url.includes('twitter.') ||
            url.includes('linkedin.') ||
            url.includes('instagram.') ||
            url.includes('wikipedia.') ||
            url.includes('amazon.') ||
            url.includes('/search?') ||
            url.includes('webcache.')) {
          continue;
        }
        
        // Validate URL
        try {
          const parsedUrl = new URL(url);
          if (parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:') {
            const domain = parsedUrl.hostname.replace('www.', '');
            
            if (!foundUrls.has(domain)) {
              foundUrls.add(domain);
              results.push({
                url: parsedUrl.origin,
                domain,
                title: domain, // We could extract titles but keeping it simple
              });
            }
          }
        } catch {
          // Skip invalid URLs
        }
        
        // Limit results
        if (results.length >= 10) break;
      }
      if (results.length >= 10) break;
    }
    
    console.log('[Analyze] Found', results.length, 'results for:', query);
    
  } catch (error) {
    console.error('[Analyze] Google search error:', error.message);
  }
  
  return results;
}
