/**
 * Audit Issue Aggregation Utilities
 *
 * Groups audit issues by their message key (type) and counts occurrences
 * across all scanned pages, enabling drill-down from aggregated view.
 */

// Source priority for sorting within same severity
const SOURCE_PRIORITY = {
  html: 0,
  playwright: 1,
  psi: 2,
  axe: 3,
  'ai-vision': 4,
  system: 5,
  fetch: 6,
};

/**
 * Aggregate issues by message key within a category
 *
 * @param {Array} issues - All audit issues
 * @param {string} category - Category filter: 'technical' | 'performance' | 'visual'
 * @returns {Array<{ key, message, severity, source, suggestion, details, count, urls, device }>}
 */
export function aggregateIssuesByCategory(issues, category) {
  const categoryIssues = issues.filter((i) => i.type === category);
  return aggregateIssues(categoryIssues);
}

/**
 * Aggregate a list of issues by message key
 *
 * Groups issues with the same message together, collecting all unique
 * affected URLs and counting total occurrences.
 *
 * Sorting: errors > warnings > info > passed; within severity, by source priority
 *
 * @param {Array} issues
 * @returns {Array<{ key, message, severity, source, suggestion, details, count, urls, device }>}
 */
export function aggregateIssues(issues) {
  const groups = new Map();

  for (const issue of issues) {
    const key = issue.message || 'unknown';

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        message: issue.message,
        severity: issue.severity,
        type: issue.type,
        source: issue.source || null,
        suggestion: issue.suggestion || null,
        details: issue.details || null,
        device: issue.device || null,
        count: 0,
        urls: [],
      });
    }

    const group = groups.get(key);
    group.count++;

    if (issue.url && !group.urls.includes(issue.url)) {
      group.urls.push(issue.url);
    }

    // Keep the "worst" severity if mixed
    const severityRank = { error: 0, warning: 1, info: 2, passed: 3 };
    if ((severityRank[issue.severity] ?? 4) < (severityRank[group.severity] ?? 4)) {
      group.severity = issue.severity;
    }

    // Merge device info: if different devices appear, it's "both"
    if (issue.device) {
      if (!group.device) {
        group.device = issue.device;
      } else if (group.device !== issue.device && group.device !== 'both') {
        group.device = 'both';
      }
    }
  }

  // Sort: errors first, then warnings, info, passed.
  // Within same severity: sort by source (html → browser → pagespeed → ai-vision → system → fetch)
  const result = Array.from(groups.values());
  result.sort((a, b) => {
    const severityOrder = { error: 0, warning: 1, info: 2, passed: 3 };
    const sevDiff = (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4);
    if (sevDiff !== 0) return sevDiff;

    // Within same severity, sort by source priority
    const srcA = SOURCE_PRIORITY[a.source] ?? 99;
    const srcB = SOURCE_PRIORITY[b.source] ?? 99;
    return srcA - srcB;
  });

  return result;
}

/**
 * Get issues for a specific issue key (drill-down)
 *
 * @param {Array} issues - All audit issues
 * @param {string} issueKey - The message key to filter by
 * @returns {Array} Matching issues
 */
export function getIssuesByKey(issues, issueKey) {
  return issues.filter((i) => i.message === issueKey);
}

/**
 * Get pageResults that are affected by a specific issue key
 *
 * @param {Array} issues - All audit issues
 * @param {Array} pageResults - All page results
 * @param {string} issueKey - The message key to filter by
 * @returns {Array} Matching page results
 */
export function getAffectedPages(issues, pageResults, issueKey) {
  const affectedUrls = new Set(
    issues
      .filter((i) => i.message === issueKey)
      .map((i) => i.url)
      .filter(Boolean)
  );

  if (affectedUrls.size === 0) return pageResults; // Global issue → show all pages
  return pageResults.filter((pr) => affectedUrls.has(pr.url));
}

/**
 * Count issues by severity for a given set of issues
 */
export function countBySeverity(issues = []) {
  return {
    passed: issues.filter((i) => i.severity === 'passed').length,
    warnings: issues.filter((i) => i.severity === 'warning').length,
    errors: issues.filter((i) => i.severity === 'error').length,
    info: issues.filter((i) => i.severity === 'info').length,
  };
}
