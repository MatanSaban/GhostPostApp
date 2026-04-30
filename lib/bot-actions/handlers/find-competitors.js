/**
 * Find Competitors Handler
 * 
 * Finds competitors based on selected keywords using Google Search grounding.
 * Uses Vercel AI SDK with Google Gemini's search tool to find real competitors.
 * Extracts verified URLs from Google's grounding metadata and sources.
 * 
 * Flow:
 * 1. Search Google for each selected keyword (max 5 keywords)
 * 2. Get top 5 results for each keyword with ranking position
 * 3. Filter out aggregators, directories, and informational sites
 * 4. Aggregate scores: higher rank = more points, appearing in multiple keywords = bonus
 * 5. Apply location boost and homepage preference
 * 6. Return top 10 competitors, auto-select top 5
 */

import { generateText } from 'ai';
import { google } from '@/lib/ai/vertex-provider.js';
import { getTextModel } from '@/lib/ai/gemini';
import { trackAIUsage } from '@/lib/ai/credits-service';

/**
 * AGGREGATOR AND DIRECTORY DOMAINS BLACKLIST
 * These sites list/rank businesses but are not competitors themselves
 */
const AGGREGATOR_DOMAINS = [
  // Israeli aggregators & directories
  'midrag.co.il', 'midrag.com',
  'easy.co.il',
  'duns100.co.il', 'duns.co.il',
  'b144.co.il',
  't.co.il',
  'rest.co.il',
  'zap.co.il',
  'ice.co.il',
  'winner.co.il',
  'bezeq.co.il',
  '2eat.co.il',
  'psakdin.co.il',  // Law directory
  'lawzana.co.il', 'lawzana.com',  // Law directory
  'lawreviews.co.il',  // Law reviews
  'mishpatim.co.il',
  'advocates.org.il',  // Bar association
  'doctors.co.il',
  'doctorim.co.il',
  'camoni.co.il',
  'tlv1.co.il',
  '10bis.co.il',
  'bizportal.co.il',
  'globes.co.il',
  'calcalist.co.il',
  'themarker.com',
  // International aggregators
  'yelp.com',
  'tripadvisor.com', 'tripadvisor.co.il',
  'glassdoor.com',
  'trustpilot.com',
  'bbb.org',
  'yellowpages.com',
  'whitepages.com',
  'crunchbase.com',
  'clutch.co',
  'g2.com',
  'capterra.com',
  'softwareadvice.com',
  // SEO/Marketing tools (not competitors)
  'semrush.com',
  'ahrefs.com',
  'moz.com',
  'similarweb.com',
  'hubspot.com',
  // General info/news sites
  'wikipedia.org',
  'walla.co.il',
  'ynet.co.il',
  'mako.co.il',
  'news.co.il',
  'haaretz.com', 'haaretz.co.il',
  'israelhayom.co.il',
  'kan.org.il',
  // Social/platforms
  'facebook.com', 'fb.com',
  'linkedin.com',
  'twitter.com', 'x.com',
  'instagram.com',
  'youtube.com',
  'tiktok.com',
  'pinterest.com',
  'reddit.com',
  // E-commerce platforms (not specific businesses)
  'amazon.com', 'amazon.co.il',
  'ebay.com', 'ebay.co.il',
  'aliexpress.com',
  'alibaba.com',
  // Government
  'gov.il',
  'justice.gov.il',
  'courts.gov.il',
  // Technical/Google
  'google.com', 'google.co.il',
  'support.google.com',
  'cloud.google.com',
  'vertexaisearch.cloud.google.com',
  // Freelance platforms
  'fiverr.com',
  'upwork.com',
  '99designs.com',
];

/**
 * AGGREGATOR TITLE PATTERNS
 * If a result title matches these patterns, it's likely a directory/aggregator
 */
const AGGREGATOR_TITLE_PATTERNS = [
  /^(top|best|מיטב|הטובים|רשימת|רשימה של)\s*\d+/i,
  /^(list of|השוואת|comparison|מדריך|guide to)/i,
  /^(index|אינדקס|מאגר|directory)/i,
  /\d+\s*(top|best|הטובים|מומלצים)/i,
  /(price comparison|השוואת מחירים)/i,
  /(ranking|דירוג|reviews|ביקורות)\s*-?\s*\d+/i,
  /^(find|search|חפש|מצא)\s+(a|an|the|את)/i,
];

/**
 * Extract the root domain from a URL (e.g., https://www.example.com/page -> example.com)
 */
function extractRootDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Extract domain from a title string (e.g., "duns100.co.il" or "Example Company - example.com")
 */
