/**
 * Analyze Internal Links Handler
 * 
 * Analyzes internal links from fetched articles to calculate
 * average links per 1000 words and provide a recommendation.
 */

/**
 * Count internal links in HTML content
 */
function countInternalLinks(html, baseUrl) {
  if (!html || !baseUrl) return 0;
  
  try {
    const urlObj = new URL(baseUrl);
    const domain = urlObj.hostname;
    
    // Match all anchor tags
    const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
    let count = 0;
    let match;
    
    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1];
      
      // Skip external links, anchors, mailto, tel, javascript
      if (href.startsWith('#') || 
          href.startsWith('mailto:') || 
          href.startsWith('tel:') || 
          href.startsWith('javascript:')) {
        continue;
      }
      
      // Check if it's an internal link
      if (href.startsWith('/') || href.includes(domain)) {
        count++;
      }
    }
    
    return count;
  } catch (error) {
    return 0;
  }
}

/**
 * Count words in text (stripped of HTML)
 */
function countWords(html) {
  if (!html) return 0;
  
  // Strip HTML tags
  const text = html.replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  if (!text) return 0;
  
  // Count words
  return text.split(/\s+/).length;
}

/**
 * Calculate links per 1000 words
 */
function calculateLinksPer1000Words(linkCount, wordCount) {
  if (wordCount === 0) return 0;
  return Math.round((linkCount / wordCount) * 1000 * 10) / 10; // One decimal place
}

/**
 * Main handler function
 */
export async function analyzeInternalLinks(params, context) {
  try {
    // Get fetched articles from externalData
    const articles = context.interview?.externalData?.articles || 
                     context.interview?.externalData?.fetchedArticles || [];
    
    if (articles.length === 0) {
      return {
        success: true,
        averageLinksPer1000Words: 2, // Default recommendation
        recommendation: 2,
        message: 'No articles to analyze - using SEO best practice default',
        analyzed: false,
      };
    }
    
    // Get website URL for internal link detection
    const websiteUrl = context.interview?.responses?.websiteUrl || 
                       context.interview?.externalData?.crawledData?.url || '';
    
    // Analyze each article
    const articleStats = [];
    
    for (const article of articles) {
      const content = article.content || article.html || '';
      const wordCount = countWords(content);
      const linkCount = countInternalLinks(content, websiteUrl);
      
      if (wordCount > 100) { // Only consider articles with meaningful content
        articleStats.push({
          url: article.url,
          wordCount,
          linkCount,
          linksPer1000: calculateLinksPer1000Words(linkCount, wordCount),
        });
      }
    }
    
    // Calculate average
    let averageLinksPer1000Words = 2; // Default
    if (articleStats.length > 0) {
      const totalLinks = articleStats.reduce((sum, a) => sum + a.linksPer1000, 0);
      averageLinksPer1000Words = Math.round((totalLinks / articleStats.length) * 10) / 10;
    }
    
    // SEO recommendation: 2-4 internal links per 1000 words is optimal
    let recommendation = averageLinksPer1000Words;
    if (recommendation < 2) recommendation = 2;
    if (recommendation > 5) recommendation = 4;
    recommendation = Math.round(recommendation);
    
    return {
      success: true,
      averageLinksPer1000Words,
      recommendation,
      articlesAnalyzed: articleStats.length,
      stats: articleStats,
      analyzed: true,
      storeInExternalData: {
        internalLinksAnalysis: {
          averageLinksPer1000Words,
          recommendation,
          articlesAnalyzed: articleStats.length,
          analyzedAt: new Date().toISOString(),
        },
      },
    };
    
  } catch (error) {
    console.error('Analyze internal links error:', error);
    return {
      success: false,
      averageLinksPer1000Words: 2,
      recommendation: 2,
      error: error.message || 'Failed to analyze internal links',
    };
  }
}
