/**
 * Google PageSpeed Insights Client
 *
 * Calls the PSI API to get Core Web Vitals and a performance score.
 * Works with or without an API key (rate-limited without one).
 *
 * Environment Variables:
 * - GOOGLE_PAGESPEED_API_KEY (optional) — increases rate limits
 *
 * Returns null gracefully if the API is unreachable.
 */

const PSI_API_URL = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

const PSI_MAX_RETRIES = 1;
const PSI_RETRY_DELAY = 3000; // 3s backoff

/**
 * Fetch PageSpeed Insights data for a URL (with retry)
 * @param {string} url - Page URL to analyze
 * @param {string} strategy - "mobile" or "desktop" (default: "mobile")
 * @returns {{ score, lcp, cls, inp, fcp, si, tbt, issues }|null}
 */
export async function getPageSpeedInsights(url, strategy = 'mobile') {
  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;

  const params = new URLSearchParams({
    url,
    strategy,
    category: 'performance',
  });
  if (apiKey) params.set('key', apiKey);

  for (let attempt = 0; attempt <= PSI_MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[PSI] Retry ${attempt}/${PSI_MAX_RETRIES} for ${url}`);
        await new Promise((r) => setTimeout(r, PSI_RETRY_DELAY * attempt));
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);

      const res = await fetch(`${PSI_API_URL}?${params}`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        console.warn(`[PSI] API returned ${res.status} for ${url} (attempt ${attempt + 1})`);
        if (attempt < PSI_MAX_RETRIES) continue;
        return null;
      }

      const data = await res.json();
      return parsePsiResponse(data, url);
    } catch (err) {
      console.warn(`[PSI] Request failed for ${url} (attempt ${attempt + 1}):`, err.message);
      if (attempt < PSI_MAX_RETRIES) continue;
      return null;
    }
  }
  return null;
}

// ─── Response Parser ────────────────────────────────────────

function parsePsiResponse(data, url) {
  const issues = [];
  const lighthouse = data.lighthouseResult;
  if (!lighthouse) return null;

  const audits = lighthouse.audits || {};

  // Overall performance score (0-1 → 0-100)
  const score = Math.round((lighthouse.categories?.performance?.score || 0) * 100);

  // Core Web Vitals
  const lcp = audits['largest-contentful-paint']?.numericValue
    ? Math.round(audits['largest-contentful-paint'].numericValue) / 1000
    : null;

  const cls = audits['cumulative-layout-shift']?.numericValue ?? null;

  const inp = audits['interaction-to-next-paint']?.numericValue
    ? Math.round(audits['interaction-to-next-paint'].numericValue)
    : null;

  const fcp = audits['first-contentful-paint']?.numericValue
    ? Math.round(audits['first-contentful-paint'].numericValue) / 1000
    : null;

  const si = audits['speed-index']?.numericValue
    ? Math.round(audits['speed-index'].numericValue) / 1000
    : null;

  const tbt = audits['total-blocking-time']?.numericValue
    ? Math.round(audits['total-blocking-time'].numericValue)
    : null;

  // ── Generate issues from scores ─────────────────────────

  // Overall PSI Score
  if (score < 50) {
    issues.push({ type: 'performance', severity: 'error', message: 'audit.issues.psiScoreLow', url, suggestion: 'audit.suggestions.improvePageSpeed', source: 'psi', details: `${score}/100` });
  } else if (score < 90) {
    issues.push({ type: 'performance', severity: 'warning', message: 'audit.issues.psiScoreModerate', url, suggestion: 'audit.suggestions.improvePageSpeed', source: 'psi', details: `${score}/100` });
  } else {
    issues.push({ type: 'performance', severity: 'passed', message: 'audit.issues.psiScoreGood', url, source: 'psi', details: `${score}/100` });
  }

  // LCP (Largest Contentful Paint) — Good: <2.5s, Needs Work: <4s, Poor: >4s
  if (lcp !== null) {
    if (lcp > 4) {
      issues.push({ type: 'performance', severity: 'error', message: 'audit.issues.lcpPoor', url, suggestion: 'audit.suggestions.improveLcp', source: 'psi', details: `${lcp.toFixed(1)}s` });
    } else if (lcp > 2.5) {
      issues.push({ type: 'performance', severity: 'warning', message: 'audit.issues.lcpNeedsWork', url, suggestion: 'audit.suggestions.improveLcp', source: 'psi', details: `${lcp.toFixed(1)}s` });
    } else {
      issues.push({ type: 'performance', severity: 'passed', message: 'audit.issues.lcpGood', url, source: 'psi', details: `${lcp.toFixed(1)}s` });
    }
  }

  // CLS (Cumulative Layout Shift) — Good: <0.1, Needs Work: <0.25, Poor: >0.25
  if (cls !== null) {
    if (cls > 0.25) {
      issues.push({ type: 'performance', severity: 'error', message: 'audit.issues.clsPoor', url, suggestion: 'audit.suggestions.improveCls', source: 'psi', details: `${cls.toFixed(3)}` });
    } else if (cls > 0.1) {
      issues.push({ type: 'performance', severity: 'warning', message: 'audit.issues.clsNeedsWork', url, suggestion: 'audit.suggestions.improveCls', source: 'psi', details: `${cls.toFixed(3)}` });
    } else {
      issues.push({ type: 'performance', severity: 'passed', message: 'audit.issues.clsGood', url, source: 'psi', details: `${cls.toFixed(3)}` });
    }
  }

  // INP (Interaction to Next Paint) — Good: <200ms, Needs Work: <500ms, Poor: >500ms
  if (inp !== null) {
    if (inp > 500) {
      issues.push({ type: 'performance', severity: 'error', message: 'audit.issues.inpPoor', url, suggestion: 'audit.suggestions.improveInp', source: 'psi', details: `${inp}ms` });
    } else if (inp > 200) {
      issues.push({ type: 'performance', severity: 'warning', message: 'audit.issues.inpNeedsWork', url, suggestion: 'audit.suggestions.improveInp', source: 'psi', details: `${inp}ms` });
    } else {
      issues.push({ type: 'performance', severity: 'passed', message: 'audit.issues.inpGood', url, source: 'psi', details: `${inp}ms` });
    }
  }

  return { score, lcp, cls, inp, fcp, si, tbt, issues };
}
