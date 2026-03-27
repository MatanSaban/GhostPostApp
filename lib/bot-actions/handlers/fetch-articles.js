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
import { discoverSitemaps, parseSitemap } from '@/lib/interview/functions/sitemap-parser.js';
import { generateTextResponse } from '@/lib/ai/gemini.js';

/**
 * Helper to strip HTML tags from a string
 */
function stripHtml(str) {
  return str.replace(/<[^>]*>/g, '').trim();
}

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
    
    // Extract title - try multiple methods
    let title = null;
    
    // 1. og:title (most reliable for articles)
    const ogMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    if (ogMatch) title = ogMatch[1].trim();
    
    // 1b. Also try content before property (some sites have different attribute order)
    if (!title) {
      const ogMatchAlt = html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
      if (ogMatchAlt) title = ogMatchAlt[1].trim();
    }
    
    // 2. h1 tag (extract inner text, handling nested elements)
    if (!title) {
      const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      if (h1Match) {
        title = stripHtml(h1Match[1]).trim();
      }
    }
    
    // 3. <title> tag (fallback, clean up site name suffix)
    if (!title) {
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (titleMatch) {
        title = stripHtml(titleMatch[1]).trim();
        const separators = [' | ', ' - ', ' – ', ' - ', ' :: ', ' » '];
        for (const sep of separators) {
          if (title.includes(sep)) {
            title = title.split(sep)[0].trim();
            break;
          }
        }
      }
    }
    
    // 4. Try article:title meta tag
    if (!title) {
      const articleTitleMatch = html.match(/<meta[^>]*property=["']article:title["'][^>]*content=["']([^"']+)["']/i);
      if (articleTitleMatch) title = articleTitleMatch[1].trim();
    }
    
    // Extract featured image
    let image = null;
    const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
    if (ogImageMatch) image = ogImageMatch[1].trim();
    // Also try content before property
    if (!image) {
      const ogImageMatchAlt = html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
      if (ogImageMatchAlt) image = ogImageMatchAlt[1].trim();
    }
    
    // Extract excerpt/description - try multiple sources
    let excerpt = null;
    
    // 1. og:description
    const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
    if (ogDescMatch) excerpt = ogDescMatch[1].trim();
    
    // 2. meta description
    if (!excerpt) {
      const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
      if (descMatch) excerpt = descMatch[1].trim();
    }
    
    // 3. Try first paragraph in article/main content
    if (!excerpt) {
      // Look for article content area
      const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
                           html.match(/<main[^>]*>([\s\S]*?)<\/main>/i) ||
                           html.match(/<div[^>]*class=["'][^"']*(?:content|post|entry|article)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
      if (articleMatch) {
        const pMatch = articleMatch[1].match(/<p[^>]*>([\s\S]*?)<\/p>/i);
        if (pMatch) {
          const pText = stripHtml(pMatch[1]).trim();
          if (pText.length > 30 && pText.length < 500) {
            excerpt = pText.substring(0, 200);
            if (excerpt.length < pText.length) excerpt += '...';
          }
        }
      }
    }
    
    return { title, image, excerpt, html };
  } catch (err) {
    console.log('[FetchArticles] Error fetching article data:', err.message);
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
    let lastPart = pathParts[pathParts.length - 1];
    // Decode percent-encoded characters (e.g., Hebrew URLs)
    try { lastPart = decodeURIComponent(lastPart); } catch { /* keep as-is */ }
    return lastPart
      .replace(/-/g, ' ')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  } catch {
    return 'Untitled Article';
  }
}

/**
 * Generate article title using AI from URL slug
 * Used as fallback when HTML title extraction fails
 */
async function generateTitleWithAI(url) {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    let slug = pathParts[pathParts.length - 1];
    // Decode percent-encoded characters (e.g., Hebrew URLs)
    try { slug = decodeURIComponent(slug); } catch { /* keep as-is */ }
    
    // If slug is too short or looks like a number/ID, skip AI
    if (!slug || slug.length < 3 || /^\d+$/.test(slug)) {
      return extractSlugFromUrl(url);
    }

    const prompt = `Convert this URL slug into a proper article title. The slug is: "${slug}"

Rules:
- Return ONLY the title, nothing else
- Make it readable and properly capitalized
- Keep it concise (max 10 words)
- If the slug is in Hebrew, return a Hebrew title
- If the slug is in English, return an English title
- Do not add extra words or descriptions not implied by the slug

Your answer (just the title):`;

    const response = await generateTextResponse({
      system: 'You are a text formatter. Convert URL slugs to readable titles. Be concise and accurate.',
      prompt,
      maxTokens: 100,
      temperature: 0.1,
      operation: 'FETCH_ARTICLES',
      metadata: { stage: 'ai-title-generation' },
    });

    const title = response.trim().replace(/^["']|["']$/g, '');
    
    if (title && title.length > 0 && title.length < 200) {
      return title;
    }
    
    return extractSlugFromUrl(url);
  } catch (error) {
    console.log('[FetchArticles] AI title generation failed:', error.message);
    return extractSlugFromUrl(url);
  }
}

/**
 * Generate article excerpt using AI from HTML content
 * Used as fallback when HTML excerpt extraction fails
 */
async function generateExcerptWithAI(url, html) {
  try {
    // Extract main text content from HTML for AI analysis
    let textContent = '';
    
    // Try to get content from article or main tag first
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    const contentDiv = html.match(/<div[^>]*class="[^"]*(?:content|post|entry|article)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    
    const contentHtml = articleMatch?.[1] || mainMatch?.[1] || contentDiv?.[1] || html;
    
    // Extract all paragraphs
    const paragraphs = [];
    const pMatches = contentHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi);
    for (const match of pMatches) {
      const text = stripHtml(match[1]).trim();
      if (text && text.length > 50 && !text.includes('©') && !text.includes('All rights')) {
        paragraphs.push(text);
      }
    }
    
    textContent = paragraphs.slice(0, 5).join('\n\n');
    
    if (!textContent || textContent.length < 100) {
      console.log('[FetchArticles] Not enough content for AI excerpt generation');
      return null;
    }

    const prompt = `Based on this article content, write a brief excerpt (1-2 sentences, max 150 characters):

Content:
${textContent.slice(0, 1500)}

Rules:
- Write a catchy, informative summary
- Keep it concise - max 150 characters
- Match the language of the content (Hebrew/English)
- Do not include quotes around your answer

Your excerpt:`;

    const response = await generateTextResponse({
      system: 'You are a content summarizer. Write brief, engaging article excerpts.',
      prompt,
      maxTokens: 100,
      temperature: 0.3,
      operation: 'FETCH_ARTICLES',
      metadata: { stage: 'ai-excerpt-generation' },
    });

    const excerpt = response.trim().replace(/^["']|["']$/g, '');
    
    if (excerpt && excerpt.length > 20 && excerpt.length < 300) {
      return excerpt;
    }
    
    return null;
  } catch (error) {
    console.log('[FetchArticles] AI excerpt generation failed:', error.message);
    return null;
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
      // Use Promise.all to handle async AI title generation
      return await Promise.all(posts.map(async (post) => {
        const wpTitle = typeof post.title === 'object' ? post.title.rendered : post.title;
        const url = post.link || post.url;
        // Use AI to generate title if not available from WP Plugin
        const title = wpTitle || await generateTitleWithAI(url);
        return {
          url,
          title,
          excerpt: typeof post.excerpt === 'object' ? 
            post.excerpt.rendered?.replace(/<[^>]+>/g, '').trim().substring(0, 200) : 
            post.excerpt?.substring(0, 200),
          image: post.featured_image || post.featuredImage || null,
          date: post.date || null,
          id: post.id
        };
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
          
          // Use AI to generate title if not available from WP API
          const wpTitle = post.title?.rendered?.replace(/<[^>]+>/g, '').trim();
          const title = wpTitle || await generateTitleWithAI(post.link);
          
          return {
            url: post.link,
            title,
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
        // Use AI to generate title if HTML extraction failed
        const title = data?.title || await generateTitleWithAI(post.url);
        // Use AI to generate excerpt if HTML extraction failed
        const excerpt = data?.excerpt || (data?.html ? await generateExcerptWithAI(post.url, data.html) : null);
        return {
          url: post.url,
          title,
          excerpt,
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
 * Try to discover the blog page URL from sitemap URLs
 * Scans all sitemap URLs for common blog landing page patterns
 */
async function discoverBlogFromSitemap(websiteUrl, limit) {
  console.log('[FetchArticles] Trying smart blog discovery from sitemap...');
  
  try {
    // Discover sitemaps
    const sitemapResult = await discoverSitemaps(websiteUrl);
    if (!sitemapResult.found || sitemapResult.sitemaps.length === 0) {
      console.log('[FetchArticles] No sitemaps found for blog discovery');
      return null;
    }
    
    // Parse all sitemaps to get URLs
    const allUrls = [];
    for (const sitemapUrl of sitemapResult.sitemaps.slice(0, 3)) {
      const parsed = await parseSitemap(sitemapUrl, { maxUrls: 500 });
      if (parsed.success && parsed.urls) {
        allUrls.push(...parsed.urls);
      }
    }
    
    if (allUrls.length === 0) {
      console.log('[FetchArticles] No URLs in sitemaps');
      return null;
    }
    
    console.log(`[FetchArticles] Found ${allUrls.length} total sitemap URLs, scanning for blog pages...`);
    
    // Common blog landing page patterns (the page itself, not articles under it)
    const blogPagePatterns = [
      /^\/blog\/?$/i,
      /^\/news\/?$/i,
      /^\/articles\/?$/i,
      /^\/posts\/?$/i,
      /^\/magazine\/?$/i,
      /^\/journal\/?$/i,
      /^\/insights\/?$/i,
      /^\/resources\/?$/i,
      /^\/stories\/?$/i,
      /^\/בלוג\/?$/i,
      /^\/מאמרים\/?$/i,
      /^\/חדשות\/?$/i,
      /^\/blog\/?\?/i,
    ];
    
    const baseUrl = websiteUrl.replace(/\/$/, '');
    
    // Look for blog page URLs in sitemap
    for (const urlObj of allUrls) {
      try {
        const urlPath = new URL(urlObj.url).pathname;
        for (const pattern of blogPagePatterns) {
          if (pattern.test(urlPath)) {
            console.log(`[FetchArticles] Found blog page in sitemap: ${urlObj.url}`);
            // Found what looks like a blog landing page, crawl it
            const articles = await crawlSpecificBlogPage(urlObj.url, baseUrl, limit);
            if (articles && articles.length > 0) {
              return articles;
            }
          }
        }
      } catch {
        // Skip invalid URLs
      }
    }
    
    // Also check for URLs with blog-like child paths (indicates a blog section exists)
    const blogSections = new Map();
    for (const urlObj of allUrls) {
      try {
        const urlPath = new URL(urlObj.url).pathname;
        const segments = urlPath.split('/').filter(Boolean);
        if (segments.length >= 2) {
          const firstSegment = '/' + segments[0];
          const blogSegments = ['/blog', '/news', '/articles', '/posts', '/magazine', '/journal', '/insights', '/בלוג', '/מאמרים', '/חדשות'];
          if (blogSegments.includes(firstSegment.toLowerCase())) {
            blogSections.set(firstSegment, (blogSections.get(firstSegment) || 0) + 1);
          }
        }
      } catch {
        // Skip
      }
    }
    
    // If we found blog-like sections, try crawling the section root
    if (blogSections.size > 0) {
      // Sort by count (most URLs first = most likely the blog)
      const sortedSections = [...blogSections.entries()].sort((a, b) => b[1] - a[1]);
      for (const [section] of sortedSections) {
        const blogPageUrl = baseUrl + section;
        console.log(`[FetchArticles] Found blog section ${section} with ${blogSections.get(section)} URLs, trying: ${blogPageUrl}`);
        const articles = await crawlSpecificBlogPage(blogPageUrl, baseUrl, limit);
        if (articles && articles.length > 0) {
          return articles;
        }
      }
    }
    
    // Return allUrls for AI analysis if pattern matching failed
    return { _sitemapUrls: allUrls };
    
  } catch (error) {
    console.log('[FetchArticles] Blog discovery from sitemap error:', error.message);
    return null;
  }
}

/**
 * Use AI to identify the blog page from sitemap URLs
 * Strict instruction: DO NOT hallucinate - only return a URL if confident
 */
async function identifyBlogWithAI(sitemapUrls, websiteUrl, limit) {
  console.log('[FetchArticles] Asking AI to identify blog page from sitemap...');
  
  try {
    // Take a sample of URLs (limit to 100 to avoid too many tokens)
    const sampleUrls = sitemapUrls
      .slice(0, 100)
      .map(u => u.url)
      .join('\n');
    
    const prompt = `Here is a list of URLs from the sitemap of ${websiteUrl}:

${sampleUrls}

Based on these URLs, identify which URL is the main blog/news/articles landing page of this website.

IMPORTANT RULES:
- Only return a URL that actually appears in the list above
- If no URL looks like a blog/news landing page, return NONE
- Do NOT make up or guess URLs
- Do NOT return individual article URLs, only the main blog listing page
- Return ONLY the URL, nothing else

Your answer (just the URL or NONE):`;

    const response = await generateTextResponse({
      system: 'You are a web analyst. You identify blog pages from sitemaps. Never hallucinate or make up URLs. If unsure, return NONE.',
      prompt,
      maxTokens: 200,
      temperature: 0.1,
      operation: 'FETCH_ARTICLES',
      metadata: { stage: 'ai-blog-identification' },
    });
    
    const cleanedResponse = response.trim().replace(/["`']/g, '');
    
    if (!cleanedResponse || cleanedResponse.toUpperCase() === 'NONE' || cleanedResponse.length < 10) {
      console.log('[FetchArticles] AI did not find a blog page');
      return null;
    }
    
    // Validate the URL exists in our sitemap list
    const urlExists = sitemapUrls.some(u => u.url === cleanedResponse);
    if (!urlExists) {
      console.log('[FetchArticles] AI returned URL not in sitemap, ignoring:', cleanedResponse);
      return null;
    }
    
    console.log(`[FetchArticles] AI identified blog page: ${cleanedResponse}`);
    
    // Crawl the identified blog page
    const baseUrl = websiteUrl.replace(/\/$/, '');
    const articles = await crawlSpecificBlogPage(cleanedResponse, baseUrl, limit);
    return articles && articles.length > 0 ? articles : null;
    
  } catch (error) {
    console.log('[FetchArticles] AI blog identification error:', error.message);
    return null;
  }
}

/**
 * Crawl a specific blog page URL for article links
 */
async function crawlSpecificBlogPage(blogUrl, baseUrl, limit) {
  try {
    console.log(`[FetchArticles] Crawling specific blog page: ${blogUrl}`);
    
    const cleanBlogUrl = blogUrl.replace(/\/$/, '');
    const blogPath = new URL(cleanBlogUrl).pathname.replace(/\/$/, '');
    
    const response = await fetch(cleanBlogUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GhostPostBot/1.0)',
        'Accept': 'text/html',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });
    
    if (!response.ok) return null;
    
    const html = await response.text();
    const articleLinks = new Set();
    
    // Common non-article path segments to skip
    const skipSegments = ['tag', 'tags', 'category', 'categories', 'author', 'authors', 'page', 'login', 'register', 'cart', 'checkout', 'contact', 'about', 'search', 'feed', 'rss', 'wp-admin', 'wp-login', 'wp-content'];
    
    const linkRegex = /<a[^>]+href=["']([^"']+)['"]/gi;
    let match;
    while ((match = linkRegex.exec(html)) !== null && articleLinks.size < limit * 3) {
      const href = match[1];
      
      // Skip non-article links
      if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
      if (href.endsWith('.jpg') || href.endsWith('.png') || href.endsWith('.gif') || href.endsWith('.pdf') || href.endsWith('.css') || href.endsWith('.js')) continue;
      
      let fullUrl;
      if (href.startsWith('http')) {
        fullUrl = href;
      } else if (href.startsWith('/')) {
        fullUrl = baseUrl + href;
      } else {
        fullUrl = cleanBlogUrl + '/' + href;
      }
      
      // Normalize - remove trailing slash, query and hash
      try {
        const parsed = new URL(fullUrl);
        fullUrl = parsed.origin + parsed.pathname.replace(/\/$/, '');
      } catch { continue; }
      
      // Check that URL belongs to the same domain
      try {
        const linkHost = new URL(fullUrl).hostname;
        const baseHost = new URL(baseUrl).hostname;
        if (linkHost !== baseHost) continue;
      } catch { continue; }
      
      const urlPath = new URL(fullUrl).pathname.replace(/\/$/, '');
      const pathParts = urlPath.split('/').filter(Boolean);
      
      // Skip the blog page itself, homepage, and navigation pages
      if (urlPath === blogPath || urlPath === '' || urlPath === '/') continue;
      if (pathParts.some(part => skipSegments.includes(part.toLowerCase()))) continue;
      if (fullUrl.includes('?page=') || fullUrl.includes('/page/')) continue;
      
      // Accept any link with path depth (article at /slug or /blog/slug etc.)
      if (pathParts.length >= 1) {
        articleLinks.add(fullUrl);
      }
    }
    
    if (articleLinks.size === 0) return null;
    
    console.log(`[FetchArticles] Found ${articleLinks.size} potential article links`);
    
    const links = Array.from(articleLinks).slice(0, limit);
    const articles = [];
    const batchSize = 3;
    
    for (let i = 0; i < links.length; i += batchSize) {
      const batch = links.slice(i, i + batchSize);
      
      const batchResults = await Promise.all(
        batch.map(async (url) => {
          const data = await fetchArticleData(url);
          // Use AI to generate title if HTML extraction failed
          const title = data?.title || await generateTitleWithAI(url);
          // Use AI to generate excerpt if HTML extraction failed
          const excerpt = data?.excerpt || (data?.html ? await generateExcerptWithAI(url, data.html) : null);
          return {
            url,
            title,
            excerpt,
            image: data?.image || null,
            date: null,
          };
        })
      );
      
      articles.push(...batchResults);
    }
    
    return articles.length > 0 ? articles : null;
    
  } catch (error) {
    console.log(`[FetchArticles] Error crawling blog page ${blogUrl}:`, error.message);
    return null;
  }
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
              // Use AI to generate title if HTML extraction failed
              const title = data?.title || await generateTitleWithAI(url);
              // Use AI to generate excerpt if HTML extraction failed
              const excerpt = data?.excerpt || (data?.html ? await generateExcerptWithAI(url, data.html) : null);
              return {
                url,
                title,
                excerpt,
                image: data?.image || null,
                date: null,
              };
            })
          );
          
          articles.push(...batchResults);
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
  const { limit = 20, blogUrl } = params;
  
  console.log('[FetchArticles] Starting article fetch...', blogUrl ? `(manual blog URL: ${blogUrl})` : '');
  
  // Get website URL
  const websiteUrl = context.interview?.responses?.websiteUrl || 
                     context.interview?.externalData?.crawledData?.url;
  
  if (!websiteUrl && !blogUrl) {
    console.log('[FetchArticles] No website URL available');
    return {
      success: true,
      articles: [],
      total: 0,
      message: 'No website URL available'
    };
  }
  
  let articles = null;
  let source = 'unknown';
  
  // If manual blog URL provided, skip all discovery and crawl directly
  if (blogUrl) {
    const baseUrl = (() => {
      try { return new URL(blogUrl).origin; } catch { return blogUrl.replace(/\/$/, ''); }
    })();
    articles = await crawlSpecificBlogPage(blogUrl, baseUrl, limit);
    if (articles) {
      source = 'manual-blog-url';
    }
  } else {
    // Normal discovery flow
    
    // Check platform from interview responses or crawled data
    const platform = context.interview?.responses?.websitePlatform || 
                     context.interview?.externalData?.platformData?.platform ||
                     context.interview?.externalData?.crawledData?.platform;
    
    console.log(`[FetchArticles] Platform: ${platform || 'unknown'}, URL: ${websiteUrl}`);
    
    // Strategy 1: If WordPress, try plugin API first
    if (platform === 'wordpress' && context.siteId) {
      try {
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
    
    // Strategy 4: Smart blog discovery from sitemap URLs
    if (!articles) {
      const discoveryResult = await discoverBlogFromSitemap(websiteUrl, limit);
      if (discoveryResult && !discoveryResult._sitemapUrls) {
        articles = discoveryResult;
        source = 'sitemap-blog-discovery';
      } else if (discoveryResult?._sitemapUrls) {
        // Strategy 5: AI blog identification from sitemap URLs
        articles = await identifyBlogWithAI(discoveryResult._sitemapUrls, websiteUrl, limit);
        if (articles) source = 'ai-blog-identification';
      }
    }
    
    // Strategy 6: Crawl common blog page paths as last resort
    if (!articles) {
      articles = await fetchFromBlogPage(websiteUrl, limit);
      if (articles) source = 'blog-crawl';
    }
  }
  
  // No articles found from any source
  if (!articles || articles.length === 0) {
    console.log('[FetchArticles] No articles found from any source');
    return {
      success: true,
      articles: [],
      total: 0,
      message: 'No blog posts found on this website',
      blogDiscoveryFailed: true
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