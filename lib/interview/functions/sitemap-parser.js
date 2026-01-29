/**
 * Sitemap Parser
 * 
 * Discovers and parses sitemaps from a website.
 * Handles sitemap index files, XML sitemaps, and common sitemap locations.
 */

/**
 * Common sitemap locations to check
 */
const SITEMAP_LOCATIONS = [
  '/sitemap.xml',
  '/sitemap_index.xml',
  '/sitemap-index.xml',
  '/sitemaps.xml',
  '/sitemap/',
  '/sitemap/sitemap.xml',
  '/wp-sitemap.xml', // WordPress
  '/post-sitemap.xml',
  '/page-sitemap.xml',
  '/sitemap1.xml',
  '/news-sitemap.xml',
  '/product-sitemap.xml',
];

/**
 * Discover sitemaps from robots.txt and common locations
 * 
 * @param {string} baseUrl - The base URL of the website
 * @returns {Promise<Object>} Discovered sitemaps
 */
export async function discoverSitemaps(baseUrl) {
  console.log('[Sitemap] Discovering sitemaps for:', baseUrl);
  
  const sitemaps = [];
  const robotsUrl = new URL('/robots.txt', baseUrl).toString();
  
  // First, try to get sitemaps from robots.txt
  try {
    const robotsResponse = await fetch(robotsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GhostPostBot/1.0)',
      },
      signal: AbortSignal.timeout(10000),
    });
    
    if (robotsResponse.ok) {
      const robotsTxt = await robotsResponse.text();
      const sitemapMatches = robotsTxt.matchAll(/Sitemap:\s*(.+)/gi);
      
      for (const match of sitemapMatches) {
        const sitemapUrl = match[1].trim();
        if (sitemapUrl && !sitemaps.includes(sitemapUrl)) {
          sitemaps.push(sitemapUrl);
          console.log('[Sitemap] Found in robots.txt:', sitemapUrl);
        }
      }
    }
  } catch (error) {
    console.log('[Sitemap] Could not fetch robots.txt:', error.message);
  }
  
  // If no sitemaps found in robots.txt, check common locations
  if (sitemaps.length === 0) {
    console.log('[Sitemap] No sitemaps in robots.txt, checking common locations...');
    
    for (const location of SITEMAP_LOCATIONS) {
      const sitemapUrl = new URL(location, baseUrl).toString();
      try {
        const response = await fetch(sitemapUrl, {
          method: 'HEAD',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; GhostPostBot/1.0)',
          },
          signal: AbortSignal.timeout(5000),
        });
        
        if (response.ok) {
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('xml') || contentType.includes('text')) {
            sitemaps.push(sitemapUrl);
            console.log('[Sitemap] Found at:', sitemapUrl);
          }
        }
      } catch {
        // Ignore failed attempts
      }
    }
  }
  
  return {
    found: sitemaps.length > 0,
    sitemaps,
    source: sitemaps.length > 0 ? 'discovered' : 'none',
  };
}

/**
 * Parse a sitemap and extract URLs
 * 
 * @param {string} sitemapUrl - The sitemap URL to parse
 * @param {Object} options - Parsing options
 * @param {number} options.maxUrls - Maximum URLs to extract (default: 100)
 * @param {boolean} options.followIndex - Whether to follow sitemap index files (default: true)
 * @returns {Promise<Object>} Parsed sitemap data
 */