function extractDomainFromTitle(title) {
  if (!title) return null;
  
  // Clean the title
  const cleanTitle = title.trim().toLowerCase();
  
  // Pattern 1: Title is just a domain (e.g., "duns100.co.il")
  const domainPattern = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;
  if (domainPattern.test(cleanTitle)) {
    return cleanTitle.replace(/^www\./, '');
  }
  
  // Pattern 2: Domain appears somewhere in the title
  const domainMatch = cleanTitle.match(/([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}/i);
  if (domainMatch) {
    return domainMatch[0].replace(/^www\./, '');
  }
  
  return null;
}

/**
 * Check if a domain is a known aggregator/directory
 */
function isAggregatorDomain(domain) {
  if (!domain) return false;
  const lowerDomain = domain.toLowerCase();
  return AGGREGATOR_DOMAINS.some(agg => lowerDomain.includes(agg) || agg.includes(lowerDomain));
}

/**
 * Check if a title indicates an aggregator/directory page
 */
function isAggregatorTitle(title) {
  if (!title) return false;
  return AGGREGATOR_TITLE_PATTERNS.some(pattern => pattern.test(title));
}

/**
 * Calculate URL depth (number of path segments)
 * Homepages (depth 0-1) are preferred over deep links
 */
function getUrlDepth(url) {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname.replace(/^\/|\/$/g, '');
    if (!path) return 0;
    return path.split('/').filter(Boolean).length;
  } catch {
    return 999; // Invalid URL, penalize heavily
  }
}

/**
 * Check if URL looks like a blog/article (should be deprioritized)
 */
function isBlogOrArticleUrl(url) {
  if (!url) return false;
  const lowerUrl = url.toLowerCase();
  const articlePatterns = [
    '/blog/', '/news/', '/article/', '/post/',
    '/כתבה/', '/מאמר/', '/חדשות/', '/בלוג/',
    '/category/', '/tag/', '/archive/',
    '/2024/', '/2025/', '/2026/', // Date patterns
    '/p/', '/a/', '/עמוד/',
  ];
  return articlePatterns.some(pattern => lowerUrl.includes(pattern));
}

/**
 * Check if a domain is a valid competitor (not a search engine, social media, aggregator, etc.)
 */
function isValidCompetitorDomain(domain, userWebsiteUrl) {
  if (!domain) return false;
  
  // Check against aggregator blacklist first
  if (isAggregatorDomain(domain)) {
    return false;
  }
  
  // Additional excluded domains not in aggregator list
  const excludedDomains = [
    'gov.uk', 'gov.us', '.gov',
    'edu', '.edu',
    'ac.il', // Academic
  ];
  
  // Exclude additional non-competitor domains
  if (excludedDomains.some(excluded => domain.includes(excluded))) {
    return false;
  }
  
  // Exclude user's own website
  if (userWebsiteUrl) {
    const userDomain = extractRootDomain(userWebsiteUrl);
    if (userDomain && domain === userDomain) {
      return false;
    }
  }
  
  return true;
}

/**
 * Check if a URL is a valid competitor (not a search engine, social media, etc.)
 */
function isValidCompetitorUrl(url, userWebsiteUrl) {
  const domain = extractRootDomain(url);
  return isValidCompetitorDomain(domain, userWebsiteUrl);
}

/**
 * Search Google for competitors for a specific keyword
 * Uses Gemini with Google Search grounding to get REAL URLs from verified sources
 * 
 * The key is that Google Search grounding returns URLs in two places:
 * 1. result.sources - Array of source objects with url and title
 * 2. result.providerMetadata.google.groundingMetadata.groundingChunks - Verified chunks with web.uri
 * 
 * IMPORTANT: Google often returns redirect URLs (vertexaisearch.cloud.google.com/grounding-api-redirect/...)
 * but the actual domain is in the title field. We extract domains from titles when URL is a redirect.
 * 
 * @param {string} keyword - The search keyword/query
 * @param {string} userWebsiteUrl - The user's website to exclude from results
 * @param {string} targetLocation - Target location key (e.g., 'IL', 'US', 'israel')
 * @param {string} language - Language code (e.g., 'he', 'en')
 * @param {Object} businessLocation - Optional location object with city, region, isLocalBusiness
 * @param {string} businessType - Optional business type (e.g., 'law firm', 'restaurant')
 * @param {Object} websiteContext - Website character/type context for better competitor matching
 * @param {string} websiteContext.about - Website about/description text
 * @param {string} websiteContext.category - Business category
 * @param {string} websiteContext.websiteType - Type of website (blog, agency, e-commerce, etc.)
 * @param {string} websiteContext.targetAudience - Who the website serves
 */
