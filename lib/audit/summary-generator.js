/**
 * AI Audit Summary Generator
 *
 * Generates a concise, actionable summary of audit findings
 * using Gemini 2.0 Flash. The summary highlights key wins,
 * critical issues, and top recommendations.
 */

import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
import { logAIUsage } from '@/lib/ai/credits.js';

const MODEL = 'gemini-2.0-flash';

const SYSTEM_PROMPT = `You are a professional SEO consultant writing a concise audit summary for a website owner.

Given the audit data (score, issues, category scores, pages scanned), write a clear summary in English that:

1. Opens with the overall health assessment (1 sentence with the score)
2. Lists the top 2-3 critical issues that need immediate attention
3. Highlights 1-2 positive findings (things done well)
4. Ends with a prioritized action plan (2-3 bullet points)

RULES:
- Keep it under 300 words total
- Use plain language a non-technical business owner can understand
- Be specific — reference actual issue messages and metrics
- Format with short paragraphs and bullet points (markdown)
- Do NOT use greetings or sign-offs
- Write in a professional but friendly tone`;

/**
 * Generate an AI-powered audit summary
 *
 * @param {Array} issues - Deduplicated audit issues
 * @param {number} score - Overall health score (0-100)
 * @param {Object} categoryScores - { technical, performance, visual }
 * @param {string} siteUrl - The audited site URL
 * @param {number} pagesScanned - Number of pages scanned
 * @returns {string|null} - Generated summary text, or null on failure
 */
export async function generateAuditSummary(issues, score, categoryScores, siteUrl, pagesScanned) {
  if (!issues || issues.length === 0) return null;

  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');
  const passed = issues.filter(i => i.severity === 'passed');

  const prompt = `Audit results for ${siteUrl}:

**Overall Score: ${score}/100**
- Technical SEO: ${categoryScores?.technical ?? 'N/A'}/100
- Performance: ${categoryScores?.performance ?? 'N/A'}/100
- Visual & UX: ${categoryScores?.visual ?? 'N/A'}/100
- Pages Scanned: ${pagesScanned}

**Critical Errors (${errors.length}):**
${errors.slice(0, 10).map(i => `- ${i.message}${i.details ? ` (${i.details})` : ''}${i.url ? ` [${i.url}]` : ''}`).join('\n') || '- None'}

**Warnings (${warnings.length}):**
${warnings.slice(0, 10).map(i => `- ${i.message}${i.details ? ` (${i.details})` : ''}`).join('\n') || '- None'}

**Passed Checks (${passed.length}):**
${passed.slice(0, 8).map(i => `- ${i.message}`).join('\n') || '- None'}

Write a concise summary.`;

  try {
    const result = await generateText({
      model: google(MODEL),
      system: SYSTEM_PROMPT,
      prompt,
      temperature: 0.3,
      maxTokens: 600,
    });

    const usage = result.usage || {};
    logAIUsage({
      operation: 'SITE_AUDIT_SUMMARY',
      inputTokens: usage.promptTokens || 0,
      outputTokens: usage.completionTokens || 0,
      totalTokens: usage.totalTokens || 0,
      model: MODEL,
      metadata: { siteUrl, score },
    });

    return result.text?.trim() || null;
  } catch (err) {
    console.error('[SummaryGenerator] Failed:', err.message);
    return null;
  }
}
