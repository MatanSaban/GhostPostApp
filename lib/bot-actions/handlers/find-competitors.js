/**
 * Find Competitors Handler
 * 
 * Finds competitors based on selected keywords using Google Search grounding.
 * Uses Vercel AI SDK with Google Gemini's search tool to find real competitors.
 * Extracts verified URLs from Google's grounding metadata and sources.
 */

import { generateText } from 'ai';
import { getTextModel } from '@/lib/ai/gemini';

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
 * Check if a URL is a valid competitor (not a search engine, social media, etc.)
 */
function isValidCompetitorUrl(url, userWebsiteUrl) {
  const excludedDomains = [
    'google.com', 'google.co.il', 'google.', 'youtube.com', 'facebook.com', 'twitter.com', 'x.com',
    'linkedin.com', 'instagram.com', 'tiktok.com', 'pinterest.com', 'reddit.com',
    'wikipedia.org', 'amazon.com', 'ebay.com', 'aliexpress.com',
    'gov.il', 'gov.uk', 'gov.us', '.gov', 'fiverr.com', 'upwork.com',
    'zap.co.il', 'yad2.co.il', 'walla.co.il', 'mako.co.il', 'ynet.co.il',
    'support.google', 'cloud.google', 'developers.google',
  ];
  
  const domain = extractRootDomain(url);
  if (!domain) return false;
  
  // Exclude common non-competitor domains
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
 * Search Google for competitors for a specific keyword
 * Uses Gemini with Google Search grounding to get REAL URLs from verified sources
 * 
 * The key is that Google Search grounding returns URLs in two places:
 * 1. result.sources - Array of source objects with url and title
 * 2. result.providerMetadata.google.groundingMetadata.groundingChunks - Verified chunks with web.uri
 */
async function searchCompetitorsForKeyword(keyword, userWebsiteUrl, targetLocation = 'israel', language = 'he') {
  const model = getTextModel();
  
  // Build a location-aware search prompt
  // Support both full keys (israel, unitedStates) and ISO codes (IL, US)
  const locationMap = {
    // Full keys
    israel: 'Israel / ישראל',
    unitedStates: 'United States',
    unitedKingdom: 'United Kingdom',
    germany: 'Germany / Deutschland',
    france: 'France',
    spain: 'Spain',
    italy: 'Italy',
    netherlands: 'Netherlands',
    australia: 'Australia',
    canada: 'Canada',
    global: 'worldwide',
    // ISO country codes
    IL: 'Israel / ישראל',
    US: 'United States',
    UK: 'United Kingdom',
    GB: 'United Kingdom',
    DE: 'Germany / Deutschland',
    FR: 'France',
    ES: 'Spain',
    IT: 'Italy',
    NL: 'Netherlands',
    AU: 'Australia',
    CA: 'Canada',
  };
  const locationText = locationMap[targetLocation] || targetLocation || 'Israel';
  
  // Create a search-focused prompt that will trigger actual Google search
  const prompt = `Search for businesses and websites that rank for "${keyword}" in ${locationText}.

I need to find the top competing websites for this search term. Search Google and list the actual websites that appear in the search results.

For this keyword "${keyword}", what are the top 10 real business websites that appear in Google search results?

List each competitor with their website URL and business name.`;

  try {
    console.log(`[FindCompetitors] Searching Google for "${keyword}" in ${locationText}...`);
    
    const result = await generateText({
      model,
      tools: {
        google_search: google.tools.googleSearch({
          // MODE_UNSPECIFIED = always trigger search
          mode: 'MODE_UNSPECIFIED',
        }),
      },
      prompt,
      maxTokens: 4096,
    });

    const competitors = [];
    const seenDomains = new Set();
    
    // Method 1: Extract from sources (primary method - verified URLs)
    if (result.sources && result.sources.length > 0) {
      console.log(`[FindCompetitors] Found ${result.sources.length} sources for "${keyword}"`);
      console.log(`[FindCompetitors] First source structure:`, JSON.stringify(result.sources[0], null, 2));
      for (const source of result.sources) {
        // Handle various source formats from Vercel AI SDK
        const url = source.url || source.uri || source.link || source.href;
        const title = source.title || source.name || source.displayName || '';
        if (url) {
          console.log(`[FindCompetitors] Processing source URL: ${url}`);
          const domain = extractRootDomain(url);
          
          if (!domain) {
            console.log(`[FindCompetitors] Skipping source (no domain): ${url}`);
            continue;
          }
          if (seenDomains.has(domain)) {
            console.log(`[FindCompetitors] Skipping source duplicate: ${domain}`);
            continue;
          }
          if (!isValidCompetitorUrl(url, userWebsiteUrl)) {
            console.log(`[FindCompetitors] Skipping invalid source: ${url} (domain: ${domain})`);
            continue;
          }
          
          seenDomains.add(domain);
          console.log(`[FindCompetitors] Added source competitor: ${domain}`);
          competitors.push({
            name: title || domain,
            url: url,
            domain: domain,
            keyword: keyword,
            source: 'google-search',
            verified: true,
          });
        } else {
          console.log(`[FindCompetitors] Source has no URL field:`, Object.keys(source));
        }
      }
    }
    
    // Method 2: Extract from grounding metadata (backup/additional sources)
    const groundingMetadata = result.providerMetadata?.google?.groundingMetadata;
    if (groundingMetadata) {
      const groundingChunks = groundingMetadata.groundingChunks || [];
      console.log(`[FindCompetitors] Found ${groundingChunks.length} grounding chunks for "${keyword}"`);
      if (groundingChunks.length > 0) {
        console.log(`[FindCompetitors] First grounding chunk structure:`, JSON.stringify(groundingChunks[0], null, 2));
      }
      
      for (const chunk of groundingChunks) {
        const url = chunk.web?.uri || chunk.uri;
        const title = chunk.web?.title || chunk.title || '';
        if (url) {
          console.log(`[FindCompetitors] Processing grounding chunk URL: ${url}`);
          const domain = extractRootDomain(url);
          
          if (!domain) {
            console.log(`[FindCompetitors] Skipping URL (no domain): ${url}`);
            continue;
          }
          if (seenDomains.has(domain)) {
            console.log(`[FindCompetitors] Skipping duplicate domain: ${domain}`);
            continue;
          }
          if (!isValidCompetitorUrl(url, userWebsiteUrl)) {
            console.log(`[FindCompetitors] Skipping invalid/excluded URL: ${url}`);
            continue;
          }
          
          seenDomains.add(domain);
          console.log(`[FindCompetitors] Added competitor: ${domain}`);
          competitors.push({
            name: title || domain,
            url: url,
            domain: domain,
            keyword: keyword,
            source: 'grounding-chunk',
            verified: true,
          });
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
      for (const url of textUrls) {
        const cleanUrl = url.replace(/[\.\,\)\]]+$/, ''); // Remove trailing punctuation
        const domain = extractRootDomain(cleanUrl);
        
        if (!domain || seenDomains.has(domain)) continue;
        if (!isValidCompetitorUrl(cleanUrl, userWebsiteUrl)) continue;
        
        seenDomains.add(domain);
        console.log(`[FindCompetitors] Added from text (URL): ${domain}`);
        competitors.push({
          name: domain,
          url: cleanUrl,
          domain: domain,
          keyword: keyword,
          source: 'text-extracted',
          verified: false,
        });
      }
      
      // Process domain patterns
      for (const domainText of textDomains) {
        const domain = domainText.toLowerCase().replace(/^www\./, '');
        
        if (seenDomains.has(domain)) continue;
        const url = `https://${domain}`;
        if (!isValidCompetitorUrl(url, userWebsiteUrl)) continue;
        
        seenDomains.add(domain);
        console.log(`[FindCompetitors] Added from text (domain): ${domain}`);
        competitors.push({
          name: domain,
          url: url,
          domain: domain,
          keyword: keyword,
          source: 'text-extracted',
          verified: false,
        });
      }
    }
    
    console.log(`[FindCompetitors] Found ${competitors.length} total competitors for "${keyword}"`);
    
    return {
      success: true,
      competitors: competitors.slice(0, 5),
      rawResponse: result.text,
    };
  } catch (error) {
    console.error(`[FindCompetitors] Google Search error for "${keyword}":`, error);
    return {
      success: false,
      competitors: [],
      error: error.message,
    };
  }
}

/**
 * Main handler function
 */
export async function findCompetitors(params, context) {
  const { keywords: inputKeywords, maxKeywords = 3 } = params;
  
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
    keywords = [];
  }
  
  // Limit to maxKeywords (default 3 to reduce API calls)
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
  console.log(`[FindCompetitors] User website: ${userWebsiteUrl}`);

  try {
    // Search for competitors for each keyword using Google Search
    const allCompetitors = [];
    const searchResults = [];
    
    for (const keyword of keywordsToSearch) {
      console.log(`[FindCompetitors] Searching Google for: "${keyword}"`);
      
      const result = await searchCompetitorsForKeyword(keyword, userWebsiteUrl, targetLocation, language);
      searchResults.push({ keyword, ...result });
      
      if (result.success && result.competitors) {
        allCompetitors.push(...result.competitors);
      }
      
      // Small delay between searches to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Deduplicate competitors by domain
    const seenDomains = new Set();
    const uniqueCompetitors = allCompetitors.filter(comp => {
      if (!comp.domain || seenDomains.has(comp.domain)) return false;
      seenDomains.add(comp.domain);
      return true;
    });

    console.log(`[FindCompetitors] Found ${uniqueCompetitors.length} unique competitors`);

    return {
      success: true,
      competitors: uniqueCompetitors,
      keywordsSearched: keywordsToSearch,
      storeInExternalData: {
        competitorSuggestions: uniqueCompetitors,
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
