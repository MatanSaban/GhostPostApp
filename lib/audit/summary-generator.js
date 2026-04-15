/**
 * AI Audit Summary Generator
 *
 * Generates a concise, actionable summary of audit findings
 * using Gemini 3.1 Pro. The summary highlights key wins,
 * critical issues, and top recommendations.
 */

import { generateText } from 'ai';
import { google } from '@/lib/ai/vertex-provider.js';
import { logAIUsage } from '@/lib/ai/credits.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const MODEL = 'gemini-2.5-pro';

// Load English dictionary once for resolving i18n keys
let enDict = null;
function getEnDict() {
  if (enDict) return enDict;
  try {
    const raw = readFileSync(join(process.cwd(), 'i18n/dictionaries/en.json'), 'utf-8');
    enDict = JSON.parse(raw);
  } catch {
    enDict = {};
  }
  return enDict;
}

/**
 * Resolve an i18n key like "audit.issues.noCanonical" → English text.
 * If not found, humanize the key (strip prefix, add spaces).
 */
function resolveMessage(msg) {
  if (!msg) return '';
  // If it doesn't look like an i18n key, return as-is
  if (!msg.includes('.')) return msg;

  const dict = getEnDict();
  const parts = msg.split('.');
  let value = dict;
  for (const part of parts) {
    if (value && typeof value === 'object' && part in value) {
      value = value[part];
    } else {
      value = null;
      break;
    }
  }
  if (typeof value === 'string') return value;

  // For axe IDs like "a11y.image-alt" - humanize the last segment
  const lastPart = parts[parts.length - 1];
  return lastPart
    .replace(/([A-Z])/g, ' $1')
    .replace(/[-_]/g, ' ')
    .replace(/^\s+/, '')
    .toLowerCase()
    .replace(/^./, c => c.toUpperCase());
}

const SYSTEM_PROMPT = `You are a professional SEO consultant writing a concise audit summary for a website owner.

Given the audit data (score, issues, category scores, pages scanned), write a clear summary in English that:

1. Opens with the overall health assessment (1 sentence with the score)
2. Lists the top 2-3 critical issues that need immediate attention
3. Highlights 1-2 positive findings (things done well)
4. Ends with a prioritized action plan (2-3 bullet points)

RULES:
- Keep it under 300 words total
- Use plain language a non-technical business owner can understand
- Be specific - reference actual issue descriptions and metrics
- NEVER include i18n keys or code references like "audit.issues.xxx" - only use the human-readable descriptions provided
- Format with short paragraphs and bullet points (markdown)
- Do NOT use greetings or sign-offs
- Write in a professional but friendly tone
- The scoring uses a ratio-based system: passed checks earn full credit, warnings earn partial, errors earn nothing
- A score of 0 in a category means no checks were performed for that category (not necessarily bad)

ACCURACY - CRITICAL:
- You MUST use the EXACT scores and numbers provided in the data. Never round, approximate, or change any number.
- If the overall score is 72, write "72/100" - NOT "70/100", "about 70", or "around 72".
- The same applies to every category score: use the exact number given.
- The same applies to issue counts: use the exact numbers provided for errors, warnings, and passed checks.
- Double-check every number in your response against the input data before finalizing.`;

/**
 * Generate an AI-powered audit summary
 *
 * @param {Array} issues - Deduplicated audit issues
 * @param {number} score - Overall health score (0-100)
 * @param {Object} categoryScores - { technical, performance, visual, accessibility }
 * @param {string} siteUrl - The audited site URL
 * @param {number} pagesScanned - Number of pages scanned
 * @returns {string|null} - Generated summary text, or null on failure
 */
export async function generateAuditSummary(issues, score, categoryScores, siteUrl, pagesScanned) {
  if (!issues || issues.length === 0) return null;

  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');
  const passed = issues.filter(i => i.severity === 'passed');

  const fmtIssue = (i) => {
    const msg = resolveMessage(i.message);
    const detail = i.details && !i.details.startsWith('{') ? ` (${i.details})` : '';
    const url = i.url ? ` [${i.url}]` : '';
    return `- ${msg}${detail}${url}`;
  };

  const prompt = `Audit results for ${siteUrl}:

**Overall Score: ${score}/100**
- Technical SEO: ${categoryScores?.technical ?? 'N/A'}/100
- Performance: ${categoryScores?.performance ?? 'N/A'}/100
- Visual & UX: ${categoryScores?.visual ?? 'N/A'}/100
- Accessibility: ${categoryScores?.accessibility ?? 'N/A'}/100
- Pages Scanned: ${pagesScanned}

**Critical Errors (${errors.length}):**
${errors.slice(0, 10).map(fmtIssue).join('\n') || '- None'}

**Warnings (${warnings.length}):**
${warnings.slice(0, 10).map(fmtIssue).join('\n') || '- None'}

**Passed Checks (${passed.length}):**
${passed.slice(0, 8).map(i => `- ${resolveMessage(i.message)}`).join('\n') || '- None'}

Write a concise summary.`;

  try {
    const result = await generateText({
      model: google(MODEL),
      system: SYSTEM_PROMPT,
      prompt,
      temperature: 0.1,
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
