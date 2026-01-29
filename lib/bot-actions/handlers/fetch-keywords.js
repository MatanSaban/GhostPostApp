/**
 * Fetch Keywords Handler
 * 
 * Generates keyword suggestions using Gemini AI based on business info.
 */

import { generateKeywords } from '@/lib/ai/interview-ai.js';

export async function fetchKeywords(params, context) {
  const { url, category, limit = 50 } = params;
  
  try {
    // Get business info from crawled data
    const crawledData = context.interview?.externalData?.crawledData || {};
    const responses = context.interview?.responses || {};
    
    const businessInfo = {
      businessName: crawledData.businessName || null,
      category: crawledData.category || category || null,
      description: crawledData.description || null,
      keywords: crawledData.keywords || [],
    };

    // Get competitors from responses
    const competitors = responses.competitors 
      ? responses.competitors.split('\n').filter(Boolean)
      : [];

    // Try AI-powered keyword generation
    let aiKeywords = null;
    try {
      const aiResult = await generateKeywords(businessInfo, competitors);
      if (aiResult.success) {
        aiKeywords = aiResult.data;
      }
    } catch (aiError) {
      console.error('AI keyword generation error:', aiError);
    }

    // Format keywords for the UI
    let keywords = [];
    
    if (aiKeywords) {
      // Use AI-generated keywords
      keywords = [
        ...aiKeywords.primaryKeywords.map(k => ({
          keyword: k.keyword,
          searchVolume: k.searchVolume === 'high' ? 5000 : k.searchVolume === 'medium' ? 2000 : 500,
          difficulty: k.difficulty === 'hard' ? 70 : k.difficulty === 'medium' ? 45 : 20,
          relevance: k.relevance / 10,
          type: 'primary',
        })),
        ...aiKeywords.longTailKeywords.map((k, i) => ({
          keyword: k.keyword,
          searchVolume: Math.floor(500 - (i * 30)),
          difficulty: 20 + (i * 3),
          relevance: 0.8 - (i * 0.02),
          type: 'long-tail',
          intent: k.intent,
        })),
      ].slice(0, limit);
    } else {
      // Fallback to crawled keywords + defaults
      const crawledKeywords = crawledData.keywords || [];
      keywords = crawledKeywords.map((kw, i) => ({
        keyword: kw,
        searchVolume: Math.floor(Math.random() * 5000) + 1000,
        difficulty: Math.floor(Math.random() * 50) + 20,
        relevance: 0.9 - (i * 0.05),
        type: 'crawled',
      })).slice(0, limit);
    }
    
    // Store in interview external data
    if (context.interview && context.prisma) {
      const existingData = context.interview.externalData || {};
      await context.prisma.userInterview.update({
        where: { id: context.interview.id },
        data: {
          externalData: {
            ...existingData,
            keywordSuggestions: keywords,
            topicClusters: aiKeywords?.topicClusters || null,
            keywordsGeneratedAt: new Date().toISOString(),
            aiGenerated: !!aiKeywords,
          }
        }
      });
    }
    
    return {
      success: true,
      keywords,
      topicClusters: aiKeywords?.topicClusters || [],
      total: keywords.length,
      aiGenerated: !!aiKeywords,
    };
    
  } catch (error) {
    console.error('Fetch keywords error:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch keywords'
    };
  }
}
