/**
 * Interview AI Service
 * 
 * Handles AI-powered interview interactions using Gemini
 * through the Vercel AI SDK v6.
 */

import { generateTextResponse, generateStructuredResponse } from './gemini.js';
import { z } from 'zod';

// System prompt for the interview assistant
const INTERVIEW_SYSTEM_PROMPT = `You are Ghost, a friendly and professional AI assistant for GhostPost - an SEO content automation platform.

Your role is to conduct an onboarding interview with new users to understand their business and content needs. You should:

1. Be warm, helpful, and conversational
2. Ask clarifying questions when needed
3. Provide helpful context about why you're asking each question
4. Validate and confirm user inputs
5. Suggest improvements or best practices when relevant

IMPORTANT GUIDELINES:
- Keep responses concise but friendly (2-3 sentences max for most messages)
- Use the user's language (Hebrew or English based on their preference)
- Don't repeat information the user has already provided
- If a user's answer is unclear, ask for clarification
- When analyzing data (website, competitors, etc.), provide helpful insights

Current Interview Context:
{context}`;

/**
 * Generate an AI response for the interview
 * 
 * @param {Object} options - Options
 * @param {Object} options.question - Current interview question
 * @param {string} options.userResponse - User's response to the question
 * @param {Object} options.interviewContext - Full interview context (responses, business data, etc.)
 * @param {string} options.language - User's preferred language ('en' or 'he')
 * @returns {Promise<Object>} AI response with message and any extracted data
 */
export async function generateInterviewResponse({
  question,
  userResponse,
  interviewContext = {},
  language = 'en',
}) {
  const contextString = JSON.stringify({
    currentQuestion: question.translationKey,
    questionType: question.questionType,
    previousResponses: interviewContext.responses || {},
    businessData: interviewContext.externalData || {},
    language,
  }, null, 2);

  const system = INTERVIEW_SYSTEM_PROMPT.replace('{context}', contextString);

  const prompt = `The user just answered the question about "${question.aiPromptHint}".

Their response: "${userResponse}"

Generate a brief, friendly acknowledgment of their response and smoothly transition to the next part of the interview. If their response needs clarification or seems incomplete, politely ask for more details.

Respond in ${language === 'he' ? 'Hebrew' : 'English'}.`;

  try {
    const response = await generateTextResponse({
      system,
      prompt,
      temperature: 0.7,
      maxTokens: 256,
      operation: 'INTERVIEW_CHAT',
      metadata: { questionType: question.questionType, language },
    });

    return {
      success: true,
      message: response,
    };
  } catch (error) {
    console.error('Interview AI error:', error);
    return {
      success: false,
      message: null,
      error: error.message,
    };
  }
}

/**
 * Analyze a website and extract business information
 * 
 * @param {string} websiteUrl - The website URL to analyze
 * @param {string} htmlContent - The HTML content of the website
 * @returns {Promise<Object>} Extracted business information
 */
export async function analyzeWebsite(websiteUrl, htmlContent) {
  const schema = z.object({
    businessName: z.string().describe('The name of the business'),
    description: z.string().describe('A brief description of what the business does'),
    category: z.string().describe('The business category/industry'),
    email: z.string().optional().describe('Contact email if found'),
    phone: z.string().optional().describe('Contact phone if found'),
    address: z.string().optional().describe('Physical address if found'),
    socialLinks: z.array(z.string()).optional().describe('Social media links'),
    primaryLanguage: z.string().describe('The primary language of the website content'),
    keywords: z.array(z.string()).describe('Main keywords/topics from the website'),
    writingStyle: z.enum(['professional', 'casual', 'technical', 'friendly', 'authoritative', 'conversational'])
      .describe('The detected writing style of the content'),
  });

  const prompt = `Analyze this website and extract business information.

Website URL: ${websiteUrl}

HTML Content (truncated):
${htmlContent.substring(0, 10000)}

Extract as much business information as possible from the content.`;

  try {
    const result = await generateStructuredResponse({
      system: 'You are a business analyst AI that extracts structured information from websites.',
      prompt,
      schema,
      temperature: 0.3,
      operation: 'COMPETITOR_ANALYSIS',
      metadata: { websiteUrl },
    });

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    console.error('Website analysis error:', error);
    return {
      success: false,
      data: null,
      error: error.message,
    };
  }
}

