/**
 * Competitor AI Analysis Service
 * 
 * Uses Gemini AI to analyze competitor content and generate insights.
 * 
 * Key functions:
 * - Topic extraction from content
 * - Content gap identification
 * - Skyscraper outline generation
 */

import { generateStructuredResponse } from './gemini.js';
import { z } from 'zod';

/**
 * Analyze competitor content and extract topics covered
 * 
 * @param {string} content - The competitor's main content text
 * @param {string} title - The competitor's page title
 * @returns {Promise<Object>} Analysis results
 */
export async function analyzeCompetitorTopics(content, title) {
  const schema = z.object({
    topics: z.array(z.object({
      topic: z.string().describe('The topic or subtopic covered'),
      importance: z.enum(['high', 'medium', 'low']).describe('How important this topic is to the content'),
      wordEstimate: z.number().describe('Approximate word count for this topic'),
    })).describe('List of topics covered in the content'),
    mainTheme: z.string().describe('The overall theme or main topic of the content'),
    contentType: z.enum(['guide', 'listicle', 'comparison', 'tutorial', 'news', 'review', 'landing', 'other'])
      .describe('The type of content'),
    targetAudience: z.string().describe('Who this content is written for'),
    uniqueAngles: z.array(z.string()).describe('Unique perspectives or angles in the content'),
  });

  const prompt = `Analyze the following competitor content and extract the topics covered.

Title: ${title}

Content:
${content.slice(0, 30000)}

Identify:
1. All topics and subtopics covered
2. The main theme
3. Content type (guide, listicle, etc.)
4. Target audience
5. Any unique angles or perspectives`;

  return generateStructuredResponse({
    system: 'You are an SEO content analyst. Analyze web content to identify topics, themes, and content structure.',
    prompt,
    schema,
    temperature: 0.3,
    operation: 'COMPETITOR_ANALYSIS',
    metadata: { action: 'topic_extraction' },
  });
}

/**
 * Identify content gaps between user's content and competitor's content
 * 
 * @param {Object} userAnalysis - Analysis of user's content
 * @param {Object} competitorAnalysis - Analysis of competitor's content
 * @param {string} userTitle - User's page title
 * @param {string} competitorTitle - Competitor's page title
 * @returns {Promise<Object>} Content gaps and recommendations
 */
export async function identifyContentGaps(userContent, competitorContent, userTitle, competitorTitle) {
  const schema = z.object({
    gaps: z.array(z.object({
      topic: z.string().describe('Topic that competitor covers but user does not'),
      importance: z.enum(['critical', 'important', 'nice-to-have']).describe('How important is this gap'),
      reason: z.string().describe('Why this topic is important for ranking'),
      suggestedWords: z.number().describe('Suggested word count to add for this topic'),
    })).describe('Topics the competitor covers that you should add'),
    
    advantages: z.array(z.object({
      topic: z.string().describe('Topic you cover better than competitor'),
      description: z.string().describe('How your coverage is better'),
    })).describe('Topics where you have an advantage'),
    
    recommendations: z.array(z.object({
      action: z.string().describe('Specific action to take'),
      priority: z.enum(['high', 'medium', 'low']).describe('Priority level'),
      impact: z.string().describe('Expected impact of this action'),
    })).describe('Actionable recommendations to outrank competitor'),
    
    overallAssessment: z.object({
      competitorStrength: z.enum(['weak', 'moderate', 'strong']).describe('How strong is the competitor content'),
      difficultyToOutrank: z.enum(['easy', 'moderate', 'hard']).describe('Difficulty to outrank this competitor'),
      estimatedEffort: z.string().describe('Estimated effort needed (e.g., "2-3 hours", "1 week")'),
    }),
  });

  const prompt = `Compare these two pieces of content and identify gaps.

YOUR PAGE: "${userTitle}"
${userContent.slice(0, 15000)}

---

COMPETITOR PAGE: "${competitorTitle}"
${competitorContent.slice(0, 15000)}

---

Identify:
1. Topics the competitor covers that you don't (gaps to fill)
2. Topics where you have an advantage
3. Specific recommendations to outrank them
4. Overall assessment of difficulty`;

  return generateStructuredResponse({
    system: `You are an SEO strategist comparing content for competitive analysis. 
Be specific about gaps and provide actionable recommendations.
Focus on topics, depth of coverage, and content structure.`,
    prompt,
    schema,
    temperature: 0.4,
    operation: 'COMPETITOR_ANALYSIS',
    metadata: { action: 'gap_analysis' },
  });
}

