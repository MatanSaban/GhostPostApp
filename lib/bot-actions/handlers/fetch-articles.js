/**
 * Fetch Articles Handler
 * 
 * Fetches a list of articles/blog posts from the website.
 * Tries multiple methods in order:
 * 1. WordPress plugin API (if connected)
 * 2. WordPress public REST API (if WordPress)
 * 3. Sitemap data from initial crawl
 * 4. Crawl blog/news page for links
 */

import prisma from '@/lib/prisma';
import { getPosts } from '@/lib/wp-api-client';

/**
 * Fetch article title and metadata from URL
 */
async function fetchArticleData(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GhostPostBot/1.0; +https://ghostpost.co.il)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000)
    });
    
    if (!response.ok) return null;
    
    const html = await response.text();
    
    // Extract title
    let title = null;
    
    // 1. og:title
    const ogMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    if (ogMatch) title = ogMatch[1].trim();
    
    // 2. <title> tag
    if (!title) {
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) {
        title = titleMatch[1].trim();
        const separators = [' | ', ' - ', ' – ', ' — '];
        for (const sep of separators) {
          if (title.includes(sep)) {
            title = title.split(sep)[0].trim();
            break;
          }
        }
      }
    }
    
    // 3. h1 tag
    if (!title) {
      const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      if (h1Match) title = h1Match[1].trim();
    }
    
    // Extract featured image
    let image = null;
    const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
    if (ogImageMatch) image = ogImageMatch[1].trim();
    
    // Extract excerpt/description
    let excerpt = null;
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    if (descMatch) excerpt = descMatch[1].trim();
    
    return { title, image, excerpt };
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
    return lastPart
      .replace(/-/g, ' ')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  } catch {
    return 'Untitled Article';
  }
}

/**
 * Try to fetch articles via WordPress Plugin API
 */
async function fetchFromWordPressPlugin(site, limit) {
  console.log('[FetchArticles] Trying WordPress plugin API...');
  
  try {
    const result = await getPosts(site, 'post', 1, limit, false);
    const posts = Array.isArray(result) ? result : (result.posts || result.data || []);
    
    if (posts.length > 0) {
      console.log(`[FetchArticles] Got ${posts.length} posts from plugin`);
      return posts.map(post => ({
        url: post.link || post.url,
        title: typeof post.title === 'object' ? post.title.rendered : post.title,
        excerpt: typeof post.excerpt === 'object' ? 
          post.excerpt.rendered?.replace(/<[^>]+>/g, '').trim().substring(0, 200) : 
          post.excerpt?.substring(0, 200),
        image: post.featured_image || post.featuredImage || null,
        date: post.date || null,
        id: post.id
      }));
    }
  } catch (error) {
    console.log('[FetchArticles] Plugin API failed:', error.message);
  }
  
  return null;
}

/**
 * Try to fetch articles via WordPress public REST API
 */
async function fetchFromWordPressRestApi(websiteUrl, limit) {
  console.log('[FetchArticles] Trying WordPress REST API...');
  
  const baseUrl = websiteUrl.replace(/\/$/, '');
  
  try {
    const response = await fetch(
      `${baseUrl}/wp-json/wp/v2/posts?per_page=${limit}&_fields=id,title,link,excerpt,date,featured_media,_links`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; GhostPostBot/1.0)',
        },
        signal: AbortSignal.timeout(10000),
      }
    );
    
    if (!response.ok) {
      console.log(`[FetchArticles] REST API returned ${response.status}`);
      return null;
    }
    
    const posts = await response.json();
    
    if (posts.length > 0) {
      console.log(`[FetchArticles] Got ${posts.length} posts from REST API`);
      
      // Fetch featured images for posts that have them
      const articlesWithImages = await Promise.all(
        posts.map(async (post) => {
          let image = null;
          
          if (post.featured_media && post.featured_media > 0) {
            try {
              const mediaRes = await fetch(
                `${baseUrl}/wp-json/wp/v2/media/${post.featured_media}?_fields=source_url`,
                { signal: AbortSignal.timeout(5000) }
              );
              if (mediaRes.ok) {
                const mediaData = await mediaRes.json();
                image = mediaData.source_url;
              }
            } catch {
              // Ignore media fetch errors
            }
          }
          
          return {
            url: post.link,
            title: post.title?.rendered?.replace(/<[^>]+>/g, '').trim() || extractSlugFromUrl(post.link),
            excerpt: post.excerpt?.rendered?.replace(/<[^>]+>/g, '').trim().substring(0, 200) || null,
            image,
            date: post.date,
            id: post.id
          };
        })
      );
      
      return articlesWithImages;
    }
  } catch (error) {
    console.log('[FetchArticles] REST API failed:', error.message);
  }
  
  return null;
}

