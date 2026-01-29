/**
 * Analyze Competitors Handler
 * 
 * Analyzes competitors and generates keyword suggestions using Gemini AI.
 * Takes competitor URLs/names from user input and business info from crawled data.
 */

import { analyzeCompetitors as aiAnalyzeCompetitors } from '@/lib/ai/interview-ai.js';

/**
 * Parse competitor input (can be URLs, names, or mixed, newline or comma separated)
 */
function parseCompetitorInput(input) {
  if (!input || typeof input !== 'string') return [];
  
  // Split by newlines or commas
  return input
    .split(/[\n,]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * Main handler function
 */
export async function analyzeCompetitors(params, context) {
  const { competitors: competitorInput } = params;
  
  // Parse the competitor input
  const competitors = parseCompetitorInput(competitorInput);
  
  if (competitors.length === 0) {
    return {
      success: true,
      competitors: [],
      suggestedKeywords: [],
      contentGaps: [],
      differentiators: [],
      message: 'No competitors provided - skipping analysis',
    };
  }
  
  try {
    // Get business info from crawled data
    const crawledData = context.interview?.externalData?.crawledData || {};
    
    const businessInfo = {
      businessName: crawledData.businessName || null,
      category: crawledData.category || null,
      description: crawledData.description || null,
    };

    // Run AI analysis
    const aiResult = await aiAnalyzeCompetitors(businessInfo, competitors);
    
    if (!aiResult.success) {
      console.error('AI competitor analysis failed:', aiResult.error);
      // Return basic parsed data without AI enhancement
      return {
        success: true,
        competitors: competitors.map(c => ({ name: c, strengths: [], contentTopics: [] })),
        suggestedKeywords: [],
        contentGaps: [],
        differentiators: [],
        aiAnalyzed: false,
      };
    }

    const result = {
      success: true,
      competitors: aiResult.data.competitors || [],
      suggestedKeywords: aiResult.data.suggestedKeywords || [],
      contentGaps: aiResult.data.contentGaps || [],
      differentiators: aiResult.data.differentiators || [],
      aiAnalyzed: true,
    };

    // Store in interview external data
    if (context.interview && context.prisma) {
      const existingData = context.interview.externalData || {};
      await context.prisma.userInterview.update({
        where: { id: context.interview.id },
        data: {
          externalData: {
            ...existingData,
            competitorAnalysis: result,
            competitorAnalyzedAt: new Date().toISOString(),
          }
        }
      });
    }

    return result;
    
  } catch (error) {
    console.error('Analyze competitors error:', error);
    return {
      success: false,
      error: error.message || 'Failed to analyze competitors'
    };
  }
}