export async function parseSitemap(sitemapUrl, options = {}) {
  const { maxUrls = 100, followIndex = true } = options;
  
  console.log('[Sitemap] Parsing:', sitemapUrl);
  
  try {
    const response = await fetch(sitemapUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GhostPostBot/1.0)',
        'Accept': 'application/xml, text/xml, */*',
      },
      signal: AbortSignal.timeout(15000),
    });
    
    if (!response.ok) {
      return {
        success: false,
        error: `Failed to fetch sitemap: ${response.status}`,
      };
    }
    
    const xml = await response.text();
    
    // Check if this is a sitemap index
    if (xml.includes('<sitemapindex') && followIndex) {
      return await parseSitemapIndex(xml, sitemapUrl, { maxUrls, followIndex });
    }
    
    // Parse regular sitemap
    return parseSitemapXml(xml, sitemapUrl, maxUrls);
  } catch (error) {
    console.error('[Sitemap] Parse error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Parse a sitemap index file
 */
async function parseSitemapIndex(xml, sourceUrl, options) {
  const sitemapUrls = [];
  const sitemapRegex = /<sitemap>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/sitemap>/gi;
  let match;
  
  while ((match = sitemapRegex.exec(xml)) !== null) {
    sitemapUrls.push(match[1].trim());
  }
  
  console.log(`[Sitemap] Found ${sitemapUrls.length} sitemaps in index`);
  
  const allUrls = [];
  const parsedSitemaps = [];
  
  // Parse each child sitemap (limit to first 5 to avoid too many requests)
  for (const childUrl of sitemapUrls.slice(0, 5)) {
    if (allUrls.length >= options.maxUrls) break;
    
    const childResult = await parseSitemap(childUrl, {
      maxUrls: options.maxUrls - allUrls.length,
      followIndex: false, // Don't follow nested indexes
    });
    
    if (childResult.success) {
      allUrls.push(...childResult.urls);
      parsedSitemaps.push({
        url: childUrl,
        urlCount: childResult.urls.length,
      });
    }
  }
  
  return {
    success: true,
    isIndex: true,
    sitemapCount: sitemapUrls.length,
    parsedSitemaps,
    urls: allUrls.slice(0, options.maxUrls),
    source: sourceUrl,
  };
}

/**
 * Parse a regular sitemap XML
 */
function parseSitemapXml(xml, sourceUrl, maxUrls) {
  const urls = [];
  const urlRegex = /<url>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?(?:<lastmod>([^<]*)<\/lastmod>)?[\s\S]*?(?:<changefreq>([^<]*)<\/changefreq>)?[\s\S]*?(?:<priority>([^<]*)<\/priority>)?[\s\S]*?<\/url>/gi;
  
  let match;
  while ((match = urlRegex.exec(xml)) !== null && urls.length < maxUrls) {
    urls.push({
      url: match[1].trim(),
      lastmod: match[2]?.trim() || null,
      changefreq: match[3]?.trim() || null,
      priority: match[4] ? parseFloat(match[4]) : null,
    });
  }
  
  // If the regex didn't work, try a simpler approach
  if (urls.length === 0) {
    const simpleLocRegex = /<loc>([^<]+)<\/loc>/gi;
    let simpleMatch;
    while ((simpleMatch = simpleLocRegex.exec(xml)) !== null && urls.length < maxUrls) {
      const urlStr = simpleMatch[1].trim();
      // Skip if it looks like a sitemap URL (likely from sitemap index we didn't detect)
      if (!urlStr.includes('sitemap')) {
        urls.push({
          url: urlStr,
          lastmod: null,
          changefreq: null,
          priority: null,
        });
      }
    }
  }
  
  console.log(`[Sitemap] Parsed ${urls.length} URLs from sitemap`);
  
  return {
    success: true,
    isIndex: false,
    urls,
    source: sourceUrl,
  };
}

/**
 * Categorize URLs from sitemap by type
 * 
 * @param {Array} urls - Array of URL objects from parseSitemap
 * @returns {Object} Categorized URLs
 */
export function categorizeUrls(urls) {
  const categories = {
    pages: [],
    posts: [],
    products: [],
    categories: [],
    tags: [],
    other: [],
  };
  
  for (const urlObj of urls) {
    const url = urlObj.url.toLowerCase();
    
    if (url.includes('/blog/') || url.includes('/post/') || url.includes('/article/') || url.includes('/news/')) {
      categories.posts.push(urlObj);
    } else if (url.includes('/product/') || url.includes('/shop/') || url.includes('/item/')) {
      categories.products.push(urlObj);
    } else if (url.includes('/category/') || url.includes('/categor')) {
      categories.categories.push(urlObj);
    } else if (url.includes('/tag/') || url.includes('/tags/')) {
      categories.tags.push(urlObj);
    } else if (url.includes('/about') || url.includes('/contact') || url.includes('/service') || url.includes('/team')) {
      categories.pages.push(urlObj);
    } else {
      categories.other.push(urlObj);
    }
  }
  
  return categories;
}
