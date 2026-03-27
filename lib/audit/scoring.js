/**
 * Audit Scoring Engine
 *
 * Calculates the overall health score and per-category scores.
 *
 * Scoring Algorithm:
 *
 * For ratio-based categories (technical, performance) that have "passed" checks:
 *   score = (passed × 100  +  warnings × 30) / (totalChecks × 100) × 100
 *   Where totalChecks = passed + warnings + errors
 *
 * For deduction-based categories (visual, accessibility) that have no "passed" checks:
 *   score = 100 − (errors × 15  +  warnings × 7  +  info × 2)
 *   Clamped to 0–100. 0 issues = 100 (no violations found = good).
 *
 * Categories with zero issues of any kind score 0 (no data).
 *
 * Overall score = weighted average of non-zero categories.
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
      // No issues: ratio-based categories = 0 (no data), deduction-based = 100 (no violations)
      categoryScores[cat] = RATIO_CATEGORIES.has(cat) ? 0 : 100;
      continue;
    }

    if (RATIO_CATEGORIES.has(cat)) {
      // Ratio-based: reward passed, partial credit for warnings, no credit for errors
      const checkCount = passed + warnings + errors; // info excluded from ratio
      if (checkCount === 0) { categoryScores[cat] = 0; continue; }
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

  // Weighted overall - only include categories that have data
  let weightedSum = 0;
  let totalWeight = 0;
  for (const [name, weight] of Object.entries(CATEGORY_WEIGHTS)) {
    const s = categoryScores[name];
    if (s != null && s !== 0) {
      weightedSum += s * weight;
      totalWeight += weight;
    }
  }

  const score = totalWeight > 0
    ? Math.max(0, Math.min(100, Math.round(weightedSum / totalWeight)))
    : 0;

  return { score, categoryScores };
}
