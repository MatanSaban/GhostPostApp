/**
 * Competitor Scraper Service
 * 
 * Scrapes competitor pages to extract SEO-relevant metrics.
 * Uses Cheerio for HTML parsing (no JS rendering for MVP).
 * 
 * Metrics extracted:
 * - Word count
 * - Header structure (H1, H2, H3 counts)
 * - Media counts (images, videos)
 * - Link counts (internal, external)
 * - TTFB (Time to First Byte)
 * - Title, meta description
 * - Main content text (for AI analysis)
 */

import * as cheerio from 'cheerio';

/**
 * Extract domain from URL
 */
export function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Get favicon URL for a domain
 */
export function getFaviconUrl(domain) {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

/**
 * Scrape a competitor page and extract metrics
 * 
 * @param {string} url - The URL to scrape
 * @returns {Promise<Object>} Scraped data
 */
export async function scrapeCompetitorPage(url) {
  const startTime = Date.now();
  
  try {
    // Fetch the page with timing
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,he;q=0.8',
      },
    });
    
    clearTimeout(timeoutId);
    
    // Calculate TTFB (approximation - time until headers received)
    const ttfb = Date.now() - startTime;
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // Remove script, style, and hidden elements
    $('script, style, noscript, iframe, [style*="display:none"], [style*="display: none"], .hidden').remove();
    
    // Extract title
    const title = $('title').first().text().trim() || 
                  $('meta[property="og:title"]').attr('content')?.trim() || 
                  $('h1').first().text().trim();
    
    // Extract meta description
    const metaDescription = $('meta[name="description"]').attr('content')?.trim() ||
                           $('meta[property="og:description"]').attr('content')?.trim() || '';
    
    // Extract headings with their text
    const headings = [];
    $('h1, h2, h3, h4, h5, h6').each((i, el) => {
      const tag = el.tagName.toLowerCase();
      const text = $(el).text().trim();
      if (text) {
        headings.push({ tag, text });
      }
    });
    
    // Count headers by type
    const h1Count = headings.filter(h => h.tag === 'h1').length;
    const h2Count = headings.filter(h => h.tag === 'h2').length;
    const h3Count = headings.filter(h => h.tag === 'h3').length;
    
    // Extract main content
    // Try common content selectors first
    let mainContent = '';
    const contentSelectors = [
      'article',
      '[role="main"]',
      'main',
      '.post-content',
      '.entry-content',
      '.article-content',
      '.content',
      '#content',
      '.post',
      '.article',
    ];
    
    for (const selector of contentSelectors) {
      const element = $(selector).first();
      if (element.length) {
        mainContent = element.text().trim();
        break;
      }
    }
    
    // Fallback to body if no content container found
    if (!mainContent) {
      // Remove header, footer, nav, sidebar
      $('header, footer, nav, aside, .sidebar, .navigation, .menu, .comments').remove();
      mainContent = $('body').text().trim();
    }
    
    // Clean up content - normalize whitespace
    mainContent = mainContent
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, '\n')
      .trim();
    
    // Word count
    const wordCount = mainContent.split(/\s+/).filter(word => word.length > 0).length;
    
    // Count images
    const imageCount = $('img').length;
    
    // Count videos (various sources)
    const videoCount = $('video, iframe[src*="youtube"], iframe[src*="vimeo"], iframe[src*="wistia"], .video-embed').length;
    
    // Count links
    const domain = extractDomain(url);
    let internalLinks = 0;
    let externalLinks = 0;
    
    $('a[href]').each((i, el) => {
      const href = $(el).attr('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        return;
      }
      
      try {
        const linkUrl = new URL(href, url);
        const linkDomain = extractDomain(linkUrl.href);
        
        if (linkDomain === domain) {
          internalLinks++;
        } else {
          externalLinks++;
        }
      } catch {
        // Relative link - internal
        internalLinks++;
      }
    });
    
    return {
      success: true,
      data: {
        url,
        domain,
        favicon: getFaviconUrl(domain),
        title,
        metaDescription,
        headings,
        h1Count,
        h2Count,
        h3Count,
        imageCount,
        videoCount,
        internalLinks,
        externalLinks,
        wordCount,
        ttfb,
        mainContent: mainContent.slice(0, 50000), // Limit content for AI (tokens)
        scannedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error(`[CompetitorScraper] Error scraping ${url}:`, error.message);
    return {
      success: false,
      error: error.message,
      data: {
        url,
        domain: extractDomain(url),
        favicon: getFaviconUrl(extractDomain(url)),
      },
    };
  }
}