async function searchCompetitorsForKeyword(keyword, userWebsiteUrl, targetLocation = 'israel', language = 'he', businessLocation = null, businessType = null, websiteContext = null) {
  const model = getTextModel();
  
  // Build a location-aware search prompt
  // Support both full keys and ISO codes from the targetLocations question
  const locationMap = {
    // Special values
    worldwide: 'worldwide',
    global: 'worldwide',
    // ISO country codes (matching seed-interview-questions.js options)
    IL: 'Israel / ישראל',
    US: 'United States',
    GB: 'United Kingdom',
    CA: 'Canada',
    AU: 'Australia',
    DE: 'Germany / Deutschland',
    FR: 'France',
    ES: 'Spain / España',
    IT: 'Italy / Italia',
    NL: 'Netherlands',
    BR: 'Brazil / Brasil',
    MX: 'Mexico / México',
    IN: 'India',
    JP: 'Japan / 日本',
    CN: 'China / 中国',
    KR: 'South Korea / 한국',
    RU: 'Russia / Россия',
    AE: 'United Arab Emirates',
    SA: 'Saudi Arabia',
    ZA: 'South Africa',
    PL: 'Poland / Polska',
    SE: 'Sweden / Sverige',
    NO: 'Norway / Norge',
    DK: 'Denmark / Danmark',
    FI: 'Finland / Suomi',
    AT: 'Austria / Österreich',
    CH: 'Switzerland / Schweiz',
    BE: 'Belgium / België',
    PT: 'Portugal',
    GR: 'Greece / Ελλάδα',
    TR: 'Turkey / Türkiye',
    TH: 'Thailand / ไทย',
    SG: 'Singapore',
    MY: 'Malaysia',
    ID: 'Indonesia',
    PH: 'Philippines',
    VN: 'Vietnam / Việt Nam',
    AR: 'Argentina',
    CL: 'Chile',
    CO: 'Colombia',
    NZ: 'New Zealand',
    IE: 'Ireland',
    // Legacy full keys for backwards compatibility
    israel: 'Israel / ישראל',
    unitedStates: 'United States',
    unitedKingdom: 'United Kingdom',
  };
  const locationText = locationMap[targetLocation] || targetLocation || 'Israel';
  
  // Build location context from business location if available
  let locationContext = locationText;
  if (businessLocation) {
    const parts = [];
    if (businessLocation.city) parts.push(businessLocation.city);
    if (businessLocation.region && businessLocation.region !== businessLocation.city) parts.push(businessLocation.region);
    if (parts.length > 0) {
      locationContext = parts.join(', ') + ` (${locationText})`;
    }
  }
  
  // Build business type context
  const businessTypeContext = businessType ? `\n\nLook specifically for ${businessType} businesses.` : '';
  
  // Build website character context to find the RIGHT type of competitors
  let websiteCharacterContext = '';
  if (websiteContext) {
    const parts = [];
    if (websiteContext.about) {
      parts.push(`About the website: ${websiteContext.about}`);
    }
    if (websiteContext.websiteType) {
      parts.push(`Website type: ${websiteContext.websiteType}`);
    }
    if (websiteContext.category) {
      parts.push(`Business category: ${websiteContext.category}`);
    }
    if (websiteContext.targetAudience) {
      parts.push(`Target audience: ${websiteContext.targetAudience}`);
    }
    if (parts.length > 0) {
      websiteCharacterContext = `\n\nIMPORTANT CONTEXT about the website we're finding competitors for:\n${parts.join('\n')}\n\nFind competitors that are the SAME TYPE of website. For example:\n- If the website is a BLOG about marketing, find other marketing BLOGS, NOT marketing agencies\n- If the website is a SERVICE PROVIDER (agency/consultancy), find other service providers\n- If the website is an E-COMMERCE store, find other online stores selling similar products\n- If the website is a SaaS/tool, find other similar tools\nThe competitors must serve the same audience and have the same business model.`;
    }
  }
  
  // Create a search-focused prompt that will trigger actual Google search.
  // The prompt is designed to find DIRECT COMPETITORS, not directories or aggregators.
  // The "scope guidance" block teaches the model to mix local vs. global
  // competitors intelligently based on website type — e.g. a Hebrew SaaS
  // tool site targeting Israel needs both Israeli AND global tool competitors,
  // because Israelis routinely use global SaaS; meanwhile a Hebrew local
  // service business targeting Israel should only get Israeli competitors,
  // because no global firm can compete for that same search intent.
  const isLocalService = websiteContext?.websiteType === 'service provider / agency'
    || websiteContext?.websiteType === 'non-profit / organization';
  const isGlobalTool = websiteContext?.websiteType === 'SaaS / software tool'
    || websiteContext?.websiteType === 'e-commerce / online store'
    || websiteContext?.websiteType === 'education / course platform'
    || websiteContext?.websiteType === 'blog / content website / online magazine';
  const isWorldwide = targetLocation === 'worldwide' || targetLocation === 'global';

  let scopeGuidance = '';
  if (isWorldwide) {
    scopeGuidance = `\n\nCOMPETITOR SCOPE: target is worldwide. Find the largest global / international competitors in this category, regardless of country.`;
  } else if (isGlobalTool && !isWorldwide) {
    scopeGuidance = `\n\nCOMPETITOR SCOPE: this is a ${websiteContext.websiteType} whose users in ${locationText} also routinely use global / international competitors of the same category. Return a MIX of:\n- Strong local competitors actually serving ${locationText} (priority for queries that include the local language).\n- Major global competitors in the same category that ${locationText} users would compare against.\nDo NOT restrict to local-only — that would miss the real competitive set.`;
  } else if (isLocalService && !isWorldwide) {
    scopeGuidance = `\n\nCOMPETITOR SCOPE: this is a local service business (${websiteContext.websiteType}) targeting customers in ${locationText}. Restrict competitors to businesses that actually operate in ${locationText} — global competitors that can't physically serve this market are not relevant.`;
  } else {
    scopeGuidance = `\n\nCOMPETITOR SCOPE: target is ${locationText}. Prioritise competitors that actually serve users in ${locationText}. Include a global competitor only when it's clearly part of the local competitive set for that query.`;
  }

  // If the keyword itself is in the local language, the user obviously wants
  // local-market results regardless of website type — strengthen that signal.
  const keywordIsLocalLanguage = (() => {
    if (!keyword) return false;
    if (language === 'he') return /[֐-׿]/.test(keyword);
    if (language === 'ar') return /[؀-ۿ]/.test(keyword);
    if (language === 'ru') return /[Ѐ-ӿ]/.test(keyword);
    return false;
  })();
  if (keywordIsLocalLanguage) {
    scopeGuidance += `\n\nThe keyword is in the local language, so the user is searching for results in ${locationText}. Local competitors take priority for this specific keyword.`;
  }

  const prompt = `Use Google Search to find the top competitors ranking for "${keyword}" in ${locationContext}.

Search for "${keyword}" and list the top 10 ACTUAL BUSINESS websites from the search results.${businessTypeContext}${websiteCharacterContext}${scopeGuidance}

CRITICAL REQUIREMENTS:
1. ONLY include ACTUAL BUSINESS WEBSITES - companies that offer products/services directly
2. EXCLUDE directories, aggregators, "Top 10" lists, comparison sites, review sites
3. EXCLUDE news articles, blog posts, Wikipedia, government sites
4. EXCLUDE platforms like Yelp, TripAdvisor, Yellow Pages, etc.
5. NEVER fabricate URLs. Only return URLs that actually appear in your Google Search results — if a URL isn't grounded, drop it.

For each result, provide:
- Business name (the actual company name)
- Website URL (the company's own website, NOT a directory listing)

Focus ONLY on businesses that could be DIRECT COMPETITORS - companies offering the same or similar products/services in the same market.`;

  try {
    console.log(`[FindCompetitors] Searching Google for "${keyword}" in ${locationContext}...`);
    
    const result = await generateText({
      model,
      tools: {
        google_search: google.tools.googleSearch({}),
      },
      toolChoice: 'required', // Force the AI to use the search tool
      prompt,
      maxTokens: 4096,
    });

    // Capture token usage
    const usage = result.usage || {};
    const inputTokens = usage.inputTokens || usage.promptTokens || 0;
    const outputTokens = usage.outputTokens || usage.completionTokens || 0;

    const competitors = [];
    const seenDomains = new Set();
    
    /**
     * Helper to add a competitor with proper domain extraction
     * Handles both direct URLs and Google redirect URLs (extracts domain from title)
     * @param url - The URL of the competitor
     * @param title - The title/name of the competitor
     * @param source - Where this competitor was found (google-search, grounding-chunk, etc.)
     * @param sourceIndex - The 0-based index in the source array (used for ranking)
     */
    const addCompetitor = (url, title, source, sourceIndex) => {
      // Check if URL is a Google redirect URL
      const isRedirectUrl = url && url.includes('vertexaisearch.cloud.google.com');
      
      let domain = null;
      let finalUrl = url;
      
      if (isRedirectUrl) {
        // Extract domain from title instead (e.g., "duns100.co.il" or "Example - example.com")
        domain = extractDomainFromTitle(title);
        if (domain) {
          finalUrl = `https://${domain}`;
          console.log(`[FindCompetitors] Extracted domain from title: "${title}" -> ${domain}`);
        }
      } else if (url) {
        domain = extractRootDomain(url);
      }
      
      if (!domain) {
        console.log(`[FindCompetitors] Skipping (no domain from URL or title): url=${url?.substring(0, 50)}, title=${title}`);
        return false;
      }
      
      if (seenDomains.has(domain)) {
        console.log(`[FindCompetitors] Skipping duplicate: ${domain}`);
        return false;
      }
      
      if (!isValidCompetitorDomain(domain, userWebsiteUrl)) {
        console.log(`[FindCompetitors] Skipping invalid domain: ${domain}`);
        return false;
      }
      
      // Check for aggregator title patterns
      if (title && isAggregatorTitle(title)) {
        console.log(`[FindCompetitors] Skipping aggregator title: "${title}"`);
        return false;
      }
      
      seenDomains.add(domain);
      // Rank is 1-based from the source index (position in Google results)
      const rank = sourceIndex + 1;
      
      // Calculate URL quality metrics
      const urlDepth = getUrlDepth(finalUrl);
      const isBlogPost = isBlogOrArticleUrl(finalUrl);
      const isHomepage = urlDepth <= 1;
      
      // Always normalize URL to homepage (protocol + domain only)
      // We don't want deep links like /projects/residential showing as competitor URLs
      const homepageUrl = `https://${domain}`;
      
      console.log(`[FindCompetitors] Added competitor: ${domain} (rank ${rank} from ${source}, depth=${urlDepth}, blog=${isBlogPost})`);
      
      competitors.push({
        name: title || domain,
        url: homepageUrl,
        domain: domain,
        keyword: keyword,
        rank: rank, // Position in search results (1 = first)
        source: source,
        verified: !isRedirectUrl, // Mark as verified only if we have the actual URL
        urlDepth: urlDepth,
        isBlogPost: isBlogPost,
        isHomepage: isHomepage,
      });
      
      return true;
    };
    
    // Method 1: Extract from sources (primary method - verified URLs)
    if (result.sources && result.sources.length > 0) {
      console.log(`[FindCompetitors] Found ${result.sources.length} sources for "${keyword}"`);
      
      for (let i = 0; i < result.sources.length; i++) {
        const source = result.sources[i];
        const url = source.url || source.uri || source.link || source.href;
        const title = source.title || source.name || source.displayName || '';
        
        if (url || title) {
          addCompetitor(url, title, 'google-search', i);
        }
        
        // Stop after 5 competitors per keyword
        if (competitors.length >= 5) break;
      }
    }
    
    // Method 2: Extract from grounding metadata (backup/additional sources)
    if (competitors.length < 5) {
      const groundingMetadata = result.providerMetadata?.google?.groundingMetadata;
      if (groundingMetadata) {
        const groundingChunks = groundingMetadata.groundingChunks || [];
        console.log(`[FindCompetitors] Found ${groundingChunks.length} grounding chunks for "${keyword}"`);
        
        // Start index from where sources left off
        const startIndex = result.sources?.length || 0;
        
        for (let i = 0; i < groundingChunks.length; i++) {
          const chunk = groundingChunks[i];
          const url = chunk.web?.uri || chunk.uri;
          const title = chunk.web?.title || chunk.title || '';
          
          if (url || title) {
            addCompetitor(url, title, 'grounding-chunk', startIndex + i);
          }
          
          // Stop after 5 competitors per keyword
          if (competitors.length >= 5) break;
        }
      }
    }
    
    // Log the raw text response for debugging
    console.log(`[FindCompetitors] AI response text (first 500 chars):`, result.text?.substring(0, 500));
    
    // Method 3: Fallback - Parse URLs from the AI's text response if no structured sources found
    if (competitors.length === 0 && result.text) {
      console.log(`[FindCompetitors] No structured URLs found, parsing from text response...`);
      
      // Match URLs and domain patterns in the text
      // Pattern 1: Full URLs (https://example.com)
      const urlPattern = /https?:\/\/[^\s\)\]\,\"\']+/gi;
      // Pattern 2: Domain patterns like "example.com" or "example.co.il"
      const domainPattern = /\b([a-z0-9][-a-z0-9]*\.)+(?:com|co\.il|org|net|io|co|biz|info|co\.uk|il)\b/gi;
      
      const textUrls = result.text.match(urlPattern) || [];
      const textDomains = result.text.match(domainPattern) || [];
      
      console.log(`[FindCompetitors] Found ${textUrls.length} URLs and ${textDomains.length} domains in text`);
      
      // Process full URLs first
      let textIndex = 0;
      for (const url of textUrls) {
        const cleanUrl = url.replace(/[\.\,\)\]]+$/, ''); // Remove trailing punctuation
        addCompetitor(cleanUrl, '', 'text-extracted', textIndex);
        textIndex++;
        if (competitors.length >= 5) break;
      }
      
      // Process domain patterns
      if (competitors.length < 5) {
        for (const domainText of textDomains) {
          const domain = domainText.toLowerCase().replace(/^www\./, '');
          const url = `https://${domain}`;
          addCompetitor(url, domain, 'text-extracted', textIndex);
          textIndex++;
          if (competitors.length >= 5) break;
        }
      }
    }
    
    console.log(`[FindCompetitors] Found ${competitors.length} competitors for "${keyword}"`);
    
    return {
      success: true,
      competitors: competitors,
      rawResponse: result.text,
      inputTokens,
      outputTokens,
    };
  } catch (error) {
    console.error(`[FindCompetitors] Google Search error for "${keyword}":`, error);
    return {
      success: false,
      competitors: [],
      error: error.message,
      inputTokens: 0,
      outputTokens: 0,
    };
  }
}