/**
 * Generate a "Skyscraper" outline that improves upon competitor content
 * 
 * @param {Object} competitorData - Scraped competitor data
 * @param {Object} gapAnalysis - Content gap analysis results
 * @param {string} targetKeyword - The target keyword/topic
 * @returns {Promise<Object>} Improved outline for AI content wizard
 */
export async function generateSkyscraperOutline(competitorData, gapAnalysis, targetKeyword) {
  const schema = z.object({
    title: z.string().describe('Suggested title (better than competitor)'),
    metaDescription: z.string().describe('Suggested meta description'),
    
    outline: z.array(z.object({
      tag: z.enum(['h1', 'h2', 'h3']).describe('Header tag'),
      text: z.string().describe('Header text'),
      notes: z.string().optional().describe('Notes about what to cover'),
      isNew: z.boolean().describe('Is this a new section not in competitor content'),
    })).describe('Complete article outline'),
    
    keyPoints: z.array(z.string()).describe('Key points to cover that competitor missed'),
    
    suggestedWordCount: z.number().describe('Suggested total word count'),
    suggestedImages: z.number().describe('Suggested number of images'),
    
    uniqueValueProposition: z.string().describe('What makes this content better than competitor'),
  });

  // Build competitor structure summary
  const competitorStructure = competitorData.headings
    ?.map(h => `${h.tag.toUpperCase()}: ${h.text}`)
    .join('\n') || 'No headings found';

  const gapsToFill = gapAnalysis?.gaps
    ?.map(g => `- ${g.topic} (${g.importance})`)
    .join('\n') || 'No specific gaps identified';

  const prompt = `Create a superior content outline using the "Skyscraper" technique.

TARGET KEYWORD: ${targetKeyword}

COMPETITOR STRUCTURE:
${competitorStructure}

COMPETITOR METRICS:
- Word count: ${competitorData.wordCount || 'Unknown'}
- Images: ${competitorData.imageCount || 0}
- Videos: ${competitorData.videoCount || 0}

GAPS TO FILL:
${gapsToFill}

Create an outline that:
1. Covers everything the competitor covers
2. Adds the missing topics (gaps)
3. Has better structure and flow
4. Is more comprehensive
5. Will be more valuable to readers`;

  return generateStructuredResponse({
    system: `You are a content strategist creating "Skyscraper" content outlines.
Your goal is to create content that is definitively better than the competitor.
Be comprehensive but focused. Quality over quantity.`,
    prompt,
    schema,
    temperature: 0.6,
    operation: 'COMPETITOR_ANALYSIS',
    metadata: { action: 'skyscraper_outline', keyword: targetKeyword },
  });
}

/**
 * Generate a brief AI summary of a competitor page
 * 
 * @param {string} content - Page content
 * @param {string} title - Page title
 * @returns {Promise<string>} Brief summary
 */
export async function generateCompetitorSummary(content, title) {
  const schema = z.object({
    summary: z.string().describe('Brief 2-3 sentence summary of what the page covers'),
    mainTopics: z.array(z.string()).max(5).describe('Top 5 topics covered'),
    contentQuality: z.enum(['low', 'medium', 'high']).describe('Overall content quality'),
  });

  const result = await generateStructuredResponse({
    system: 'Provide a brief, objective summary of web content.',
    prompt: `Summarize this page:\n\nTitle: ${title}\n\nContent:\n${content.slice(0, 10000)}`,
    schema,
    temperature: 0.3,
    operation: 'COMPETITOR_ANALYSIS',
    metadata: { action: 'summary' },
  });

  return result;
}

export default {
  analyzeCompetitorTopics,
  identifyContentGaps,
  generateSkyscraperOutline,
  generateCompetitorSummary,
};
