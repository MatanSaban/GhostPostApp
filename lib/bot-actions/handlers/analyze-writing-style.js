/**
 * Analyze Writing Style Handler
 * 
 * Analyzes the writing style and tone of website content using Gemini AI.
 */

import { analyzeWritingStyle as aiAnalyzeWritingStyle } from '@/lib/ai/interview-ai.js';
import { trackAIUsage } from '@/lib/ai/credits-service';
import { AI_OPERATIONS } from '@/lib/ai/credits';

/**
 * Normalize URL
 */
function normalizeUrl(url) {
  if (!url) return null;
  let normalized = url.trim();
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = 'https://' + normalized;
  }
  return normalized;
}

/**
 * Simple text analysis
 */
function analyzeText(text) {
  // Clean text
  const cleanText = text.replace(/\s+/g, ' ').trim();
  const words = cleanText.split(' ').filter(w => w.length > 0);
  const sentences = cleanText.split(/[.!?]+/).filter(s => s.trim().length > 0);
  
  // Calculate metrics
  const avgWordsPerSentence = sentences.length > 0 ? words.length / sentences.length : 0;
  const avgWordLength = words.length > 0 
    ? words.reduce((sum, w) => sum + w.length, 0) / words.length 
    : 0;
  
  // Detect voice
  const firstPersonWords = ['I', 'we', 'our', 'us', 'my', 'mine'];
  const secondPersonWords = ['you', 'your', 'yours'];
  
  const lowerText = cleanText.toLowerCase();
  const firstPersonCount = firstPersonWords.filter(w => 
    lowerText.includes(w.toLowerCase())
  ).length;
  const secondPersonCount = secondPersonWords.filter(w => 
    lowerText.includes(w.toLowerCase())
  ).length;
  
  let voice = 'third-person';
  if (firstPersonCount > secondPersonCount && firstPersonCount > 2) {
    voice = 'first-person';
  } else if (secondPersonCount > 2) {
    voice = 'second-person';
  }
  
  // Detect tone indicators
  const formalWords = ['therefore', 'consequently', 'furthermore', 'moreover', 'nevertheless', 'accordingly'];
  const casualWords = ['awesome', 'cool', 'amazing', 'great', 'hey', 'gonna', 'wanna'];
  const technicalWords = ['implementation', 'architecture', 'infrastructure', 'algorithm', 'optimization'];
  
  const formalCount = formalWords.filter(w => lowerText.includes(w)).length;
  const casualCount = casualWords.filter(w => lowerText.includes(w)).length;
  const technicalCount = technicalWords.filter(w => lowerText.includes(w)).length;
  
  // Determine tone
  let tone = 'professional';
  if (casualCount > formalCount && casualCount > 2) {
    tone = 'casual';
  } else if (formalCount > casualCount && formalCount > 2) {
    tone = 'formal';
  } else if (technicalCount > 3) {
    tone = 'technical';
  }
  
  // Determine readability
  let readability = 'moderate';
  if (avgWordsPerSentence < 15 && avgWordLength < 5) {
    readability = 'easy';
  } else if (avgWordsPerSentence > 25 || avgWordLength > 6) {
    readability = 'advanced';
  }
  
  // Gather characteristics
  const characteristics = [];
  if (avgWordsPerSentence < 15) characteristics.push('concise');
  if (avgWordsPerSentence > 25) characteristics.push('detailed');
  if (technicalCount > 2) characteristics.push('technical');
  if (casualCount > 2) characteristics.push('friendly');
  if (formalCount > 2) characteristics.push('formal');
  if (secondPersonCount > 3) characteristics.push('engaging');
  
  return {
    tone,
    voice,
    readability,
    characteristics,
    metrics: {
      avgWordsPerSentence: Math.round(avgWordsPerSentence * 10) / 10,
      avgWordLength: Math.round(avgWordLength * 10) / 10,
      totalWords: words.length,
      totalSentences: sentences.length
    }
  };
}

/**
 * Check if a string looks like a valid URL or domain
 */
function isValidUrlOrDomain(str) {
  if (!str || typeof str !== 'string') return false;
  const trimmed = str.trim();
  // Check for URL patterns
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return true;
  // Check for domain-like patterns (contains dot and no spaces)
  if (trimmed.includes('.') && !trimmed.includes(' ') && trimmed.length > 4) return true;
  return false;
}