/**
 * Main handler function
 * 
 * Flow:
 * 1. Search Google for each selected keyword (max 5 keywords)
 * 2. Get top 5 results for each keyword with ranking position
 * 3. Filter out aggregators, directories, and informational sites
 * 4. Aggregate scores with bonuses and penalties
 * 5. Return top 10 competitors, auto-select top 5
 * 
 * Scoring formula:
 * - Base score per keyword appearance: (6 - rank) points (rank 1 = 5 points, rank 5 = 1 point)
 * - Bonus for appearing in multiple keywords: +3 points per additional keyword
 * - Homepage bonus: +2 points
 * - Blog/article penalty: -2 points
 * - Deep URL penalty: -1 point per level beyond 2
 */
export async function findCompetitors(params, context) {
  const { 
    keywords: inputKeywords, 
    maxKeywords = 5,
    businessLocation = null,  // { city, region, isLocalBusiness, serviceArea }
    businessType = null,      // e.g., 'law firm', 'restaurant', 'software company'
  } = params;
  
  // Get keywords from:
  // 1. Explicit keywords param (from manual action call)
  // 2. Interview responses (the saved keywords from the keywords question)
  // 3. External data keyword suggestions (from AI generation)
  // Note: We do NOT use params.response here because the flow engine passes
  // the current question's response (competitor URLs), not the keywords
  let keywords = inputKeywords;
  
  // If no explicit keywords, get from interview responses (saved keywords)
  if (!keywords || keywords.length === 0) {
    keywords = context.interview?.responses?.keywords || 
               context.responses?.keywords || 
               context.interview?.externalData?.keywordSuggestions?.map(k => k.keyword) ||
               [];
  }
  
  console.log(`[FindCompetitors] Source of keywords:`, {
    fromParams: !!inputKeywords,
    fromResponses: !!(context.interview?.responses?.keywords || context.responses?.keywords),
    fromExternalData: !!context.interview?.externalData?.keywordSuggestions,
    keywords: keywords.slice(0, 5),
  });
  
  // Handle JSON string (from flow engine auto-action)
  if (typeof keywords === 'string') {
    try {
      const parsed = JSON.parse(keywords);
      if (Array.isArray(parsed)) {
        keywords = parsed;
      } else {
        keywords = keywords.split(',').map(k => k.trim()).filter(k => k);
      }
    } catch {
      keywords = keywords.split(',').map(k => k.trim()).filter(k => k);
    }
  }
  
  // Ensure keywords is an array
  if (!Array.isArray(keywords)) {
    // Handle structured keyword responses (e.g., { rawInput, selectedKeywords })
    if (keywords && typeof keywords === 'object' && Array.isArray(keywords.selectedKeywords)) {
      keywords = keywords.selectedKeywords;
    } else {
      keywords = [];
    }
  }
  
  // Limit to maxKeywords (default 5 keywords)
  const keywordsToSearch = keywords.slice(0, maxKeywords);
  
  if (keywordsToSearch.length === 0) {
    return {
      success: true,
      competitors: [],
      message: 'No keywords provided - skipping competitor search',
    };
  }
  
  // Get user's website URL to exclude from results
  const userWebsiteUrl = context.interview?.responses?.websiteUrl || 
                         context.interview?.externalData?.crawledData?.url;
  
  // Get language from crawled data
  const language = context.interview?.externalData?.crawledData?.language || 'he';
  
  // Get target location from interview responses
  const targetLocations = context.interview?.responses?.targetLocations || 
                          context.responses?.targetLocations || 
                          ['israel'];
  const targetLocation = Array.isArray(targetLocations) ? targetLocations[0] : targetLocations;

  console.log(`[FindCompetitors] Searching for competitors using Google Search`);
  console.log(`[FindCompetitors] Keywords: ${keywordsToSearch.join(', ')}`);
  console.log(`[FindCompetitors] Target location: ${targetLocation}`);
  console.log(`[FindCompetitors] Business location:`, businessLocation);
  console.log(`[FindCompetitors] Business type: ${businessType}`);
  console.log(`[FindCompetitors] User website: ${userWebsiteUrl}`);

  // Build website context from crawled data for better competitor matching
  const crawledData = context.interview?.externalData?.crawledData || {};
  const websiteContext = {
    about: crawledData.description || context.interview?.responses?.businessConfirmation?.about || null,
    category: crawledData.category || null,
    targetAudience: crawledData.targetAudience || null,
    websiteType: null, // Will be derived below
  };

  // Derive website type from available data
  // Check the about text, category, and URL patterns to understand what kind of site this is
  const aboutLower = (websiteContext.about || '').toLowerCase();
  const categoryLower = (websiteContext.category || '').toLowerCase();
  const urlLower = (userWebsiteUrl || '').toLowerCase();
  
  // Detect website type based on content signals
  if (/blog|מגזין|magazine|journal|עיתון|media|תוכן|content.*creator/i.test(aboutLower + ' ' + categoryLower + ' ' + urlLower)) {
    websiteContext.websiteType = 'blog / content website / online magazine';
  } else if (/shop|store|חנות|ecommerce|e-commerce|מכירה|buy|sell|products|מוצרים/i.test(aboutLower + ' ' + categoryLower)) {
    websiteContext.websiteType = 'e-commerce / online store';
  } else if (/saas|software|tool|platform|app|אפליקציה|תוכנה|כלי/i.test(aboutLower + ' ' + categoryLower)) {
    websiteContext.websiteType = 'SaaS / software tool';
  } else if (/agency|studio|סטודיו|סוכנות|consulting|ייעוץ|משרד|firm|שירותים|services/i.test(aboutLower + ' ' + categoryLower)) {
    websiteContext.websiteType = 'service provider / agency';
  } else if (/course|קורס|academy|אקדמי|training|הדרכה|learn|למידה|education|חינוך/i.test(aboutLower + ' ' + categoryLower)) {
    websiteContext.websiteType = 'education / course platform';
  } else if (/non-?profit|עמותה|charity|התנדב/i.test(aboutLower + ' ' + categoryLower)) {
    websiteContext.websiteType = 'non-profit / organization';
  }

  console.log(`[FindCompetitors] Website context:`, {
    about: websiteContext.about?.substring(0, 80),
    category: websiteContext.category,
    websiteType: websiteContext.websiteType,
    targetAudience: websiteContext.targetAudience?.substring(0, 60),
  });

  try {
    // Search for competitors for each keyword using Google Search
    const allCompetitors = [];
    const searchResults = [];
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    
    // Run all per-keyword Google searches in parallel instead of one-by-one
    // with a 500ms gap. The previous serial loop made 5 keywords take
    // ~5×(LLM round-trip + 500ms) ≈ 15-25s of wall time. Gemini's grounding
    // tool tolerates a small parallel burst fine, and we already cap at 5
    // keywords, so the load is bounded.
    console.log(`[FindCompetitors] Running ${keywordsToSearch.length} keyword searches in parallel`);
    const parallelResults = await Promise.all(
      keywordsToSearch.map((keyword) =>
        searchCompetitorsForKeyword(
          keyword,
          userWebsiteUrl,
          targetLocation,
          language,
          businessLocation,
          businessType,
          websiteContext,
        ).then((result) => ({ keyword, ...result })),
      ),
    );
    for (const result of parallelResults) {
      searchResults.push(result);
      totalInputTokens += result.inputTokens || 0;
      totalOutputTokens += result.outputTokens || 0;
      if (result.success && result.competitors) {
        allCompetitors.push(...result.competitors);
      }
    }
    
    // Aggregate scores by domain
    // Map: domain -> { name, url, domain, keywords: [{keyword, rank}], totalScore }
    // 
    // SCORING FORMULA:
    // - Base score per keyword appearance: (6 - rank) points (rank 1 = 5 points, rank 5 = 1 point)
    // - Multiple keywords bonus: +3 points per additional keyword
    // - Homepage bonus: +2 points (prefer businesses ranking with homepage vs blog posts)
    // - Blog/article penalty: -2 points (articles/blog posts are less likely to be direct competitors)
    // - Deep URL penalty: -1 point per depth level beyond 2
    const competitorScores = new Map();
    
    for (const comp of allCompetitors) {
      if (!comp.domain) continue;
      
      const existing = competitorScores.get(comp.domain);
      
      // Base score: higher rank = more points (rank 1 = 5 points, rank 5 = 1 point)
      let rankScore = Math.max(1, 6 - (comp.rank || 5));
      
      // Homepage bonus: +2 points
      if (comp.isHomepage) {
        rankScore += 2;
      }
      
      // Blog/article penalty: -2 points
      if (comp.isBlogPost) {
        rankScore -= 2;
      }
      
      // Deep URL penalty: -1 per level beyond 2
      const urlDepth = comp.urlDepth || 0;
      if (urlDepth > 2) {
        rankScore -= Math.min(urlDepth - 2, 3); // Max -3 penalty
      }
      
      // Ensure score doesn't go below 1
      rankScore = Math.max(1, rankScore);
      
      if (existing) {
        // Already seen this domain - add keyword and bonus score
        existing.keywords.push({ keyword: comp.keyword, rank: comp.rank || 5 });
        existing.totalScore += rankScore + 3; // +3 bonus for appearing in multiple keywords
        existing.keywordCount++;
        // Always use homepage URL
        existing.url = `https://${comp.domain}`;
      } else {
        competitorScores.set(comp.domain, {
          name: comp.name,
          url: comp.url,
          domain: comp.domain,
          keywords: [{ keyword: comp.keyword, rank: comp.rank || 5 }],
          totalScore: rankScore,
          keywordCount: 1,
          source: comp.source,
          verified: comp.verified,
          isHomepage: comp.isHomepage,
          isBlogPost: comp.isBlogPost,
        });
      }
    }
    
    // Convert to array and sort by score (descending)
    const rankedCompetitors = Array.from(competitorScores.values())
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, 10) // Top 10
      .map((comp, index) => ({
        name: comp.name,
        url: comp.url,
        domain: comp.domain,
        keywords: comp.keywords,
        keywordCount: comp.keywordCount,
        totalScore: comp.totalScore,
        averageRank: comp.keywords.reduce((sum, k) => sum + k.rank, 0) / comp.keywords.length,
        rank: index + 1, // Overall rank (1-10)
        autoSelected: index < 5, // Auto-select top 5
        source: comp.source,
        verified: comp.verified,
      }));

    console.log(`[FindCompetitors] Aggregated ${rankedCompetitors.length} unique competitors`);
    console.log(`[FindCompetitors] Top 5 auto-selected:`, rankedCompetitors.slice(0, 5).map(c => `${c.domain} (score: ${c.totalScore}, keywords: ${c.keywordCount})`));

    // Fetch each competitor's homepage in parallel and pull out the meta
    // description so the UI can render a one-line summary on each card.
    // Done after ranking + slicing so we only do 10 requests total. Each
    // request has a hard 4-second timeout; failures = no description (the
    // card just falls back to its keyword list).
    const decoratedCompetitors = await enrichWithMetaDescriptions(rankedCompetitors);

    // Track Ai-GCoins usage with actual token counts
    if (context.accountId) {
      // Get business name from crawled data
      const businessName = context.interview?.externalData?.crawledData?.businessName;
      
      await trackAIUsage({
        accountId: context.accountId,
        userId: context.userId,
        siteId: context.siteId,
        operation: 'FIND_COMPETITORS',
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        description: `Found ${decoratedCompetitors.length} competitors for ${keywordsToSearch.length} keywords`,
        metadata: {
          keywordsSearched: keywordsToSearch,
          competitorsFound: decoratedCompetitors.length,
          websiteUrl: userWebsiteUrl,
          businessName,
          model: 'gemini-2.5-pro',
          descriptionKey: 'foundCompetitors',
          descriptionParams: { count: decoratedCompetitors.length, keywords: keywordsToSearch.length },
        },
      });
    }

    return {
      success: true,
      competitors: decoratedCompetitors,
      keywordsSearched: keywordsToSearch,
      storeInExternalData: {
        competitorSuggestions: decoratedCompetitors,
        competitorSearchedAt: new Date().toISOString(),
        searchDetails: searchResults.map(r => ({
          keyword: r.keyword,
          found: r.competitors?.length || 0,
          success: r.success
        })),
      },
    };
    
  } catch (error) {
    console.error('[FindCompetitors] Error:', error);
    return {
      success: false,
      competitors: [],
      error: error.message || 'Failed to find competitors',
    };
  }
}

