/**
 * Fix Registry - single source of truth for which audit issues are fixable,
 * who fixes them, and what the user pays.
 *
 * Each entry:
 *   kind:       'ai'  → AI button (charges credits, shows "AI Fix · N credits")
 *               'free' → Free button (no credits, shows "Fix · Free")
 *   handler:    name of the handler module under lib/audit/fixers/
 *               (also the dispatcher key)
 *   credits:    STATIC fixed price displayed on the AI button before click.
 *               MUST BE EVEN. Adjust over time as real usage data accumulates.
 *   bulk:       handler supports `{ urls: [...] }` bulk-mode call. The
 *               dispatcher tries bulk first and falls back to N parallel
 *               single-item calls on failure.
 *   previewable:`true` → preview phase shows AI suggestions before apply.
 *               When false, the dispatcher generates + applies in one step.
 *   manualKinds:array of manual-output kinds this handler can produce when
 *               the site has no plugin / isn't WordPress. The dispatcher
 *               passes this to the modal so it knows how to render.
 *
 * Reclassification rule: if a `kind: 'free'` handler ever ends up calling
 * Gemini, move its registry entry to `kind: 'ai'` and set a credits price.
 * The label users see follows the registry - never silently flip mid-session.
 */

export const ISSUE_FIXERS = {
  // ─── AI fixes (cost credits) ──────────────────────────────────────
  'audit.issues.noTitle': {
    kind: 'ai', handler: 'title', credits: 2, bulk: true, previewable: true,
    manualKinds: ['value'],
  },
  'audit.issues.titleTooShort': {
    kind: 'ai', handler: 'title', credits: 2, bulk: true, previewable: true,
    manualKinds: ['value'],
  },
  'audit.issues.titleTooLong': {
    kind: 'ai', handler: 'title', credits: 2, bulk: true, previewable: true,
    manualKinds: ['value'],
  },
  'audit.issues.duplicateTitle': {
    kind: 'ai', handler: 'title', credits: 2, bulk: true, previewable: true,
    manualKinds: ['value'],
  },

  'audit.issues.noMetaDescription': {
    kind: 'ai', handler: 'description', credits: 2, bulk: true, previewable: true,
    manualKinds: ['value'],
  },
  'audit.issues.metaDescriptionShort': {
    kind: 'ai', handler: 'description', credits: 2, bulk: true, previewable: true,
    manualKinds: ['value'],
  },
  'audit.issues.metaDescriptionLong': {
    kind: 'ai', handler: 'description', credits: 2, bulk: true, previewable: true,
    manualKinds: ['value'],
  },
  'audit.issues.duplicateMetaDescription': {
    kind: 'ai', handler: 'description', credits: 2, bulk: true, previewable: true,
    manualKinds: ['value'],
  },

  'audit.issues.missingOG': {
    kind: 'ai', handler: 'og', credits: 4, bulk: true, previewable: true,
    manualKinds: ['snippet'],
  },

  'audit.issues.imagesNoAlt': {
    kind: 'ai', handler: 'alt', credits: 4, bulk: true, previewable: true,
    manualKinds: ['value'],
  },

  'audit.issues.imagesNotNextGen': {
    kind: 'ai', handler: 'imageFormat', credits: 4, bulk: true, previewable: true,
    manualKinds: ['instructions'],
  },
  'audit.issues.imagesTooLarge': {
    kind: 'ai', handler: 'imageFormat', credits: 4, bulk: true, previewable: true,
    manualKinds: ['instructions'],
  },
  'audit.issues.imagesLargeWarning': {
    kind: 'ai', handler: 'imageFormat', credits: 4, bulk: true, previewable: true,
    manualKinds: ['instructions'],
  },
  'audit.issues.imagesNoDimensions': {
    kind: 'ai', handler: 'imageFormat', credits: 2, bulk: true, previewable: true,
    manualKinds: ['snippet'],
  },

  'audit.issues.brokenInternalLink': {
    kind: 'ai', handler: 'brokenLink', credits: 2, bulk: false, previewable: true,
    manualKinds: ['redirect', 'instructions'],
  },

  'audit.issues.noH1': {
    kind: 'ai', handler: 'heading', credits: 2, bulk: true, previewable: true,
    manualKinds: ['snippet', 'value'],
  },
  'audit.issues.multipleH1': {
    kind: 'ai', handler: 'heading', credits: 2, bulk: true, previewable: true,
    manualKinds: ['instructions'],
  },
  'audit.issues.noH2': {
    kind: 'ai', handler: 'heading', credits: 2, bulk: true, previewable: true,
    manualKinds: ['snippet', 'value'],
  },

  'audit.issues.noStructuredData': {
    kind: 'ai', handler: 'structuredData', credits: 4, bulk: true, previewable: true,
    manualKinds: ['snippet'],
  },

  'audit.issues.noFavicon': {
    // The AI-generated variant produces a real image asset via Imagen (Nano
    // Banana). Imagen calls cost real money so this MUST be the 'ai' kind
    // so the dispatcher gates it through enforceCredits. The non-AI path
    // (user picks an existing media item from their library) still exists
    // in the modal flow and bypasses the dispatcher entirely.
    //
    // Pricing: 8 credits - roughly Imagen-call cost rounded up to even.
    kind: 'ai', handler: 'favicon', credits: 8, bulk: false, previewable: true,
    manualKinds: ['image', 'instructions'],
  },

  // ─── Free fixes (no AI, no credits) ───────────────────────────────
  'audit.issues.metaRobotsNoindex': {
    kind: 'free', handler: 'noindex', bulk: true, previewable: false,
    manualKinds: ['wpAdminStep', 'instructions'],
  },
  'audit.issues.metaRobotsNofollow': {
    kind: 'free', handler: 'noindex', bulk: true, previewable: false,
    manualKinds: ['wpAdminStep', 'instructions'],
  },
  'audit.issues.wpSearchEngineDiscouraged': {
    kind: 'free', handler: 'noindex', bulk: false, previewable: false,
    manualKinds: ['wpAdminStep'],
  },
  'audit.issues.noViewportMeta': {
    kind: 'free', handler: 'viewport', bulk: false, previewable: false,
    manualKinds: ['snippet'],
  },
  'audit.issues.viewportMetaWeak': {
    kind: 'free', handler: 'viewport', bulk: false, previewable: false,
    manualKinds: ['snippet'],
  },
  'audit.issues.noCharset': {
    kind: 'free', handler: 'charset', bulk: false, previewable: false,
    manualKinds: ['snippet'],
  },
  'audit.issues.noCanonical': {
    kind: 'free', handler: 'canonical', bulk: true, previewable: false,
    manualKinds: ['snippet'],
  },
  'audit.issues.imagesNotLazy': {
    kind: 'free', handler: 'lazyImages', bulk: true, previewable: false,
    manualKinds: ['snippet', 'instructions'],
  },
  'audit.issues.noLangAttribute': {
    kind: 'free', handler: 'langAttribute', bulk: false, previewable: false,
    manualKinds: ['snippet'],
  },

  // ─── Security headers (free, all share one handler) ───────────────
  'audit.issues.noHsts': {
    kind: 'free', handler: 'securityHeaders', bulk: false, previewable: false,
    manualKinds: ['htaccess', 'nginx', 'instructions'],
  },
  'audit.issues.noXFrameOptions': {
    kind: 'free', handler: 'securityHeaders', bulk: false, previewable: false,
    manualKinds: ['htaccess', 'nginx', 'instructions'],
  },
  'audit.issues.noContentTypeOptions': {
    kind: 'free', handler: 'securityHeaders', bulk: false, previewable: false,
    manualKinds: ['htaccess', 'nginx', 'instructions'],
  },
  'audit.issues.noCsp': {
    kind: 'free', handler: 'securityHeaders', bulk: false, previewable: false,
    manualKinds: ['htaccess', 'nginx', 'instructions'],
  },
  'audit.issues.noReferrerPolicy': {
    kind: 'free', handler: 'securityHeaders', bulk: false, previewable: false,
    manualKinds: ['htaccess', 'nginx', 'instructions'],
  },
  'audit.issues.noPermissionsPolicy': {
    kind: 'free', handler: 'securityHeaders', bulk: false, previewable: false,
    manualKinds: ['htaccess', 'nginx', 'instructions'],
  },
};

export function getFixer(issueKey) {
  return ISSUE_FIXERS[issueKey] || null;
}

export function isAiFixable(issueKey) {
  return ISSUE_FIXERS[issueKey]?.kind === 'ai';
}

export function isFreeFixable(issueKey) {
  return ISSUE_FIXERS[issueKey]?.kind === 'free';
}

export function isFixable(issueKey) {
  return !!ISSUE_FIXERS[issueKey];
}

export function getFixedCredits(issueKey) {
  const f = ISSUE_FIXERS[issueKey];
  return f?.kind === 'ai' ? (f.credits || 2) : 0;
}

export function isPreviewable(issueKey) {
  return !!ISSUE_FIXERS[issueKey]?.previewable;
}
