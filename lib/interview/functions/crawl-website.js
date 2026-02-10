/**
 * Website Crawler Function
 * 
 * Comprehensive website crawling that:
 * 1. Validates and normalizes the URL
 * 2. Fetches the homepage
 * 3. Discovers and parses sitemaps
 * 4. Fetches about and contact pages
 * 5. Analyzes SEO issues
 * 6. Extracts business data using AI
 * 7. Returns structured data
 */

import { validateAndFixUrl, checkUrlReachable } from './validate-url.js';
import { discoverSitemaps, parseSitemap, categorizeUrls } from './sitemap-parser.js';
import { analyzeSEO } from './seo-analyzer.js';
import { extractBusinessDataWithAI, normalizePhoneNumber, validateEmail } from './extract-business-data.js';

/**
 * Main crawl function that orchestrates the entire crawling process
 * 
 * @param {string} userInput - The URL input from the user
 * @param {Object} options - Crawl options
 * @param {boolean} options.skipSitemap - Skip sitemap discovery (default: false)
 * @param {boolean} options.skipSEO - Skip SEO analysis (default: false)
 * @param {number} options.maxSitemapUrls - Max URLs to parse from sitemap (default: 50)
 * @returns {Promise<Object>} Complete crawl results
 */
export async function crawlWebsite(userInput, options = {}) {
  const { skipSitemap = false, skipSEO = false, maxSitemapUrls = 50 } = options;
  
  console.log('\n========================================');
  console.log('[Crawl] Starting website crawl');
  console.log('[Crawl] User input:', userInput);
  console.log('========================================\n');
  
  const result = {
    success: false,
    url: null,
    validation: null,
    pageData: null,
    sitemap: null,
    seoAnalysis: null,
    errors: [],
    crawledAt: new Date().toISOString(),
  };
  
  // Step 1: Validate and fix URL
  console.log('[Crawl] Step 1: Validating URL...');
  const validation = await validateAndFixUrl(userInput);
  result.validation = validation;
  
  if (!validation.isValid) {
    result.errors.push({
      step: 'validation',
      message: validation.error || 'Invalid URL',
    });
    console.log('[Crawl] URL validation failed:', validation.error);
    return result;
  }
  
  result.url = validation.fixedUrl;
  console.log('[Crawl] URL validated:', result.url);
  
  // Step 2: Check if URL is reachable
  console.log('[Crawl] Step 2: Checking URL reachability...');
  const reachability = await checkUrlReachable(result.url);
  
  if (!reachability.reachable) {
    result.errors.push({
      step: 'reachability',
      message: `Website not reachable: ${reachability.error}`,
    });
    console.log('[Crawl] Website not reachable:', reachability.error);
    return result;
  }
  
  // Use final URL after redirects
  if (reachability.redirected && reachability.finalUrl) {
    console.log('[Crawl] Followed redirect to:', reachability.finalUrl);
    result.url = reachability.finalUrl;
  }
  
  // Step 3: Fetch the homepage
  console.log('[Crawl] Step 3: Fetching homepage...');
  let html;
  try {
    const response = await fetch(result.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GhostPostBot/1.0; +https://ghostpost.co.il)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5,he;q=0.3',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    html = await response.text();
    console.log('[Crawl] Homepage fetched, size:', html.length, 'bytes');
  } catch (error) {
    result.errors.push({
      step: 'fetch',
      message: `Failed to fetch page: ${error.message}`,
    });
    console.log('[Crawl] Fetch failed:', error.message);
    return result;
  }
  
  // Step 4: Extract basic page data
  console.log('[Crawl] Step 4: Extracting page data...');
  result.pageData = extractPageData(html, result.url);
  console.log('[Crawl] Page data extracted:', result.pageData.title);
  
  // Step 5: Discover and parse sitemaps
  if (!skipSitemap) {
    console.log('[Crawl] Step 5: Discovering sitemaps...');
    try {
      const sitemapDiscovery = await discoverSitemaps(result.url);
      
      if (sitemapDiscovery.found && sitemapDiscovery.sitemaps.length > 0) {
        console.log('[Crawl] Found', sitemapDiscovery.sitemaps.length, 'sitemap(s)');
        
        // Parse the first sitemap
        const sitemapResult = await parseSitemap(sitemapDiscovery.sitemaps[0], {
          maxUrls: maxSitemapUrls,
        });
        
        if (sitemapResult.success) {
          result.sitemap = {
            found: true,
            sitemapUrls: sitemapDiscovery.sitemaps,
            urls: sitemapResult.urls,
            isIndex: sitemapResult.isIndex,
            categories: categorizeUrls(sitemapResult.urls),
          };
          console.log('[Crawl] Sitemap parsed:', sitemapResult.urls.length, 'URLs');
        }
      } else {
        console.log('[Crawl] No sitemaps found');
        result.sitemap = { found: false };
      }
    } catch (error) {
      console.log('[Crawl] Sitemap discovery error:', error.message);
      result.sitemap = { found: false, error: error.message };
    }
  }
  
  // Step 5.5: Fetch about and contact pages for more comprehensive data
  console.log('[Crawl] Step 5.5: Fetching about and contact pages...');
  let aboutHtml = '';
  let contactHtml = '';
  
  try {
    const additionalPages = await fetchAdditionalPages(result.url, result.sitemap?.urls || []);
    aboutHtml = additionalPages.aboutHtml;
    contactHtml = additionalPages.contactHtml;
    console.log('[Crawl] Additional pages fetched:', {
      hasAbout: aboutHtml.length > 0,
      hasContact: contactHtml.length > 0,
    });
  } catch (error) {
    console.log('[Crawl] Error fetching additional pages:', error.message);
  }
  
  // Step 6: SEO Analysis
  if (!skipSEO) {
    console.log('[Crawl] Step 6: Analyzing SEO...');
    try {
      result.seoAnalysis = await analyzeSEO(html, result.url, result.sitemap);
      console.log('[Crawl] SEO analysis complete. Score:', result.seoAnalysis.score);
    } catch (error) {
      console.log('[Crawl] SEO analysis error:', error.message);
      result.errors.push({
        step: 'seo',
        message: `SEO analysis failed: ${error.message}`,
      });
    }
  }
  
  // Step 7: AI Business Data Extraction (with all page content)
  console.log('[Crawl] Step 7: Extracting business data with AI...');
  try {
    // Pass all page content to AI for comprehensive analysis
    const pagesData = {
      homeHtml: html,
      aboutHtml: aboutHtml,
      contactHtml: contactHtml,
    };
    
    const aiBusinessData = await extractBusinessDataWithAI(pagesData, result.url, result.pageData);
    if (aiBusinessData.success) {
      // Merge AI-extracted data with page data (AI data takes priority for fields it could extract)
      result.pageData = {
        ...result.pageData,
        businessName: aiBusinessData.data.businessName || result.pageData?.title || result.pageData?.siteName,
        description: aiBusinessData.data.description || result.pageData?.description,
        category: aiBusinessData.data.category,
        address: aiBusinessData.data.address,
        // AI-extracted and normalized contact data takes priority
        contact: {
          emails: aiBusinessData.data.email 
            ? [aiBusinessData.data.email] 
            : (result.pageData?.contact?.emails || []).map(e => validateEmail(e)).filter(Boolean),
          phones: aiBusinessData.data.phone 
            ? [aiBusinessData.data.phone] 
            : (result.pageData?.contact?.phones || []).map(p => normalizePhoneNumber(p)).filter(Boolean),
          socialLinks: result.pageData?.contact?.socialLinks || {},
        },
        aiExtracted: aiBusinessData.data,
      };
      console.log('[Crawl] AI business data extracted:', aiBusinessData.data.businessName);
    } else {
      console.log('[Crawl] AI extraction skipped or failed:', aiBusinessData.error);
      console.log('[Crawl] Fallback aiBusinessData.data:', aiBusinessData.data);
      
      // Even without AI, normalize existing phone numbers and validate emails
      if (result.pageData?.contact) {
        result.pageData.contact.phones = (result.pageData.contact.phones || [])
          .map(p => normalizePhoneNumber(p))
          .filter(Boolean);
        result.pageData.contact.emails = (result.pageData.contact.emails || [])
          .map(e => validateEmail(e))
          .filter(Boolean);
      }
      
      // Use fallback data if available
      if (aiBusinessData.data) {
        console.log('[Crawl] Using fallback businessName:', aiBusinessData.data.businessName);
        result.pageData = {
          ...result.pageData,
          businessName: aiBusinessData.data.businessName || result.pageData?.businessName,
          description: aiBusinessData.data.description || result.pageData?.description,
          category: aiBusinessData.data.category || null,
          address: aiBusinessData.data.address || null,
          aiExtracted: aiBusinessData.data,
        };
      }
    }
  } catch (error) {
    console.log('[Crawl] AI extraction error:', error.message);
    // Non-critical, continue without AI data
  }
  
  result.success = true;
  
  console.log('\n========================================');
  console.log('[Crawl] Crawl complete!');
  console.log('[Crawl] URL:', result.url);
  console.log('[Crawl] Business Name:', result.pageData?.businessName);
  console.log('[Crawl] SEO Score:', result.seoAnalysis?.score || 'N/A');
  console.log('[Crawl] Sitemap URLs:', result.sitemap?.urls?.length || 0);
  console.log('========================================\n');
  
  // Log full result for debugging
  console.log('[Crawl] Full Result JSON:');
  console.log(JSON.stringify(result, null, 2));
  
  return result;
}

/**
 * Extract basic page data from HTML
 */
function extractPageData(html, url) {
  // Title
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : null;
  
  // Meta description
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i) ||
                    html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
  const description = descMatch ? descMatch[1].trim() : null;
  
  // Open Graph
  const ogTitle = extractMeta(html, 'og:title');
  const ogDescription = extractMeta(html, 'og:description');
  const ogImage = extractMeta(html, 'og:image');
  const ogSiteName = extractMeta(html, 'og:site_name');
  
  // Language
  const langMatch = html.match(/<html[^>]*lang=["']([^"']*)["']/i);
  const language = langMatch ? langMatch[1] : detectLanguage(html);
  
  // Extract text content for analysis
  const textContent = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Contact info
  const emails = extractEmails(textContent);
  const phones = extractPhones(textContent);
  const socialLinks = extractSocialLinks(html);
  
  // Keywords from meta
  const keywordsMatch = html.match(/<meta[^>]*name=["']keywords["'][^>]*content=["']([^"']*)["']/i);
  const metaKeywords = keywordsMatch 
    ? keywordsMatch[1].split(',').map(k => k.trim()).filter(Boolean)
    : [];
  
  return {
    url,
    title: ogTitle || title,
    description: ogDescription || description,
    image: ogImage,
    siteName: ogSiteName,
    language,
    contact: {
      emails,
      phones,
      socialLinks,
    },
    keywords: metaKeywords,
    textContentLength: textContent.length,
  };
}

/**
 * Extract meta property content
 */
function extractMeta(html, property) {
  const pattern = new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i');
  const match = html.match(pattern);
  return match ? match[1].trim() : null;
}

/**
 * Detect language from text content
 */
function detectLanguage(text) {
  const hebrewRegex = /[\u0590-\u05FF]/;
  const arabicRegex = /[\u0600-\u06FF]/;
  
  if (hebrewRegex.test(text)) return 'he';
  if (arabicRegex.test(text)) return 'ar';
  
  return 'en';
}

/**
 * Extract email addresses from text
 */
function extractEmails(text) {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(emailRegex);
  return matches ? [...new Set(matches)].slice(0, 5) : [];
}

/**
 * Extract phone numbers from text
 */
function extractPhones(text) {
  const phoneRegex = /(?:\+?[0-9]{1,3}[-.\s]?)?\(?[0-9]{2,4}\)?[-.\s]?[0-9]{2,4}[-.\s]?[0-9]{2,4}/g;
  const matches = text.match(phoneRegex);
  if (!matches) return [];
  
  return [...new Set(matches.filter(p => {
    const digits = p.replace(/\D/g, '');
    return digits.length >= 9 && digits.length <= 15;
  }))].slice(0, 5);
}

/**
 * Extract social media links
 */
function extractSocialLinks(html) {
  const socialPatterns = {
    facebook: /https?:\/\/(?:www\.)?facebook\.com\/[a-zA-Z0-9._-]+/gi,
    twitter: /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/[a-zA-Z0-9_]+/gi,
    instagram: /https?:\/\/(?:www\.)?instagram\.com\/[a-zA-Z0-9._]+/gi,
    linkedin: /https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/[a-zA-Z0-9-]+/gi,
    youtube: /https?:\/\/(?:www\.)?youtube\.com\/(?:channel|user|c|@)[a-zA-Z0-9_-]+/gi,
    tiktok: /https?:\/\/(?:www\.)?tiktok\.com\/@[a-zA-Z0-9._-]+/gi,
  };
  
  const links = {};
  for (const [platform, pattern] of Object.entries(socialPatterns)) {
    const matches = html.match(pattern);
    if (matches && matches.length > 0) {
      links[platform] = matches[0];
    }
  }
  
  return links;
}

/**
 * Fetch about and contact pages for more comprehensive data extraction
 * 
 * @param {string} baseUrl - The base URL of the website
 * @param {Array} sitemapUrls - URLs from the sitemap (if available)
 * @returns {Promise<Object>} Object containing aboutHtml and contactHtml
 */
async function fetchAdditionalPages(baseUrl, sitemapUrls = []) {
  const result = { aboutHtml: '', contactHtml: '' };
  
  // Common paths for about and contact pages (lowercase for matching)
  const aboutKeywords = ['about', 'about-us', 'about-me', 'אודות', 'אודותינו', 'company', 'company_profile', 'who-we-are', 'profile'];
  const contactKeywords = ['contact', 'contact-us', 'contact_us', 'צור-קשר', 'יצירת-קשר', 'get-in-touch', 'צור_קשר'];
  
  // Try to find about and contact URLs from sitemap first
  let aboutUrl = null;
  let contactUrl = null;
  
  // Normalize sitemap URLs (handle both string and object formats)
  const normalizedUrls = sitemapUrls.map(u => typeof u === 'string' ? u : u?.url).filter(Boolean);
  console.log('[Crawl] Searching for about/contact pages in', normalizedUrls.length, 'sitemap URLs');
  
  for (const url of normalizedUrls) {
    const lowerUrl = url.toLowerCase();
    // Check if any keyword appears in the URL path
    if (!aboutUrl && aboutKeywords.some(k => lowerUrl.includes(k))) {
      aboutUrl = url;
      console.log('[Crawl] Found about page in sitemap:', aboutUrl);
    }
    if (!contactUrl && contactKeywords.some(k => lowerUrl.includes(k))) {
      contactUrl = url;
      console.log('[Crawl] Found contact page in sitemap:', contactUrl);
    }
  }
  
  // If not found in sitemap, try common paths
  const baseUrlObj = new URL(baseUrl);
  const aboutPaths = ['/about', '/about-us', '/about-me', '/אודות', '/אודותינו', '/company', '/company-profile', '/Company_profile', '/who-we-are'];
  const contactPaths = ['/contact', '/contact-us', '/Contact_us', '/צור-קשר', '/יצירת-קשר', '/get-in-touch'];
  
  if (!aboutUrl) {
    console.log('[Crawl] About page not in sitemap, trying common paths...');
    for (const path of aboutPaths) {
      const testUrl = new URL(path, baseUrlObj.origin).toString();
      if (await checkPageExists(testUrl)) {
        aboutUrl = testUrl;
        console.log('[Crawl] Found about page at:', aboutUrl);
        break;
      }
    }
  }
  
  if (!contactUrl) {
    console.log('[Crawl] Contact page not in sitemap, trying common paths...');
    for (const path of contactPaths) {
      const testUrl = new URL(path, baseUrlObj.origin).toString();
      if (await checkPageExists(testUrl)) {
        contactUrl = testUrl;
        console.log('[Crawl] Found contact page at:', contactUrl);
        break;
      }
    }
  }
  
  if (!contactUrl) {
    console.log('[Crawl] Warning: Contact page not found anywhere');
  }
  
  // Fetch the pages in parallel
  const fetchPromises = [];
  
  if (aboutUrl) {
    console.log('[Crawl] Fetching about page:', aboutUrl);
    fetchPromises.push(
      fetchPageContent(aboutUrl)
        .then(html => { 
          result.aboutHtml = html;
          console.log('[Crawl] About page fetched, length:', html.length);
        })
        .catch(err => { console.log('[Crawl] Error fetching about page:', err.message); })
    );
  }
  
  if (contactUrl) {
    console.log('[Crawl] Fetching contact page:', contactUrl);
    fetchPromises.push(
      fetchPageContent(contactUrl)
        .then(html => { 
          result.contactHtml = html;
          console.log('[Crawl] Contact page fetched, length:', html.length);
        })
        .catch(err => { console.log('[Crawl] Error fetching contact page:', err.message); })
    );
  }
  
  await Promise.all(fetchPromises);
  
  return result;
}

/**
 * Check if a page exists (HEAD request)
 */
async function checkPageExists(url) {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GhostPostBot/1.0)',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch page content
 */
async function fetchPageContent(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; GhostPostBot/1.0; +https://ghostpost.co.il)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  return response.text();
}