/**
 * Try to fetch articles from sitemap data
 */
async function fetchFromSitemap(crawledData, rawCrawlResult, limit) {
  console.log('[FetchArticles] Trying sitemap data...');
  
  const sitemapCategories = rawCrawlResult.sitemap?.categories || crawledData.sitemapCategories || {};
  const posts = sitemapCategories.posts || [];
  
  if (posts.length === 0) {
    console.log('[FetchArticles] No posts in sitemap');
    return null;
  }
  
  console.log(`[FetchArticles] Found ${posts.length} posts in sitemap`);
  
  const postsToProcess = posts.slice(0, limit);
  const articles = [];
  const batchSize = 5;
  
  for (let i = 0; i < postsToProcess.length; i += batchSize) {
    const batch = postsToProcess.slice(i, i + batchSize);
    
    const batchResults = await Promise.all(
      batch.map(async (post) => {
        const data = await fetchArticleData(post.url);
        return {
          url: post.url,
          title: data?.title || extractSlugFromUrl(post.url),
          excerpt: data?.excerpt || null,
          image: data?.image || null,
          date: post.lastmod || null,
        };
      })
    );
    
    articles.push(...batchResults);
  }
  
  return articles.length > 0 ? articles : null;
}

/**
 * Try to find and crawl the blog page for article links
 */
async function fetchFromBlogPage(websiteUrl, limit) {
  console.log('[FetchArticles] Trying to crawl blog page...');
  
  const baseUrl = websiteUrl.replace(/\/$/, '');
  const blogPaths = ['/blog', '/news', '/articles', '/posts', '/מאמרים', '/בלוג'];
  
  for (const path of blogPaths) {
    try {
      const blogUrl = baseUrl + path;
      console.log(`[FetchArticles] Trying ${blogUrl}`);
      
      const response = await fetch(blogUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; GhostPostBot/1.0)',
          'Accept': 'text/html',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
      });
      
      if (!response.ok) continue;
      
      const html = await response.text();
      
      // Look for article links - common patterns
      const articleLinks = new Set();
      
      // Pattern 1: Links in article/post containers
      const linkPatterns = [
        /<a[^>]+href=["']([^"']+)['"]/gi,
      ];
      
      for (const pattern of linkPatterns) {
        let match;
        while ((match = pattern.exec(html)) !== null && articleLinks.size < limit * 2) {
          const href = match[1];
          
          // Skip non-article links
          if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;
          if (href.includes('/tag/') || href.includes('/category/') || href.includes('/author/')) continue;
          if (href.includes('/page/') || href.includes('?page=')) continue;
          if (href.endsWith('.jpg') || href.endsWith('.png') || href.endsWith('.pdf')) continue;
          
          // Build full URL
          let fullUrl;
          if (href.startsWith('http')) {
            fullUrl = href;
          } else if (href.startsWith('/')) {
            fullUrl = baseUrl + href;
          } else {
            fullUrl = blogUrl + '/' + href;
          }
          
          // Check if it looks like an article URL (has path depth)
          const urlPath = new URL(fullUrl).pathname;
          const pathParts = urlPath.split('/').filter(Boolean);
          if (pathParts.length >= 1 && !pathParts.includes('blog') && !pathParts.includes('news')) {
            // Looks like a potential article
            articleLinks.add(fullUrl);
          } else if (pathParts.length >= 2) {
            articleLinks.add(fullUrl);
          }
        }
      }
      
      if (articleLinks.size > 0) {
        console.log(`[FetchArticles] Found ${articleLinks.size} potential article links`);
        
        // Fetch data for each article
        const links = Array.from(articleLinks).slice(0, limit);
        const articles = [];
        const batchSize = 3;
        
        for (let i = 0; i < links.length; i += batchSize) {
          const batch = links.slice(i, i + batchSize);
          
          const batchResults = await Promise.all(
            batch.map(async (url) => {
              const data = await fetchArticleData(url);
              // Only include if we got a title (indicates it's a real article page)
              if (data?.title) {
                return {
                  url,
                  title: data.title,
                  excerpt: data.excerpt || null,
                  image: data.image || null,
                  date: null,
                };
              }
              return null;
            })
          );
          
          articles.push(...batchResults.filter(Boolean));
        }
        
        if (articles.length > 0) {
          console.log(`[FetchArticles] Got ${articles.length} valid articles from blog page`);
          return articles;
        }
      }
    } catch (error) {
      console.log(`[FetchArticles] Failed to crawl ${path}:`, error.message);
    }
  }
  
  return null;
}