/**
 * Generate keyword suggestions based on business info
 * 
 * @param {Object} businessInfo - Business information
 * @param {Array} competitors - Competitor URLs/names
 * @returns {Promise<Object>} Keyword suggestions
 */
export async function generateKeywords(businessInfo, competitors = []) {
  const schema = z.object({
    primaryKeywords: z.array(z.object({
      keyword: z.string(),
      searchVolume: z.enum(['high', 'medium', 'low']),
      difficulty: z.enum(['easy', 'medium', 'hard']),
      relevance: z.number().min(0).max(1).describe('Relevance score from 0 to 1, where 1 is highest relevance'),
    })).describe('Primary keywords for the business'),
    longTailKeywords: z.array(z.object({
      keyword: z.string(),
      intent: z.enum(['informational', 'transactional', 'navigational']),
    })).describe('Long-tail keyword suggestions'),
    topicClusters: z.array(z.object({
      topic: z.string(),
      keywords: z.array(z.string()),
    })).describe('Topic clusters for content strategy'),
  });

  // Build context about existing keywords if available
  const existingKeywordsContext = businessInfo.existingKeywords?.length > 0 
    ? `\nExisting keywords found on website: ${businessInfo.existingKeywords.join(', ')}`
    : '';

  const prompt = `Generate SEO keyword suggestions for this business:

Business: ${businessInfo.businessName || 'Unknown'}
Category: ${businessInfo.category || 'Unknown'}
Description: ${businessInfo.description || 'Not provided'}${existingKeywordsContext}
${competitors.length > 0 ? `Competitors: ${competitors.join(', ')}` : ''}

Generate additional keywords that COMPLEMENT the existing keywords. Focus on:
1. 10-15 primary keywords with search volume (high/medium/low), difficulty (easy/medium/hard), and relevance (0 to 1)
2. 10-15 long-tail keywords with search intent (informational/transactional/navigational)  
3. 3-5 topic clusters for content planning

Important: Generate keywords that would help this business rank in search engines. Consider keywords the competitors might be using.`;

  try {
    const result = await generateStructuredResponse({
      system: 'You are an SEO expert AI that generates keyword strategies for businesses.',
      prompt,
      schema,
      temperature: 0.5,
      operation: 'GENERIC',
      metadata: { businessName: businessInfo.businessName, competitorsCount: competitors.length },
    });

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    console.error('Keyword generation error:', error);
    return {
      success: false,
      data: null,
      error: error.message,
    };
  }
}

/**
 * Analyze competitors and generate related keywords
 * 
 * @param {Object} businessInfo - Business information
 * @param {Array<string>} competitors - Competitor URLs/names from user input
 * @returns {Promise<Object>} Competitor analysis with keyword suggestions
 */
export async function analyzeCompetitors(businessInfo, competitors = []) {
  const schema = z.object({
    competitors: z.array(z.object({
      name: z.string().describe('Competitor name'),
      strengths: z.array(z.string()).describe('Perceived strengths'),
      contentTopics: z.array(z.string()).describe('Main content topics they cover'),
    })).describe('Analysis of each competitor'),
    suggestedKeywords: z.array(z.object({
      keyword: z.string(),
      source: z.enum(['competitor', 'opportunity', 'niche']).describe('Where this keyword idea came from'),
      priority: z.enum(['high', 'medium', 'low']),
    })).describe('Keywords derived from competitor analysis'),
    contentGaps: z.array(z.string()).describe('Content opportunities competitors are missing'),
    differentiators: z.array(z.string()).describe('Ways to differentiate from competitors'),
  });

  const competitorList = competitors.length > 0 
    ? competitors.join('\n') 
    : 'No specific competitors provided';

  const prompt = `Analyze these competitors for a business and suggest keywords:

Business: ${businessInfo.businessName || 'Unknown business'}
Category: ${businessInfo.category || 'Unknown category'}
Description: ${businessInfo.description || 'No description'}

Competitors (URLs or names):
${competitorList}

Based on this information:
1. Analyze each competitor (if URLs provided, infer from the domain name/brand)
2. Suggest 15-25 keywords that could help compete with them
3. Identify content gaps and opportunities
4. Suggest ways to differentiate

Focus on actionable SEO keyword opportunities.`;

  try {
    const result = await generateStructuredResponse({
      system: 'You are an SEO competitive analysis expert that identifies keyword opportunities and content gaps.',
      prompt,
      schema,
      temperature: 0.5,
      operation: 'COMPETITOR_ANALYSIS',
      metadata: { businessName: businessInfo.businessName, competitorsCount: competitors.length },
    });

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    console.error('Competitor analysis error:', error);
    return {
      success: false,
      data: null,
      error: error.message,
    };
  }
}

