/**
 * Crawl Website Handler
 * 
 * Bot action handler that uses the comprehensive crawl function
 * to validate URLs, crawl websites, parse sitemaps, and analyze SEO.
 */

import { crawlWebsite as crawlWebsiteFunction } from '@/lib/interview/functions/crawl-website.js';

/**
 * Main crawl handler for bot actions
 * 
 * This handler is called when the CRAWL_WEBSITE action is triggered.
 * It uses the comprehensive crawl function and saves results to the interview.
 */
export async function crawlWebsite(params, context) {
  // Get URL from params or from the interview responses
  const url = params.url || context.responses?.websiteUrl;
  
  if (!url) {
    return {
      success: false,
      error: 'No URL provided',
    };
  }
  
  console.log('[CrawlWebsite Handler] Starting crawl for:', url);
  console.log('[CrawlWebsite Handler] Context available:', {
    hasInterview: !!context.interview,
    hasPrisma: !!context.prisma,
    interviewId: context.interview?.id,
  });
  
  try {
    // Use the comprehensive crawl function
    const crawlResult = await crawlWebsiteFunction(url);
    
    // If crawl failed, return the error
    if (!crawlResult.success) {
      const errorMessage = crawlResult.errors?.length > 0 
        ? crawlResult.errors.map(e => e.message).join(', ')
        : 'Failed to crawl website';
      
      return {
        success: false,
        error: errorMessage,
        validation: crawlResult.validation,
      };
    }
    
    // Save crawl data to interview if context available
    if (context.interview && context.prisma) {
      const existingData = context.interview.externalData || {};
      
      // Prepare the data to save - use AI-extracted data when available
      const aiData = crawlResult.pageData?.aiExtracted || {};
      const contactData = crawlResult.pageData?.contact || {};
      
      const crawledData = {
        // Basic page data - prefer AI-extracted businessName
        url: crawlResult.url,
        businessName: aiData.businessName || crawlResult.pageData?.businessName || crawlResult.pageData?.title || crawlResult.pageData?.siteName,
        description: aiData.description || crawlResult.pageData?.description,
        image: crawlResult.pageData?.image,
        // Language - prefer AI-detected, fallback to HTML lang attribute
        language: aiData.detectedLanguage || crawlResult.pageData?.language || 'en',
        
        // AI-extracted additional fields
        category: aiData.category || null,
        address: aiData.address || null,
        servicesOrProducts: aiData.servicesOrProducts || [],
        targetAudience: aiData.targetAudience || null,
        
        // Contact info - prefer AI-extracted (already normalized)
        // AI returns single values, crawler returns arrays
        phone: aiData.phone || contactData.phones?.[0] || null,
        email: aiData.email || contactData.emails?.[0] || null,
        phones: contactData.phones || [],
        emails: contactData.emails || [],
        socialLinks: contactData.socialLinks || {},
        
        // Sitemap data
        hasSitemap: crawlResult.sitemap?.found || false,
        sitemapUrls: crawlResult.sitemap?.urls?.slice(0, 20) || [], // Limit stored URLs
        sitemapCategories: crawlResult.sitemap?.categories,
        
        // Metadata
        crawledAt: crawlResult.crawledAt,
        keywords: crawlResult.pageData?.keywords || [],
      };
      
      console.log('[CrawlWebsite Handler] Saving crawledData to interview:', {
        businessName: crawledData.businessName,
        description: crawledData.description?.substring(0, 50),
        phone: crawledData.phone,
        email: crawledData.email,
        category: crawledData.category,
        address: crawledData.address,
      });
      
      // Update the interview with crawl data
      const updatedInterview = await context.prisma.userInterview.update({
        where: { id: context.interview.id },
        data: {
          externalData: {
            ...existingData,
            crawledData,
            // Also store raw crawl result for debugging
            _rawCrawlResult: crawlResult,
          },
        },
      });
      
      console.log('[CrawlWebsite Handler] Saved crawl data to interview. ExternalData keys:', Object.keys(updatedInterview.externalData || {}));
    } else {
      console.log('[CrawlWebsite Handler] WARNING: Could not save - missing context.interview or context.prisma');
    }
    
    // Return success with data (including AI-extracted fields)
    const aiData = crawlResult.pageData?.aiExtracted || {};
    
    return {
      success: true,
      data: {
        url: crawlResult.url,
        businessName: crawlResult.pageData?.businessName || crawlResult.pageData?.title,
        description: crawlResult.pageData?.description,
        category: aiData.category,
        address: aiData.address,
        image: crawlResult.pageData?.image,
        language: crawlResult.pageData?.language,
        emails: crawlResult.pageData?.contact?.emails,
        phones: crawlResult.pageData?.contact?.phones,
        socialLinks: crawlResult.pageData?.contact?.socialLinks,
        seoScore: crawlResult.seoAnalysis?.score,
        seoIssueCount: crawlResult.seoAnalysis?.issues?.length || 0,
        hasSitemap: crawlResult.sitemap?.found || false,
        sitemapUrlCount: crawlResult.sitemap?.urls?.length || 0,
        validation: crawlResult.validation,
      },
    };
  } catch (error) {
    console.error('[CrawlWebsite Handler] Error:', error);
    return {
      success: false,
      error: error.message || 'Failed to crawl website',
    };
  }
}
