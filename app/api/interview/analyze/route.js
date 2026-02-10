import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { generateStructuredResponse } from '@/lib/ai/gemini';
import { trackAIUsage } from '@/lib/ai/credits-service';
import { z } from 'zod';

const SESSION_COOKIE = 'user_session';
const TEMP_REG_COOKIE = 'temp_reg_id';

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
    const tempRegId = cookieStore.get(TEMP_REG_COOKIE)?.value;

    // Allow both logged-in users and users in registration flow
    if (!userId && !tempRegId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's account for credit tracking (only if logged in)
    let accountId = null;
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          lastSelectedAccountId: true,
          accountMemberships: {
            select: { accountId: true },
            take: 1,
          },
        },
      });
      if (user) {
        accountId = user.lastSelectedAccountId || user.accountMemberships?.[0]?.accountId;
      }
    }

    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Normalize URL
    const normalizedUrl = normalizeUrl(url);
    
    // Run analysis
    const analysis = await analyzeWebsite(normalizedUrl);

    // Track AI usage if user is logged in with an account
    let creditsUsed = 0;
    if (accountId && userId) {
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

    return NextResponse.json({
      success: true,
      analysis,
      // Include updated credits for frontend to update UI
      creditsUpdated: creditsUsed > 0 ? { used: creditsUsed } : null,
    });

  } catch (error) {
    console.error('[Analyze] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Analysis failed' },
      { status: 500 }
    );
  }
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
 */
async function analyzeWebsite(url) {
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
    competitors: [],
    inferredGoals: [],
    inferredAudience: null,
  };

  // Step 1: Health check & fetch homepage
  const homepageData = await fetchAndParsePage(url);
  
  if (!homepageData.success) {
    results.error = homepageData.error;
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
  const aiAnalysis = await analyzeWithAI(results, html, additionalData.pagesContent || []);
  
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
    // Fallback to rule-based inference if AI fails
    results.inferredGoals = inferSeoGoals(results);
    results.inferredAudience = inferTargetAudience(results);
    
    // Try Google search for competitors as fallback
    results.competitors = await findCompetitors(results);
  }
  
  return results;
}

/**
 * Fetch and parse a webpage
 */
async function fetchAndParsePage(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,he;q=0.8',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }
    
    const html = await response.text();
    const headers = Object.fromEntries(response.headers.entries());
    
    return { success: true, html, headers };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Detect CMS/Platform
 */
function detectPlatform(html, headers) {
  const platforms = [];
  
  // WordPress indicators
  if (html.includes('wp-content') || html.includes('wp-includes') || html.includes('wordpress')) {
    platforms.push({ name: 'WordPress', confidence: 0.9 });
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
  if (html.includes('webflow.com') || html.includes('w-nav') && html.includes('w-container')) {
    platforms.push({ name: 'Webflow', confidence: 0.8 });
  }
  
  // Elementor (WordPress plugin)
  if (html.includes('elementor')) {
    const wpPlatform = platforms.find(p => p.name === 'WordPress');
    if (wpPlatform) {
      wpPlatform.builder = 'Elementor';
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
    return { name: 'Custom', confidence: 0.5 };
  }
  
  platforms.sort((a, b) => b.confidence - a.confidence);
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
 * Analyzes page content to understand business, suggest keywords and competitors
 */
async function analyzeWithAI(basicAnalysis, homepageHtml, additionalPagesContent = []) {
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

    // Define the schema for AI response
    const analysisSchema = z.object({
      businessDescription: z.string().describe('A clear, concise description of what this business does (1-2 sentences, in the site language)'),
      businessNiche: z.string().describe('The business niche/category (e.g., law, medical, ecommerce, tech, marketing, education, real-estate, restaurant, finance, other)'),
      services: z.array(z.string()).describe('List of main services or products offered (max 8 items)'),
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
      targetAudience: z.string().describe('Description of target audience (in the site language)'),
    });

    const isHebrew = basicAnalysis.contentStyle?.language === 'he';
    
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

For competitors: Suggest real businesses that compete in the same market. ${isHebrew ? 'For Israeli businesses, suggest Israeli competitors.' : 'Focus on the same geographic market.'}

Respond in ${isHebrew ? 'Hebrew' : 'English'} since that's the site's primary language.`;

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
    if (lang.startsWith('he')) return 'he';
    if (lang.startsWith('en')) return 'en';
    if (lang.startsWith('ar')) return 'ar';
    return lang.split('-')[0];
  }
  
  // Check for Hebrew characters in content
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch) {
    const hebrewChars = (bodyMatch[1].match(/[\u0590-\u05FF]/g) || []).length;
    const englishChars = (bodyMatch[1].match(/[a-zA-Z]/g) || []).length;
    
    if (hebrewChars > englishChars * 0.5) {
      return 'he';
    }
  }
  
  return 'en';
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
        headers: { 'User-Agent': 'GhostPost-Analyzer/1.0' },
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
        headers: { 'User-Agent': 'GhostPost-Analyzer/1.0' },
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
 * Infer target audience based on analysis
 */
function inferTargetAudience(analysis) {
  const niche = analysis.businessInfo?.niche;
  const language = analysis.contentStyle?.language;
  
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
    return language === 'he' ? audiences[niche].he : audiences[niche].en;
  }
  
  return language === 'he' 
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