/**
 * Pull `<meta name="description">` (or `og:description`) from each competitor's
 * homepage so the UI can show a real one-line summary on the card. Runs in
 * parallel with a per-domain timeout — failures degrade gracefully (the
 * card just falls back to its keyword list). Total wall time is bounded by
 * the longest single fetch + the global timeout, not by the count of
 * competitors.
 *
 * @param {Array} competitors - Ranked competitor list (top 10)
 * @returns {Promise<Array>} same competitors, each with a `description` field
 */
async function enrichWithMetaDescriptions(competitors) {
  const PER_REQUEST_TIMEOUT_MS = 4000;
  const META_DESC_RE = /<meta\s+[^>]*name=["']description["'][^>]*content=["']([^"']{0,400})["'][^>]*>/i;
  const META_DESC_RE_ALT = /<meta\s+[^>]*content=["']([^"']{0,400})["'][^>]*name=["']description["'][^>]*>/i;
  const OG_DESC_RE = /<meta\s+[^>]*property=["']og:description["'][^>]*content=["']([^"']{0,400})["'][^>]*>/i;
  const OG_DESC_RE_ALT = /<meta\s+[^>]*content=["']([^"']{0,400})["'][^>]*property=["']og:description["'][^>]*>/i;

  const fetchOne = async (comp) => {
    if (!comp?.url) return comp;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), PER_REQUEST_TIMEOUT_MS);
      const res = await fetch(comp.url, {
        // Use a real-browser UA for description scraping — many sites WAF
        // unknown UAs out, and we just want public meta tags here, not a
        // privileged crawl.
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; GhostSEO-Preview/1.0)',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9,he;q=0.8',
        },
        redirect: 'follow',
        signal: controller.signal,
      }).catch(() => null);
      clearTimeout(timeout);
      if (!res || !res.ok) return comp;
      // Read just enough HTML to find the <head>. Most sites have meta tags
      // within the first 50KB; reading the full page is wasteful.
      const reader = res.body?.getReader?.();
      let html = '';
      if (reader) {
        const decoder = new TextDecoder();
        let received = 0;
        const MAX = 60_000;
        while (received < MAX) {
          const { value, done } = await reader.read();
          if (done) break;
          html += decoder.decode(value, { stream: true });
          received += value?.byteLength || 0;
          if (html.includes('</head>')) break;
        }
        try { reader.cancel(); } catch {}
      } else {
        html = await res.text();
      }

      let description = null;
      const m1 = html.match(META_DESC_RE) || html.match(META_DESC_RE_ALT);
      if (m1?.[1]) description = m1[1].trim();
      if (!description) {
        const m2 = html.match(OG_DESC_RE) || html.match(OG_DESC_RE_ALT);
        if (m2?.[1]) description = m2[1].trim();
      }
      // HTML-decode a few common entities so the card text reads naturally.
      if (description) {
        description = description
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&apos;/g, "'")
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&nbsp;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        // Cap so the card doesn't blow up vertically.
        if (description.length > 220) description = description.slice(0, 217).trim() + '…';
      }
      return description ? { ...comp, description } : comp;
    } catch {
      return comp;
    }
  };

  return Promise.all(competitors.map(fetchOne));
}
