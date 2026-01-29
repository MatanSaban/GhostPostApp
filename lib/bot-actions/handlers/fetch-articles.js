/**
 * Fetch Articles Handler
 * 
 * Fetches a list of articles/blog posts from the website.
 * Uses the sitemap data from the initial crawl, then fetches titles for each article.
 */

/**
 * Fetch article title from URL
 */
async function fetchArticleTitle(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GhostPostBot/1.0; +https://ghostpost.io)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000)
    });
    
    if (!response.ok) return null;
    
    const html = await response.text();
    
    // Try to extract title from various sources
    // 1. og:title
    const ogMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    if (ogMatch) return ogMatch[1].trim();
    
    // 2. <title> tag
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      // Remove site name from title (usually after | or -)
      let title = titleMatch[1].trim();
      const separators = [' | ', ' - ', ' – ', ' — '];
      for (const sep of separators) {
        if (title.includes(sep)) {
          title = title.split(sep)[0].trim();
          break;
        }
      }
      return title;
    }
    
    // 3. h1 tag
    const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (h1Match) return h1Match[1].trim();
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Extract slug from URL for display
 */
function extractSlugFromUrl(url) {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    const lastPart = pathParts[pathParts.length - 1];
    // Convert slug to readable title
    return lastPart
      .replace(/-/g, ' ')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  } catch {
    return 'Untitled Article';
  }
}

export async function fetchArticles(params, context) {
  const { limit = 20 } = params;
  
  console.log('[FetchArticles] Starting article fetch...');
  
  // Get articles from the crawled sitemap data
  const crawledData = context.interview?.externalData?.crawledData || {};
  const rawCrawlResult = context.interview?.externalData?._rawCrawlResult || {};
  
  // Get posts from sitemap categories
  const sitemapCategories = rawCrawlResult.sitemap?.categories || crawledData.sitemapCategories || {};
  const posts = sitemapCategories.posts || [];
  
  console.log(`[FetchArticles] Found ${posts.length} posts in sitemap`);
  
  if (posts.length === 0) {
    console.log('[FetchArticles] No posts found in sitemap');
    return {
      success: true,
      articles: [],
      total: 0,
      message: 'No blog posts found in sitemap'
    };
  }
  
  // Limit to requested number
  const postsToProcess = posts.slice(0, limit);
  
  // Fetch titles for each article (in parallel with limit)
  const articles = [];
  const batchSize = 5; // Fetch 5 at a time to avoid rate limiting
  
  for (let i = 0; i < postsToProcess.length; i += batchSize) {
    const batch = postsToProcess.slice(i, i + batchSize);
    
    const batchResults = await Promise.all(
      batch.map(async (post) => {
        const url = post.url;
        const title = await fetchArticleTitle(url);
        
        return {
          url,
          title: title || extractSlugFromUrl(url),
          lastmod: post.lastmod || null,
          excerpt: null,
          image: null
        };
      })
    );
    
    articles.push(...batchResults);
    console.log(`[FetchArticles] Fetched ${articles.length}/${postsToProcess.length} article titles`);
  }
  
  // Store in interview external data
  if (context.interview && context.prisma && articles.length > 0) {
    try {
      const existingData = context.interview.externalData || {};
      await context.prisma.userInterview.update({
        where: { id: context.interview.id },
        data: {
          externalData: {
            ...existingData,
            articles: articles
          }
        }
      });
      console.log(`[FetchArticles] Saved ${articles.length} articles to interview`);
    } catch (error) {
      console.error('[FetchArticles] Error saving articles:', error);
    }
  }
  
  return {
    success: true,
    articles,
    total: articles.length,
    totalInSitemap: posts.length
  };
}
