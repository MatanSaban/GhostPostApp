/**
 * Agent Fix Registry - single source of truth for which agent insights are
 * fixable, who fixes them, what they cost, and what platform capability is
 * required.
 *
 * Each entry:
 *   kind:                 'ai'   → AI button ("Fix with AI · N credits")
 *                         'free' → Free button ("Fix · 0 Ai-GCoins")
 *   handler:              Logical name of the handler in `lib/agent-fix.js`
 *                         (used by the dispatcher).
 *   credits:              For 'ai' entries - STATIC display price + preflight
 *                         floor. Even number, lower bound (real charging is
 *                         token-based). Ignored for 'free'.
 *   previewable:          'ai' only. true → preview phase shows AI suggestions
 *                         before user approves. false → generate + apply in
 *                         one shot.
 *   bulk:                 Per-row table layout in the UI (true) vs single
 *                         site-wide button (false).
 *   capability:           Optional. Name of a capability flag in
 *                         `lib/cms/capabilities.js`. If set, the fix is hidden
 *                         on platforms that don't expose that capability.
 *   reuses:               Optional. Internal handler this entry piggybacks on
 *                         (e.g. metaTitleTooShort reuses missingSeo's pipeline
 *                         restricted to the title field).
 *
 * Reclassification rule: if a `kind: 'free'` handler ever ends up calling
 * Gemini, move its registry entry to `kind: 'ai'` and set a credits price.
 * Never silently flip mid-session - UI labels follow the registry.
 */

export const AGENT_FIXERS = {
  // ─── AI fixes ────────────────────────────────────────────────────────

  missingSeo: {
    kind: 'ai', handler: 'missingSeo', credits: 3, previewable: true, bulk: true,
  },
  keywordStrikeZone: {
    kind: 'ai', handler: 'keywordStrikeZone', credits: 3, previewable: true, bulk: true,
  },
  lowCtrForPosition: {
    kind: 'ai', handler: 'lowCtrForPosition', credits: 3, previewable: true, bulk: true,
  },
  cannibalization: {
    kind: 'ai', handler: 'cannibalization', credits: 30, previewable: true, bulk: true,
  },
  missingFeaturedImage: {
    kind: 'ai', handler: 'missingFeaturedImage', credits: 8, previewable: true, bulk: true,
  },
  insufficientContentImages: {
    kind: 'ai', handler: 'insufficientContentImages', credits: 8, previewable: true, bulk: true,
  },
  aiPageMissingSchema: {
    kind: 'ai', handler: 'aiPageMissingSchema', credits: 4, previewable: true, bulk: true,
  },
  aiAnswerableButNotConcise: {
    kind: 'ai', handler: 'aiAnswerableButNotConcise', credits: 4, previewable: true, bulk: true,
  },

  // ─── New AI fixes ────────────────────────────────────────────────────

  // Meta-length variants reuse the missingSeo AI pipeline but only regenerate
  // the field that's out of bounds. Cheaper than full meta generation.
  metaTitleTooShort: {
    kind: 'ai', handler: 'metaLength', credits: 2, previewable: true, bulk: true,
    reuses: 'missingSeo', field: 'title',
  },
  metaTitleTooLong: {
    kind: 'ai', handler: 'metaLength', credits: 2, previewable: true, bulk: true,
    reuses: 'missingSeo', field: 'title',
  },
  metaDescTooShort: {
    kind: 'ai', handler: 'metaLength', credits: 2, previewable: true, bulk: true,
    reuses: 'missingSeo', field: 'description',
  },
  metaDescTooLong: {
    kind: 'ai', handler: 'metaLength', credits: 2, previewable: true, bulk: true,
    reuses: 'missingSeo', field: 'description',
  },

  // H1 fixes need to mutate the page body. WP plugin exposes manipulate_element;
  // Shopify products/pages allow body_html updates. capability gates the WP-only
  // visual-editor path; on Shopify we fall back to body_html string surgery.
  missingH1Tag: {
    kind: 'ai', handler: 'h1Fix', credits: 2, previewable: true, bulk: true,
  },
  multipleH1Tags: {
    kind: 'ai', handler: 'h1Fix', credits: 2, previewable: true, bulk: true,
  },

  // Content refresh - AI rewrites the body and bumps updated_at. Heavier than
  // SEO meta because we generate full content. Reuses cannibalization's
  // generateMergedContent pipeline restricted to one page.
  staleContent: {
    kind: 'ai', handler: 'contentRefresh', credits: 20, previewable: true, bulk: true,
  },
  decliningPages: {
    kind: 'ai', handler: 'contentRefresh', credits: 20, previewable: true, bulk: true,
  },
  contentWithoutTraffic: {
    kind: 'ai', handler: 'contentRefresh', credits: 20, previewable: true, bulk: true,
  },

  // New article creation. Same engine as content refresh but createPost instead
  // of updatePost. Drafts only - never auto-publishes.
  contentGaps: {
    kind: 'ai', handler: 'newArticle', credits: 25, previewable: true, bulk: true,
  },
  newKeywordOpportunities: {
    kind: 'ai', handler: 'newArticle', credits: 25, previewable: true, bulk: true,
  },

  // Unlinked keywords → AI proposes source pages + anchors and uses the
  // plugin's searchReplaceLinks (WP) or body_html replace (Shopify) to insert
  // internal links. capability gates the WP-only path.
  unlinkedKeywords: {
    kind: 'ai', handler: 'internalLinks', credits: 4, previewable: true, bulk: true,
  },

  // AI-citation gap - composes aiAnswerableButNotConcise + aiPageMissingSchema
  // into a single fix targeting the engine-gap page.
  aiEngineGap: {
    kind: 'ai', handler: 'aiEngineGap', credits: 6, previewable: true, bulk: false,
  },

  // ─── Free fixes (no AI, no credits) ──────────────────────────────────

  noindexDetected: {
    kind: 'free', handler: 'noindexClear', previewable: false, bulk: true,
    requiresConnection: true,
  },
  numericSlugSuffix: {
    kind: 'free', handler: 'slugSuffixCleanup', previewable: false, bulk: true,
    requiresConnection: true,
  },
  staleCompetitorScans: {
    kind: 'free', handler: 'rescanCompetitors', previewable: false, bulk: false,
    requiresConnection: false,
  },

  // ─── Already-wired non-AI quick fix ──────────────────────────────────
  // sitemapsNotSubmitted has its own modal flow (onOpenSitemapSubmission).
  // Listed here for completeness but the dispatcher does NOT route it - the
  // page renders its own button. registry entries with `external: true` tell
  // the UI a button exists but it's wired elsewhere.
  sitemapsNotSubmitted: {
    kind: 'free', handler: 'external', previewable: false, bulk: false, external: true,
  },
};

