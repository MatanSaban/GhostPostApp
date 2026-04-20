/**
 * Shared utilities for insight cards used across dashboard and agent page.
 */

import { FileText, TrendingUp, Search, Users, Wrench } from 'lucide-react';

// Insight types that can be fixed with AI
export const FIXABLE_INSIGHT_TYPES = new Set([
  'missingSeo',
  'keywordStrikeZone',
  'lowCtrForPosition',
  'cannibalization',
  'missingFeaturedImage',
  'insufficientContentImages',
  'aiPageMissingSchema',
  'aiAnswerableButNotConcise',
]);

// Category icons mapping
export const CATEGORY_ICONS = {
  CONTENT: FileText,
  TRAFFIC: TrendingUp,
  KEYWORDS: Search,
  COMPETITORS: Users,
  TECHNICAL: Wrench,
};

// Type colors for styling
export const TYPE_COLORS = {
  DISCOVERY: 'info',
  SUGGESTION: 'warning',
  ACTION: 'primary',
  ANALYSIS: 'neutral',
  ALERT: 'error',
};

// Categories and statuses
export const CATEGORIES = ['CONTENT', 'TRAFFIC', 'KEYWORDS', 'COMPETITORS', 'TECHNICAL'];
export const STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'EXECUTED', 'FAILED', 'EXPIRED', 'RESOLVED'];

// Priority order for sorting
export const PRIORITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

// Insight types that indicate positive/negative trends
export const POSITIVE_INSIGHT_TYPES = new Set(['trafficGrowth', 'aiTrafficGrowth', 'aiCitedByEngine']);
export const NEGATIVE_INSIGHT_TYPES = new Set(['trafficDrop', 'visitorsDrop', 'decliningPages', 'aiTrafficDrop']);

/**
 * Check if an insight type can be fixed with AI
 */
export function isFixableInsight(titleKey) {
  const match = titleKey?.match(/agent\.insights\.([\w.]+)\.title/);
  if (!match) return false;
  const baseType = match[1].split('.')[0];
  return FIXABLE_INSIGHT_TYPES.has(baseType);
}

/**
 * Extract the insight type from a title key
 */
export function getInsightType(titleKey) {
  const match = titleKey?.match(/agent\.insights\.([\w.]+)\.title/);
  if (!match) return null;
  return match[1].split('.')[0];
}

/**
 * Determine the display sentiment color for an insight.
 * Returns: 'positive' | 'warning' | 'severe' | 'neutral'
 */
export function getInsightSentiment(insight) {
  const insightType = insight.titleKey?.match(/agent\.insights\.(\w+)\.title/)?.[1];
  const direction = getInsightDirection(insight);

  // If actual change is exactly 0 → neutral/gray
  if (direction === 'equal') return 'neutral';

  // Positive insights → green (only when direction confirms it)
  if (POSITIVE_INSIGHT_TYPES.has(insightType)) {
    return direction === 'down' ? 'warning' : 'positive';
  }
  if (insight.type === 'DISCOVERY' && !NEGATIVE_INSIGHT_TYPES.has(insightType)) {
    return 'positive';
  }

  // Negative insights → orange or red based on severity
  if (NEGATIVE_INSIGHT_TYPES.has(insightType) || insight.priority === 'CRITICAL' || insight.type === 'ALERT') {
    const changeVal = Math.abs(resolveChangePercent(insight.data));
    // Severe threshold: >30% drop
    return changeVal > 30 ? 'severe' : 'warning';
  }

  // ACTION/SUGGESTION → orange
  if (insight.type === 'ACTION' || insight.type === 'SUGGESTION') return 'warning';

  return 'neutral';
}

/**
 * Determine the direction indicator for an insight.
 * Returns: 'up' | 'down' | 'equal' | null
 */
export function getInsightDirection(insight) {
  const d = insight.data;
  if (!d) return null;

  // Check numeric change values
  const changeKeys = ['visitorsChange', 'clicksChange', 'trafficChange', 'changePercent'];
  for (const key of changeKeys) {
    if (typeof d[key] === 'number') {
      if (d[key] > 0) return 'up';
      if (d[key] < 0) return 'down';
      return 'equal';
    }
  }

  // AI traffic insight format
  if (d.aiTraffic?.change !== undefined) {
    const change = d.aiTraffic.change;
    if (change > 0) return 'up';
    if (change < 0) return 'down';
    return 'equal';
  }

  return null;
}

/**
 * Get the change percentage from insight data
 */
export function resolveChangePercent(d) {
  if (!d) return 0;
  const changeKeys = ['visitorsChange', 'clicksChange', 'trafficChange', 'changePercent'];
  for (const key of changeKeys) {
    if (typeof d[key] === 'number') return d[key];
  }
  if (d.aiTraffic?.change !== undefined) return d.aiTraffic.change;
  return 0;
}