/**
 * Scrape user's own page for comparison
 * Same as competitor scrape but for the user's content
 */
export async function scrapeUserPage(url) {
  return scrapeCompetitorPage(url);
}

/**
 * Compare two scraped pages and generate metrics
 * 
 * @param {Object} userPage - Scraped user page data
 * @param {Object} competitorPage - Scraped competitor page data
 * @returns {Object} Comparison metrics
 */
export function comparePages(userPage, competitorPage) {
  const metrics = {
    wordCount: {
      user: userPage.wordCount || 0,
      competitor: competitorPage.wordCount || 0,
      diff: (userPage.wordCount || 0) - (competitorPage.wordCount || 0),
      winner: (userPage.wordCount || 0) >= (competitorPage.wordCount || 0) ? 'user' : 'competitor',
    },
    h1Count: {
      user: userPage.h1Count || 0,
      competitor: competitorPage.h1Count || 0,
      diff: (userPage.h1Count || 0) - (competitorPage.h1Count || 0),
      // For H1, 1 is ideal
      winner: userPage.h1Count === 1 ? 'user' : (competitorPage.h1Count === 1 ? 'competitor' : 'tie'),
    },
    h2Count: {
      user: userPage.h2Count || 0,
      competitor: competitorPage.h2Count || 0,
      diff: (userPage.h2Count || 0) - (competitorPage.h2Count || 0),
      winner: (userPage.h2Count || 0) >= (competitorPage.h2Count || 0) ? 'user' : 'competitor',
    },
    h3Count: {
      user: userPage.h3Count || 0,
      competitor: competitorPage.h3Count || 0,
      diff: (userPage.h3Count || 0) - (competitorPage.h3Count || 0),
      winner: (userPage.h3Count || 0) >= (competitorPage.h3Count || 0) ? 'user' : 'competitor',
    },
    imageCount: {
      user: userPage.imageCount || 0,
      competitor: competitorPage.imageCount || 0,
      diff: (userPage.imageCount || 0) - (competitorPage.imageCount || 0),
      winner: (userPage.imageCount || 0) >= (competitorPage.imageCount || 0) ? 'user' : 'competitor',
    },
    videoCount: {
      user: userPage.videoCount || 0,
      competitor: competitorPage.videoCount || 0,
      diff: (userPage.videoCount || 0) - (competitorPage.videoCount || 0),
      winner: (userPage.videoCount || 0) >= (competitorPage.videoCount || 0) ? 'user' : 'competitor',
    },
    ttfb: {
      user: userPage.ttfb || 0,
      competitor: competitorPage.ttfb || 0,
      diff: (competitorPage.ttfb || 0) - (userPage.ttfb || 0), // Reverse - lower is better
      winner: (userPage.ttfb || Infinity) <= (competitorPage.ttfb || Infinity) ? 'user' : 'competitor',
    },
  };
  
  // Calculate overall score
  let userWins = 0;
  let competitorWins = 0;
  
  Object.values(metrics).forEach(m => {
    if (m.winner === 'user') userWins++;
    else if (m.winner === 'competitor') competitorWins++;
  });
  
  metrics.overall = {
    userWins,
    competitorWins,
    winner: userWins > competitorWins ? 'user' : (competitorWins > userWins ? 'competitor' : 'tie'),
  };
  
  return metrics;
}

export default {
  scrapeCompetitorPage,
  scrapeUserPage,
  comparePages,
  extractDomain,
  getFaviconUrl,
};