/**
 * Extract the insight type from a titleKey like 'agent.insights.missingSeo.title'
 * or 'agent.insights.cannibalization.proactive.title'.
 */
export function getInsightType(titleKey) {
  if (!titleKey) return null;
  if (titleKey.includes('cannibalization')) return 'cannibalization';
  return titleKey.match(/agent\.insights\.(\w+)\.title/)?.[1] || null;
}

export function getFixerConfig(titleKey) {
  return AGENT_FIXERS[getInsightType(titleKey)] || null;
}

/**
 * Capability-aware fixer lookup. Returns null if the fixer requires a capability
 * the site's platform doesn't expose. Pass `capabilities` from
 * `capabilitiesFor(site.platform)`.
 */
export function getFixerForSite(titleKey, capabilities) {
  const cfg = getFixerConfig(titleKey);
  if (!cfg) return null;
  if (cfg.capability && capabilities && !capabilities[cfg.capability]) return null;
  return cfg;
}

export function isFixableType(titleKey) {
  const cfg = getFixerConfig(titleKey);
  return !!cfg && !cfg.external;
}

export function isAiFixable(titleKey) {
  return getFixerConfig(titleKey)?.kind === 'ai';
}

export function isFreeFixable(titleKey) {
  const cfg = getFixerConfig(titleKey);
  return cfg?.kind === 'free' && !cfg.external;
}

export function getFixCredits(titleKey) {
  const cfg = getFixerConfig(titleKey);
  return cfg?.kind === 'ai' ? (cfg.credits || 0) : 0;
}

/**
 * Set of bare insight type names that are fixable (any kind). Exported for
 * places that already hold a parsed type instead of a titleKey - e.g. the
 * agent page's per-row rendering loop.
 */
export const FIXABLE_INSIGHT_TYPES = new Set(
  Object.entries(AGENT_FIXERS)
    .filter(([, cfg]) => !cfg.external)
    .map(([type]) => type),
);