export async function fetchArticles(params, context) {
  const { limit = 20 } = params;
  
  console.log('[FetchArticles] Starting article fetch...');
  
  // Get website URL
  const websiteUrl = context.interview?.responses?.websiteUrl || 
                     context.interview?.externalData?.crawledData?.url;
  
  if (!websiteUrl) {
    console.log('[FetchArticles] No website URL available');
    return {
      success: true,
      articles: [],
      total: 0,
      message: 'No website URL available'
    };
  }
  
  // Check platform from interview responses or crawled data
  const platform = context.interview?.responses?.websitePlatform || 
                   context.interview?.externalData?.platformData?.platform ||
                   context.interview?.externalData?.crawledData?.platform;
  
  console.log(`[FetchArticles] Platform: ${platform || 'unknown'}, URL: ${websiteUrl}`);
  
  let articles = null;
  let source = 'unknown';
  
  // Strategy 1: If WordPress, try plugin API first
  if (platform === 'wordpress' && context.siteId) {
    try {
      // Get site with connection details
      const site = await prisma.site.findUnique({
        where: { id: context.siteId },
        select: {
          id: true,
          url: true,
          platform: true,
          connectionStatus: true,
          siteKey: true,
          siteSecret: true,
        }
      });
      
      if (site?.connectionStatus === 'CONNECTED' && site.siteKey && site.siteSecret) {
        articles = await fetchFromWordPressPlugin(site, limit);
        if (articles) source = 'wordpress-plugin';
      }
    } catch (error) {
      console.log('[FetchArticles] Error fetching site:', error.message);
    }
  }
  
  // Strategy 2: If WordPress (or might be), try public REST API
  if (!articles && (platform === 'wordpress' || !platform)) {
    articles = await fetchFromWordPressRestApi(websiteUrl, limit);
    if (articles) source = 'wordpress-rest-api';
  }
  
  // Strategy 3: Try sitemap data from crawl
  if (!articles) {
    const crawledData = context.interview?.externalData?.crawledData || {};
    const rawCrawlResult = context.interview?.externalData?._rawCrawlResult || {};
    articles = await fetchFromSitemap(crawledData, rawCrawlResult, limit);
    if (articles) source = 'sitemap';
  }
  
  // Strategy 4: Crawl blog page as last resort
  if (!articles) {
    articles = await fetchFromBlogPage(websiteUrl, limit);
    if (articles) source = 'blog-crawl';
  }
  
  // No articles found from any source
  if (!articles || articles.length === 0) {
    console.log('[FetchArticles] No articles found from any source');
    return {
      success: true,
      articles: [],
      total: 0,
      message: 'No blog posts found on this website'
    };
  }
  
  console.log(`[FetchArticles] Successfully fetched ${articles.length} articles from ${source}`);
  
  // Store in interview external data
  if (context.interview && context.prisma && articles.length > 0) {
    try {
      const existingData = context.interview.externalData || {};
      await context.prisma.userInterview.update({
        where: { id: context.interview.id },
        data: {
          externalData: {
            ...existingData,
            articles: articles,
            articlesSource: source
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
    source
  };
}