/**
 * Analyze writing style from content samples
 * 
 * @param {Array<string>} contentSamples - Sample content from the website
 * @returns {Promise<Object>} Writing style analysis
 */
export async function analyzeWritingStyle(contentSamples) {
  const schema = z.object({
    detectedStyle: z.enum(['professional', 'casual', 'technical', 'friendly', 'authoritative', 'conversational']),
    confidence: z.number().min(0).max(1),
    characteristics: z.array(z.string()).describe('Key characteristics of the writing style'),
    recommendations: z.array(z.string()).describe('Recommendations for content consistency'),
    toneDescriptors: z.array(z.string()).describe('Words that describe the tone'),
  });

  const prompt = `Analyze the writing style of these content samples:

${contentSamples.map((s, i) => `Sample ${i + 1}:\n${s.substring(0, 500)}`).join('\n\n')}

Determine the writing style and provide recommendations for maintaining consistency.`;

  try {
    const result = await generateStructuredResponse({
      system: 'You are a content analyst AI that evaluates writing styles and provides recommendations.',
      prompt,
      schema,
      temperature: 0.4,
      operation: 'GENERIC',
      metadata: { samplesCount: contentSamples.length },
    });

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    console.error('Writing style analysis error:', error);
    return {
      success: false,
      data: null,
      error: error.message,
    };
  }
}

/**
 * Generate a personalized SEO strategy based on interview responses
 * 
 * @param {Object} interviewData - Complete interview data
 * @returns {Promise<Object>} SEO strategy
 */
export async function generateSEOStrategy(interviewData) {
  const schema = z.object({
    summary: z.string().describe('Executive summary of the strategy'),
    contentPillars: z.array(z.object({
      topic: z.string(),
      description: z.string(),
      keywords: z.array(z.string()),
      priority: z.enum(['high', 'medium', 'low']),
    })).describe('Main content pillars'),
    publishingSchedule: z.object({
      frequency: z.string(),
      bestDays: z.array(z.string()),
      contentMix: z.record(z.number()),
    }).describe('Recommended publishing schedule'),
    quickWins: z.array(z.object({
      action: z.string(),
      impact: z.enum(['high', 'medium', 'low']),
      effort: z.enum(['easy', 'medium', 'hard']),
    })).describe('Quick win opportunities'),
    longTermGoals: z.array(z.object({
      goal: z.string(),
      timeline: z.string(),
      metrics: z.array(z.string()),
    })).describe('Long-term SEO goals'),
  });

  const prompt = `Create a personalized SEO strategy based on this interview data:

${JSON.stringify(interviewData, null, 2)}

Generate a comprehensive but actionable SEO strategy tailored to this business.`;

  try {
    const result = await generateStructuredResponse({
      system: 'You are an expert SEO strategist AI that creates personalized content strategies.',
      prompt,
      schema,
      temperature: 0.6,
      operation: 'GENERIC',
      metadata: { hasBusinessData: !!interviewData.businessInfo },
    });

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    console.error('SEO strategy generation error:', error);
    return {
      success: false,
      data: null,
      error: error.message,
    };
  }
}

const interviewAI = {
  generateInterviewResponse,
  analyzeWebsite,
  generateKeywords,
  analyzeCompetitors,
  analyzeWritingStyle,
  generateSEOStrategy,
};

export default interviewAI;
