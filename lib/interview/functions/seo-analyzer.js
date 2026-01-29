/**
 * SEO Analyzer
 * 
 * Analyzes a website for SEO issues and opportunities.
 * Uses both rule-based checks and AI analysis.
 */

import { generateStructuredResponse } from '@/lib/ai/gemini.js';
import { z } from 'zod';

/**
 * SEO Issue severity levels
 */
export const SEO_SEVERITY = {
  CRITICAL: 'critical',
  WARNING: 'warning',
  INFO: 'info',
  GOOD: 'good',
};

/**
 * Analyze page HTML for SEO issues
 * 
 * @param {string} html - The HTML content of the page
 * @param {string} url - The page URL
 * @returns {Object} SEO analysis results
 */
export function analyzePageSEO(html, url) {
  const issues = [];
  const checks = [];
  
  // 1. Title tag check
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : null;
  
  if (!title) {
    issues.push({
      type: 'missing_title',
      severity: SEO_SEVERITY.CRITICAL,
      message: 'Page is missing a title tag',
      recommendation: 'Add a unique, descriptive title tag (50-60 characters)',
    });
    checks.push({ check: 'title', status: 'fail' });
  } else if (title.length < 30) {
    issues.push({
      type: 'short_title',
      severity: SEO_SEVERITY.WARNING,
      message: `Title is too short (${title.length} chars)`,
      recommendation: 'Title should be 50-60 characters for optimal SEO',
      value: title,
    });
    checks.push({ check: 'title', status: 'warning', value: title });
  } else if (title.length > 70) {
    issues.push({
      type: 'long_title',
      severity: SEO_SEVERITY.WARNING,
      message: `Title is too long (${title.length} chars)`,
      recommendation: 'Title should be 50-60 characters to avoid truncation',
      value: title,
    });
    checks.push({ check: 'title', status: 'warning', value: title });
  } else {
    checks.push({ check: 'title', status: 'pass', value: title });
  }
  
  // 2. Meta description check
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i) ||
                    html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
  const description = descMatch ? descMatch[1].trim() : null;
  
  if (!description) {
    issues.push({
      type: 'missing_description',
      severity: SEO_SEVERITY.CRITICAL,
      message: 'Page is missing a meta description',
      recommendation: 'Add a compelling meta description (150-160 characters)',
    });
    checks.push({ check: 'meta_description', status: 'fail' });
  } else if (description.length < 100) {
    issues.push({
      type: 'short_description',
      severity: SEO_SEVERITY.WARNING,
      message: `Meta description is too short (${description.length} chars)`,
      recommendation: 'Description should be 150-160 characters',
      value: description,
    });
    checks.push({ check: 'meta_description', status: 'warning', value: description });
  } else if (description.length > 170) {
    issues.push({
      type: 'long_description',
      severity: SEO_SEVERITY.WARNING,
      message: `Meta description is too long (${description.length} chars)`,
      recommendation: 'Description should be 150-160 characters to avoid truncation',
      value: description,
    });
    checks.push({ check: 'meta_description', status: 'warning', value: description });
  } else {
    checks.push({ check: 'meta_description', status: 'pass', value: description });
  }
  
  // 3. H1 tag check
  const h1Matches = html.match(/<h1[^>]*>([^<]*)<\/h1>/gi);
  const h1Count = h1Matches ? h1Matches.length : 0;
  
  if (h1Count === 0) {
    issues.push({
      type: 'missing_h1',
      severity: SEO_SEVERITY.CRITICAL,
      message: 'Page is missing an H1 heading',
      recommendation: 'Add exactly one H1 tag that describes the page content',
    });
    checks.push({ check: 'h1', status: 'fail' });
  } else if (h1Count > 1) {
    issues.push({
      type: 'multiple_h1',
      severity: SEO_SEVERITY.WARNING,
      message: `Page has ${h1Count} H1 tags (should have 1)`,
      recommendation: 'Use only one H1 tag per page for optimal SEO',
    });
    checks.push({ check: 'h1', status: 'warning', count: h1Count });
  } else {
    checks.push({ check: 'h1', status: 'pass' });
  }
  
  // 4. Open Graph tags check
  const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*>/i);
  const ogDescription = html.match(/<meta[^>]*property=["']og:description["'][^>]*>/i);
  const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["']/i);
  
  if (!ogTitle || !ogDescription) {
    issues.push({
      type: 'missing_og_tags',
      severity: SEO_SEVERITY.WARNING,
      message: 'Missing Open Graph tags for social sharing',
      recommendation: 'Add og:title, og:description, and og:image for better social media previews',
    });
    checks.push({ check: 'open_graph', status: 'warning' });
  } else {
    checks.push({ check: 'open_graph', status: 'pass' });
  }
  
  // 5. Canonical URL check
  const canonical = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["']/i);
  
  if (!canonical) {
    issues.push({
      type: 'missing_canonical',
      severity: SEO_SEVERITY.INFO,
      message: 'Page is missing a canonical URL',
      recommendation: 'Add a canonical tag to prevent duplicate content issues',
    });
    checks.push({ check: 'canonical', status: 'warning' });
  } else {
    checks.push({ check: 'canonical', status: 'pass', value: canonical[1] });
  }
  
  // 6. Image alt tags check
  const images = html.match(/<img[^>]*>/gi) || [];
  const imagesWithoutAlt = images.filter(img => !img.includes('alt=') || img.match(/alt=["']\s*["']/i));
  
  if (imagesWithoutAlt.length > 0) {
    issues.push({
      type: 'missing_alt_tags',
      severity: SEO_SEVERITY.WARNING,
      message: `${imagesWithoutAlt.length} of ${images.length} images are missing alt text`,
      recommendation: 'Add descriptive alt text to all images for accessibility and SEO',
    });
    checks.push({ check: 'image_alt', status: 'warning', missing: imagesWithoutAlt.length, total: images.length });
  } else if (images.length > 0) {
    checks.push({ check: 'image_alt', status: 'pass', total: images.length });
  }
  
  // 7. HTTPS check
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== 'https:') {
    issues.push({
      type: 'not_https',
      severity: SEO_SEVERITY.CRITICAL,
      message: 'Website is not using HTTPS',
      recommendation: 'Enable HTTPS for security and SEO ranking benefits',
    });
    checks.push({ check: 'https', status: 'fail' });
  } else {
    checks.push({ check: 'https', status: 'pass' });
  }
  
  // 8. Mobile viewport check
  const viewport = html.match(/<meta[^>]*name=["']viewport["'][^>]*>/i);
  
  if (!viewport) {
    issues.push({
      type: 'missing_viewport',
      severity: SEO_SEVERITY.CRITICAL,
      message: 'Page is missing a viewport meta tag',
      recommendation: 'Add viewport meta tag for mobile responsiveness',
    });
    checks.push({ check: 'viewport', status: 'fail' });
  } else {
    checks.push({ check: 'viewport', status: 'pass' });
  }
  
  // 9. Language attribute check
  const htmlLang = html.match(/<html[^>]*lang=["']([^"']*)["']/i);
  
  if (!htmlLang) {
    issues.push({
      type: 'missing_lang',
      severity: SEO_SEVERITY.INFO,
      message: 'HTML lang attribute is missing',
      recommendation: 'Add lang attribute to the <html> tag for accessibility',
    });
    checks.push({ check: 'lang_attribute', status: 'warning' });
  } else {
    checks.push({ check: 'lang_attribute', status: 'pass', value: htmlLang[1] });
  }
  
  // 10. Structured data check
  const jsonLd = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>/i);
  
  if (!jsonLd) {
    issues.push({
      type: 'missing_structured_data',
      severity: SEO_SEVERITY.INFO,
      message: 'No structured data (JSON-LD) found',
      recommendation: 'Add structured data for rich search results',
    });
    checks.push({ check: 'structured_data', status: 'warning' });
  } else {
    checks.push({ check: 'structured_data', status: 'pass' });
  }
  
  // Calculate score
  const criticalCount = issues.filter(i => i.severity === SEO_SEVERITY.CRITICAL).length;
  const warningCount = issues.filter(i => i.severity === SEO_SEVERITY.WARNING).length;
  const passCount = checks.filter(c => c.status === 'pass').length;
  const totalChecks = checks.length;
  
  // Score formula: base 100, -15 for each critical, -5 for each warning
  const score = Math.max(0, 100 - (criticalCount * 15) - (warningCount * 5));
  
  return {
    url,
    score,
    checks,
    issues,
    summary: {
      critical: criticalCount,
      warnings: warningCount,
      passed: passCount,
      total: totalChecks,
    },
    meta: {
      title,
      description,
      ogImage: ogImage ? ogImage[1] : null,
      canonical: canonical ? canonical[1] : null,
      language: htmlLang ? htmlLang[1] : null,
    },
  };
}

/**
 * Use AI to analyze SEO and provide recommendations
 * 
 * @param {Object} pageData - Data from basic analysis
 * @param {string} htmlContent - HTML content for deeper analysis
 * @returns {Promise<Object>} AI SEO recommendations
 */
export async function analyzeWithAI(pageData, htmlContent) {
  const schema = z.object({
    overallAssessment: z.string().describe('A brief overall assessment of the website SEO (2-3 sentences)'),
    topPriorities: z.array(z.object({
      issue: z.string().describe('The SEO issue'),
      impact: z.enum(['high', 'medium', 'low']).describe('The impact level'),
      recommendation: z.string().describe('Specific recommendation to fix'),
      estimatedEffort: z.enum(['quick', 'moderate', 'significant']).describe('Effort to fix'),
    })).describe('Top 3-5 priority SEO issues to fix'),
    contentOpportunities: z.array(z.string()).describe('Up to 3 content opportunities for this website'),
    technicalIssues: z.array(z.string()).describe('Up to 3 technical SEO issues found'),
    competitiveAdvantages: z.array(z.string()).describe('Up to 3 current SEO strengths to leverage'),
    quickWins: z.array(z.string()).describe('Up to 3 easy fixes that can be done quickly'),
  });

  // Truncate HTML for AI analysis
  const truncatedHtml = htmlContent.substring(0, 8000);
  
  const prompt = `Analyze this website for SEO and provide actionable recommendations.

URL: ${pageData.url}

Current SEO Status:
- Score: ${pageData.score}/100
- Critical Issues: ${pageData.summary.critical}
- Warnings: ${pageData.summary.warnings}

Meta Information:
- Title: ${pageData.meta.title || 'Missing'}
- Description: ${pageData.meta.description || 'Missing'}
- Language: ${pageData.meta.language || 'Not specified'}

Issues Found:
${pageData.issues.map(i => `- [${i.severity.toUpperCase()}] ${i.message}`).join('\n')}

HTML Content (truncated):
${truncatedHtml}

Provide a comprehensive SEO analysis with actionable recommendations.`;

  try {
    const result = await generateStructuredResponse({
      system: 'You are an expert SEO consultant. Analyze websites and provide specific, actionable recommendations. Focus on high-impact improvements that can be implemented. Limit each list to 3 items maximum.',
      prompt,
      schema,
      temperature: 0.4,
    });

    // Trim arrays to prevent overflow (AI sometimes returns more than requested)
    const trimmedResult = {
      ...result,
      topPriorities: (result.topPriorities || []).slice(0, 5),
      contentOpportunities: (result.contentOpportunities || []).slice(0, 3),
      technicalIssues: (result.technicalIssues || []).slice(0, 3),
      competitiveAdvantages: (result.competitiveAdvantages || []).slice(0, 3),
      quickWins: (result.quickWins || []).slice(0, 3),
    };

    return {
      success: true,
      analysis: trimmedResult,
    };
  } catch (error) {
    console.error('[SEO Analyzer] AI error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Comprehensive SEO analysis combining rule-based and AI analysis
 * 
 * @param {string} html - HTML content
 * @param {string} url - Page URL
 * @param {Object} sitemapData - Optional sitemap data
 * @returns {Promise<Object>} Complete SEO analysis
 */
export async function analyzeSEO(html, url, sitemapData = null) {
  console.log('[SEO Analyzer] Starting analysis for:', url);
  
  // Run rule-based analysis
  const basicAnalysis = analyzePageSEO(html, url);
  
  // Run AI analysis
  const aiAnalysis = await analyzeWithAI(basicAnalysis, html);
  
  // Combine results
  const result = {
    url,
    analyzedAt: new Date().toISOString(),
    score: basicAnalysis.score,
    summary: basicAnalysis.summary,
    meta: basicAnalysis.meta,
    issues: basicAnalysis.issues,
    checks: basicAnalysis.checks,
    aiAnalysis: aiAnalysis.success ? aiAnalysis.analysis : null,
    sitemap: sitemapData ? {
      found: sitemapData.found,
      urlCount: sitemapData.urls?.length || 0,
    } : null,
  };
  
  console.log('[SEO Analyzer] Analysis complete. Score:', result.score);
  
  return result;
}