export async function analyzeWritingStyle(params, context) {
  const { url, sampleSize = 5 } = params;
  
  // Get the actual website URL - the 'url' param might be the writing style selection, not the URL
  // Priority: params.url (if valid) > context.responses.websiteUrl > externalData.crawledData.url
  let websiteUrl = null;
  
  if (isValidUrlOrDomain(url)) {
    websiteUrl = url;
  } else if (context?.responses?.websiteUrl) {
    websiteUrl = context.responses.websiteUrl;
  } else if (context?.interview?.externalData?.crawledData?.url) {
    websiteUrl = context.interview.externalData.crawledData.url;
  } else if (context?.externalData?.crawledData?.url) {
    websiteUrl = context.externalData.crawledData.url;
  }
  
  const normalizedUrl = normalizeUrl(websiteUrl);
  if (!normalizedUrl) {
    console.log('[AnalyzeWritingStyle] No valid URL found, params.url was:', url);
    return {
      success: false,
      error: 'Invalid URL provided - could not find website URL'
    };
  }
  
  console.log('[AnalyzeWritingStyle] Analyzing writing style for:', normalizedUrl);
  
  try {
    // Fetch the main page
    const response = await fetch(normalizedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GhostPostBot/1.0; +https://ghostpost.co.il)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000)
    });
    
    if (!response.ok) {
      return {
        success: false,
        error: `Failed to fetch website: ${response.status}`
      };
    }
    
    const html = await response.text();
    
    // Extract main content (remove scripts, styles, nav, footer)
    let textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Limit text for analysis
    textContent = textContent.substring(0, 10000);
    
    // Try AI analysis first
    let aiAnalysis = null;
    try {
      const aiResult = await aiAnalyzeWritingStyle([textContent]);
      if (aiResult.success) {
        aiAnalysis = aiResult.data;
      }
    } catch (aiError) {
      console.error('AI writing style analysis error:', aiError);
    }

    // Fallback to basic analysis if AI fails
    const basicAnalysis = analyzeText(textContent);
    
    const result = {
      success: true,
      style: {
        tone: aiAnalysis?.detectedStyle || basicAnalysis.tone,
        voice: basicAnalysis.voice,
        readability: basicAnalysis.readability,
        characteristics: aiAnalysis?.characteristics || basicAnalysis.characteristics,
        confidence: aiAnalysis?.confidence || 0.5,
        toneDescriptors: aiAnalysis?.toneDescriptors || [],
        recommendations: aiAnalysis?.recommendations || [],
      },
      metrics: basicAnalysis.metrics,
      aiAnalyzed: !!aiAnalysis,
    };

    // Store in interview if context available
    if (context.interview && context.prisma) {
      const existingData = context.interview.externalData || {};
      await context.prisma.userInterview.update({
        where: { id: context.interview.id },
        data: {
          externalData: {
            ...existingData,
            writingStyleAnalysis: result,
          }
        }
      });
    }

    // Track AI credits usage (only if AI was used)
    if (context.accountId && result.aiAnalyzed) {
      // Get websiteUrl from context or interview data
      const websiteUrl = context.responses?.websiteUrl || 
                         context.externalData?.crawledData?.url ||
                         context.interview?.responses?.websiteUrl ||
                         context.interview?.externalData?._rawCrawlResult?.url;
      
      // Get business name from crawled data
      const businessName = context.interview?.externalData?.crawledData?.businessName ||
                          context.externalData?.crawledData?.businessName;
      
      await trackAIUsage({
        accountId: context.accountId,
        userId: context.userId,
        siteId: context.siteId,
        operation: AI_OPERATIONS.ANALYZE_WRITING_STYLE.key,
        description: `Writing style analysis`,
        metadata: {
          detectedTone: result.style?.tone,
          confidence: result.style?.confidence,
          websiteUrl,
          businessName,
          descriptionKey: 'analyzedWritingStyle',
        }
      });
    }

    return result;
    
  } catch (error) {
    console.error('Analyze writing style error:', error);
    return {
      success: false,
      error: error.message || 'Failed to analyze writing style'
    };
  }
}
