/**
 * Generate Keywords Handler
 * 
 * Generates keyword suggestions based on:
 * 1. Keywords already extracted from the website during crawling
 * 2. AI-generated keywords based on business info
 * 3. Keywords from competitor analysis
 */

import { generateKeywords as aiGenerateKeywords } from '@/lib/ai/interview-ai.js';

/**
 * Transform AI output to a simpler format for UI display
 */
function transformKeywordsForUI(aiData) {
  const keywords = [];

  // Add primary keywords with metadata
  if (aiData.primaryKeywords?.length) {
    aiData.primaryKeywords.forEach((kw, index) => {
      keywords.push({
        id: `primary-${index}`,
        keyword: kw.keyword,
        type: 'primary',
        priority: kw.searchVolume === 'high' ? 'high' : (kw.searchVolume === 'medium' ? 'medium' : 'low'),
        difficulty: kw.difficulty,
        relevance: kw.relevance,
        source: 'ai-generated',
      });
    });
  }

  // Add long-tail keywords
  if (aiData.longTailKeywords?.length) {
    aiData.longTailKeywords.forEach((kw, index) => {
      keywords.push({
        id: `longtail-${index}`,
        keyword: kw.keyword,
        type: 'long-tail',
        priority: 'medium',
        intent: kw.intent,
        source: 'ai-generated',
      });
    });
  }

  return keywords;
}

/**
 * Main handler function
 */
export async function generateKeywords(params, context) {
  try {
    // Get business info from crawled data
    const crawledData = context.interview?.externalData?.crawledData || {};
    const rawCrawlResult = context.interview?.externalData?._rawCrawlResult || {};
    const competitorAnalysis = context.interview?.externalData?.competitorAnalysis || {};

    // Get keywords already extracted from website during crawl
    const crawledKeywords = rawCrawlResult?.pageData?.keywords || 
                            crawledData.keywords || 
                            [];
    
    console.log(`[GenerateKeywords] Found ${crawledKeywords.length} keywords from website crawl:`, crawledKeywords.slice(0, 5));

    const businessInfo = {
      businessName: crawledData.businessName || null,
      category: crawledData.category || null,
      description: crawledData.description || null,
      // Include crawled keywords so AI can expand on them
      existingKeywords: crawledKeywords.slice(0, 10),
    };

    // Get competitors from analysis or interview answers
    const competitors = competitorAnalysis.competitors || [];

    // Run AI keyword generation
    const aiResult = await aiGenerateKeywords(businessInfo, competitors);

    // Start with keywords from website crawl (these are REAL keywords from the site)
    const keywords = [];
    const seenKeywords = new Set();
    
    // Add crawled keywords first (these are verified to exist on the website)
    crawledKeywords.forEach((kw, index) => {
      const normalizedKw = kw.toLowerCase().trim();
      if (!seenKeywords.has(normalizedKw) && normalizedKw.length > 2) {
        seenKeywords.add(normalizedKw);
        keywords.push({
          id: `crawled-${index}`,
          keyword: kw,
          type: 'from-website',
          priority: 'high',
          source: 'website-content',
          verified: true,
        });
      }
    });

    // Add AI-generated keywords (avoiding duplicates)
    if (aiResult.success && aiResult.data) {
      const aiKeywords = transformKeywordsForUI(aiResult.data);
      aiKeywords.forEach(kw => {
        const normalizedKw = kw.keyword.toLowerCase().trim();
        if (!seenKeywords.has(normalizedKw) && normalizedKw.length > 2) {
          seenKeywords.add(normalizedKw);
          keywords.push(kw);
        }
      });
    }
    
    console.log(`[GenerateKeywords] Total keywords: ${keywords.length} (${crawledKeywords.length} from website, ${keywords.length - crawledKeywords.length} AI-generated)`);

    return {
      success: true,
      keywords,
      topicClusters: aiResult.data?.topicClusters || [],
      rawData: aiResult.data,
      // Store in externalData for persistence
      storeInExternalData: {
        keywordSuggestions: keywords,
        topicClusters: aiResult.data?.topicClusters || [],
      },
    };
  } catch (error) {
    console.error('Generate keywords handler error:', error);
    return {
      success: false,
      keywords: [],
      topicClusters: [],
      error: error.message,
    };
  }
}
