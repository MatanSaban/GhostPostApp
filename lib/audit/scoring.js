/**
 * Audit Scoring Engine
 *
 * Calculates the overall health score and per-category scores.
 *
 * Scoring Algorithm (deduction-based, starts at 100):
 * - Critical / Error:  -10 points each
 * - Warning:           -3 points each
 * - Notice / Info:     -1 point each
 * - Passed:            no deduction (0)
 *
 * Categories & Weights:
 * - Technical (35%): SEO, security headers, mobile HTML, robots, sitemap
 * - Performance (30%): CWV, page speed, resource optimization
 * - Visual (15%): AI-detected UI/UX issues
 * - Accessibility (20%): WCAG violations detected by Axe-core
 *
 * Score is clamped to 0–100.
 */

const CATEGORY_WEIGHTS = {
  technical: 0.35,
  performance: 0.30,
  visual: 0.15,
  accessibility: 0.20,
};

const SEVERITY_DEDUCTIONS = {
  error: 10,
  warning: 3,
  notice: 1,
  info: 1,
  passed: 0,
};

/**
 * Calculate audit scores from a flat issues array
 *
 * @param {Array<{ type: string, severity: string }>} issues
 * @returns {{ score: number, categoryScores: { technical: number, performance: number, visual: number } }}
 */
export function calculateAuditScore(issues) {
  // Bucket issues by category
  const buckets = {
    technical: [],
    performance: [],
    visual: [],
    accessibility: [],
  };

  for (const issue of issues) {
    const bucket = buckets[issue.type];
    if (bucket) {
      bucket.push(issue);
    } else {
      // Unknown type → treat as technical
      buckets.technical.push(issue);
    }
  }

  // Calculate per-category scores
  const categoryScores = {};
  for (const [name, bucket] of Object.entries(buckets)) {
    let score = 100;
    for (const issue of bucket) {
      const deduction = SEVERITY_DEDUCTIONS[issue.severity] || 0;
      score -= deduction;
    }
    categoryScores[name] = Math.max(0, Math.min(100, Math.round(score)));
  }

  // Weighted overall score
  let overallScore = 0;
  for (const [name, weight] of Object.entries(CATEGORY_WEIGHTS)) {
    overallScore += (categoryScores[name] ?? 100) * weight;
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(overallScore))),
    categoryScores,
  };
}