/**
 * Translate cannibalization reason from reasonKey/reasonParams or fall back to reason string.
 */
export function translateReason(issue, labels) {
  // New format: structured reasonKey + reasonParams
  if (issue.reasonKey && issue.reasonParams) {
    const { reasonKey, reasonParams } = issue;
    
    const keyMap = {
      detectedBySource: 'reasonDetectedBySource',
      prefixMatch: 'reasonPrefixMatch',
      titleH1Similarity: 'reasonTitleH1Similarity',
      querySignals: 'reasonQuerySignals',
      aiVerified: 'reasonAiVerified',
    };
    
    const templateKey = keyMap[reasonKey];
    const template = labels?.[templateKey];
    if (!template) return issue.reason || '';
    
    // For querySignals, translate individual signal names
    let params = { ...reasonParams };
    if (reasonKey === 'querySignals' && params.signals) {
      const signalLabels = {
        'impression split': labels?.signalImpressionSplit || 'Impression split',
        'position dance': labels?.signalPositionDance || 'Position dance',
        'CTR divergence': labels?.signalCtrDivergence || 'CTR divergence',
      };
      params.signals = params.signals.split(', ').map(s => signalLabels[s] || s).join(', ');
    }
    
    // Interpolate params into template
    return template.replace(/\{(\w+)\}/g, (match, key) => {
      return params[key] !== undefined ? params[key] : match;
    });
  }
  
  // Legacy format or AI-generated: use reason string directly
  return issue.reason || '';
}

/**
 * Resolves a translation key like "agent.insights.keywordStrikeZone.title"
 * and replaces {placeholders} with values from data.
 */
export function resolveTranslation(translations, titleKey, data = {}, locale) {
  const parts = titleKey.split('.');
  let value = translations;
  for (const part of parts) {
    value = value?.[part];
    if (!value) return titleKey;
  }
  if (typeof value !== 'string') return titleKey;

  const dateLocale = locale === 'he' ? 'he-IL' : 'en-US';

  // Helper to format date to localized string
  const formatDate = (dateStr) => {
    if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
      try { return new Date(dateStr).toLocaleDateString(dateLocale); } catch { return dateStr; }
    }
    return dateStr;
  };

  // Generate fallback period dates if missing (30-day comparison window)
  const getPeriodFallback = (key) => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 30);
    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - 30);

    const periods = {
      periodStart: start.toLocaleDateString(dateLocale),
      periodEnd: end.toLocaleDateString(dateLocale),
      comparePeriodStart: prevStart.toLocaleDateString(dateLocale),
      comparePeriodEnd: prevEnd.toLocaleDateString(dateLocale),
    };
    return periods[key];
  };

  return value.replace(/\{(\w+)\}/g, (match, key) => {
    let val = data[key];
    // Use fallback for period dates if not provided
    if (val === undefined) {
      val = getPeriodFallback(key);
    }
    if (val === undefined) return match;
    // Format dates
    if (['periodStart', 'periodEnd', 'comparePeriodStart', 'comparePeriodEnd'].includes(key)) {
      return formatDate(val);
    }
    // Format numbers
    if (typeof val === 'number') {
      return val.toLocaleString();
    }
    return val;
  });
}

/**
 * Check if an insight is fully fixed (all items applied)
 */
export function isInsightFullyFixed(insight) {
  // User explicitly resolved or action was executed — always treat as fixed
  if (insight.status === 'EXECUTED' || insight.status === 'RESOLVED') {
    return true;
  }
  
  const type = getInsightType(insight.titleKey);
  const data = insight.data;
  const results = insight.executionResult?.results || [];
  
  if (!data) return false;
  
  // For multi-item insights, check if all items are fixed
  if (type === 'missingSeo' || type === 'lowCtrForPosition') {
    const pages = data.pages || [];
    if (pages.length === 0) return false;
    const fixedCount = results.filter(r => r.status === 'fixed').length;
    return fixedCount >= pages.length;
  }
  
  if (type === 'cannibalization') {
    const issues = data.issues || [];
    if (issues.length === 0) return false;
    const fixedCount = results.filter(r => r.status === 'fixed').length;
    return fixedCount >= issues.length;
  }
  
  // Single-item insights are fixed if any result exists
  if (type === 'keywordStrikeZone' || type === 'aiPageMissingSchema' || type === 'aiAnswerableButNotConcise') {
    return results.some(r => r.status === 'fixed');
  }

  return false;
}

/**
 * Format time ago string
 */
export function getTimeAgo(dateStr, t = {}) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return (t.minutesAgo || '{n}m ago').replace('{n}', mins);
  const hours = Math.floor(mins / 60);
  if (hours < 24) return (t.hoursAgo || '{n}h ago').replace('{n}', hours);
  const days = Math.floor(hours / 24);
  return (t.daysAgo || '{n}d ago').replace('{n}', days);
}
