/**
 * Audit Scoring Engine
 *
 * Calculates the overall health score and per-category scores.
 *
 * Scoring Algorithm:
 *
 * Ratio-based categories (technical, performance, accessibility):
 *   score = ((passed × 100) + (warnings × 30)) / (totalChecks × 100) × 100
 *   Where totalChecks = passed + warnings + errors (info is excluded from
 *   the ratio so notices don't dilute pass/fail signal).
 *
 * Deduction-based categories (visual): diminishing-returns penalty
 *   penalty = (errors × 0.3) + (warnings × 0.1) + (info × 0.03)
 *   score   = round(100 / (1 + penalty))
 *   The shape ensures one error doesn't tank the score, but many do.
 *
 * Categories with no data (no checks run) return null and are excluded
 * from the weighted average. A category that legitimately scores 0
 * (all checks failed) is INCLUDED so the overall reflects that failure.
 *
 * Weights: Technical 35%, Performance 30%, Accessibility 20%, Visual 15%
 */

const CATEGORY_WEIGHTS = {
  technical: 0.35,
  performance: 0.30,
  visual: 0.15,
  accessibility: 0.20,
};

// Categories where checks produce "passed" severity items → ratio-based
const RATIO_CATEGORIES = new Set(['technical', 'performance', 'accessibility']);

/**
 * Calculate audit scores from a flat issues array.
 *
 * @param {Array<{ type: string, severity: string }>} issues
 * @returns {{ score: number, categoryScores: { technical: number, performance: number, visual: number, accessibility: number } }}
 */
export function calculateAuditScore(issues) {
  const categories = ['technical', 'performance', 'visual', 'accessibility'];
  const categoryScores = {};

  for (const cat of categories) {
    const ci = issues.filter(i => i.type === cat);

    const errors   = ci.filter(i => i.severity === 'error').length;
    const warnings = ci.filter(i => i.severity === 'warning').length;
    const passed   = ci.filter(i => i.severity === 'passed').length;
    const info     = ci.filter(i => i.severity === 'info' || i.severity === 'notice').length;

    const total = errors + warnings + passed + info;

    if (total === 0) {
      // No issues: ratio-based categories = null (no data), deduction-based = 100 (no violations)
      categoryScores[cat] = RATIO_CATEGORIES.has(cat) ? null : 100;
      continue;
    }

    if (RATIO_CATEGORIES.has(cat)) {
      // Ratio-based: reward passed, partial credit for warnings, no credit for errors
      const checkCount = passed + warnings + errors; // info excluded from ratio
      if (checkCount === 0) { categoryScores[cat] = null; continue; }
      const maxPts = checkCount * 100;
      const earned = (passed * 100) + (warnings * 30);
      categoryScores[cat] = Math.round(Math.min(100, (earned / maxPts) * 100));
    } else {
      // Deduction-based (visual, accessibility): diminishing returns
      // penalty grows with issue count but score never drops too fast
      const penalty = errors * 0.3 + warnings * 0.1 + info * 0.03;
      categoryScores[cat] = Math.round(100 / (1 + penalty));
    }
  }

  // Weighted overall - include every category with data, including ones that
  // scored 0. Excluding zero-score categories (the previous behavior) caused
  // the overall to inflate when a category was all-error.
  let weightedSum = 0;
  let totalWeight = 0;
  for (const [name, weight] of Object.entries(CATEGORY_WEIGHTS)) {
    const s = categoryScores[name];
    if (s != null) {
      weightedSum += s * weight;
      totalWeight += weight;
    }
  }

  const score = totalWeight > 0
    ? Math.max(0, Math.min(100, Math.round(weightedSum / totalWeight)))
    : 0;

  return { score, categoryScores };
}
