/**
 * Feature-guides catalog.
 *
 * Each entry describes one self-contained walkthrough available from the
 * GuidesCenter. Guides are independent from the first-run onboarding step
 * machine in lib/onboarding.js - they can be replayed at any time by any
 * user and their completion is tracked separately in Account.completedGuides.
 *
 * A guide "ties into" the first-run flow via `onboardingStepAlias`: when that
 * onboarding step finishes, the matching guide is automatically marked
 * complete (so users who went through onboarding don't have to replay them
 * just to get a checkmark).
 *
 * tourBuilder / startPath are optional during Phase 1 scaffolding. They get
 * populated as each guide is authored in Phases 2-4.
 */

export const GUIDE_CATEGORIES = {
  CORE: 'CORE',
  STRATEGY: 'STRATEGY',
  ENTITIES: 'ENTITIES',
  TECHNICAL_SEO: 'TECHNICAL_SEO',
  SEO_EDITOR: 'SEO_EDITOR',
  LINKS: 'LINKS',
  AUTOMATION: 'AUTOMATION',
};

export const GUIDE_CATEGORY_ORDER = [
  GUIDE_CATEGORIES.CORE,
  GUIDE_CATEGORIES.STRATEGY,
  GUIDE_CATEGORIES.ENTITIES,
  GUIDE_CATEGORIES.TECHNICAL_SEO,
  GUIDE_CATEGORIES.SEO_EDITOR,
  GUIDE_CATEGORIES.LINKS,
  GUIDE_CATEGORIES.AUTOMATION,
];

/**
 * Canonical guide IDs. Stored verbatim in Account.completedGuides, so don't
 * rename without a migration.
 */
export const GUIDES = {
  // Existing first-run tours (already implemented)
  CONNECT_ANALYTICS: 'connect-analytics',
  INSTALL_PLUGIN: 'install-plugin',
  DETECT_ENTITIES: 'detect-entities',
  KEYWORDS: 'keywords',
  COMPETITORS: 'competitors',
  SITE_AUDIT: 'site-audit',
  AI_AGENT: 'ai-agent',
  CONTENT_PLANNER: 'content-planner',
  CONTENT_WIZARD: 'content-wizard',

  // Core
  DASHBOARD_HOME: 'dashboard-home',
  MY_WEBSITES: 'my-websites',
  NOTIFICATIONS: 'notifications',
  SETTINGS: 'settings',

  // Strategy
  STRATEGY_HUB: 'strategy-hub',
  SITE_PROFILE: 'site-profile',

  // Entities
  ENTITIES_MANAGER: 'entities-manager',
  SITEMAPS: 'sitemaps',
  MEDIA_LIBRARY: 'media-library',

  // Technical SEO
  TECHNICAL_SEO_HUB: 'technical-seo-hub',
  REDIRECTIONS: 'redirections',
  WEBP_CONVERTER: 'webp-converter',

  // SEO editor
  SEO_BACKEND: 'seo-backend',
  SEO_FRONTEND: 'seo-frontend',
  VISUAL_EDITOR: 'visual-editor',

  // Links
  BACKLINKS: 'backlinks',
  LINK_BUILDING: 'link-building',

  // Automation
  AUTOMATIONS: 'automations',
};

/**
 * Full catalog. `tourBuilder` and `startPath` are filled in as each guide
 * is authored. Entries without `tourBuilder` render in the GuidesCenter as
 * "coming soon" cards.
 *
 * Every guide maps to an i18n namespace under `onboarding.guides.<id>` with:
 *   - title: short name shown on the card
 *   - description: one-sentence pitch shown on the card
 *   - completedHint: label shown under the title when ✓
 */
export const GUIDES_CATALOG = [
  // ─── Existing first-run tours (Phase 2 wires them into the catalog) ───
  {
    id: GUIDES.CONNECT_ANALYTICS,
    category: GUIDE_CATEGORIES.CORE,
    onboardingStepAlias: 'CONNECT_ANALYTICS',
    durationMinutes: 3,
    startPath: '/dashboard/settings?tab=integrations',
  },
  {
    id: GUIDES.INSTALL_PLUGIN,
    category: GUIDE_CATEGORIES.CORE,
    onboardingStepAlias: 'INSTALL_PLUGIN',
    durationMinutes: 4,
    startPath: '/dashboard/settings?tab=plugins',
  },
  {
    id: GUIDES.DETECT_ENTITIES,
    category: GUIDE_CATEGORIES.ENTITIES,
    onboardingStepAlias: 'DETECT_ENTITIES',
    durationMinutes: 3,
    startPath: '/dashboard/entities',
  },
  {
    id: GUIDES.KEYWORDS,
    category: GUIDE_CATEGORIES.STRATEGY,
    onboardingStepAlias: 'KEYWORDS',
    durationMinutes: 4,
    startPath: '/dashboard/strategy/keywords',
  },
  {
    id: GUIDES.COMPETITORS,
    category: GUIDE_CATEGORIES.STRATEGY,
    onboardingStepAlias: 'COMPETITORS',
    durationMinutes: 4,
    startPath: '/dashboard/strategy/competitors',
  },
  {
    id: GUIDES.SITE_AUDIT,
    category: GUIDE_CATEGORIES.TECHNICAL_SEO,
    onboardingStepAlias: 'SITE_AUDIT',
    durationMinutes: 3,
    startPath: '/dashboard/technical-seo/site-audit',
  },
  {
    id: GUIDES.AI_AGENT,
    category: GUIDE_CATEGORIES.AUTOMATION,
    onboardingStepAlias: 'AI_AGENT',
    durationMinutes: 4,
    startPath: '/dashboard/agent',
  },
  {
    id: GUIDES.CONTENT_PLANNER,
    category: GUIDE_CATEGORIES.STRATEGY,
    onboardingStepAlias: 'CONTENT_PLANNER',
    durationMinutes: 4,
    startPath: '/dashboard/strategy/content-planner',
  },
  {
    id: GUIDES.CONTENT_WIZARD,
    category: GUIDE_CATEGORIES.STRATEGY,
    onboardingStepAlias: 'CONTENT_WIZARD',
    durationMinutes: 5,
    startPath: '/dashboard/strategy/ai-content-wizard',
  },

  // ─── New guides (Phases 3-4) ───
  {
    id: GUIDES.DASHBOARD_HOME,
    category: GUIDE_CATEGORIES.CORE,
    durationMinutes: 3,
    startPath: '/dashboard',
  },
  {
    id: GUIDES.MY_WEBSITES,
    category: GUIDE_CATEGORIES.CORE,
    durationMinutes: 3,
    startPath: '/dashboard/my-websites',
  },
  {
    id: GUIDES.NOTIFICATIONS,
    category: GUIDE_CATEGORIES.CORE,
    durationMinutes: 2,
    startPath: '/dashboard/notifications',
  },
  {
    id: GUIDES.SETTINGS,
    category: GUIDE_CATEGORIES.CORE,
    durationMinutes: 4,
    startPath: '/dashboard/settings',
  },

  {
    id: GUIDES.STRATEGY_HUB,
    category: GUIDE_CATEGORIES.STRATEGY,
    durationMinutes: 2,
    startPath: '/dashboard/strategy',
  },
  {
    id: GUIDES.SITE_PROFILE,
    category: GUIDE_CATEGORIES.STRATEGY,
    durationMinutes: 5,
    startPath: '/dashboard/strategy/site-profile',
  },

  {
    id: GUIDES.ENTITIES_MANAGER,
    category: GUIDE_CATEGORIES.ENTITIES,
    durationMinutes: 4,
    startPath: '/dashboard/entities',
  },
  {
    id: GUIDES.SITEMAPS,
    category: GUIDE_CATEGORIES.ENTITIES,
    durationMinutes: 3,
    startPath: '/dashboard/entities/sitemaps',
  },
  {
    id: GUIDES.MEDIA_LIBRARY,
    category: GUIDE_CATEGORIES.ENTITIES,
    durationMinutes: 3,
    startPath: '/dashboard/entities/media',
  },

  {
    id: GUIDES.TECHNICAL_SEO_HUB,
    category: GUIDE_CATEGORIES.TECHNICAL_SEO,
    durationMinutes: 2,
    startPath: '/dashboard/technical-seo',
  },
  {
    id: GUIDES.REDIRECTIONS,
    category: GUIDE_CATEGORIES.TECHNICAL_SEO,
    durationMinutes: 3,
    startPath: '/dashboard/technical-seo/redirections',
  },
  {
    id: GUIDES.WEBP_CONVERTER,
    category: GUIDE_CATEGORIES.TECHNICAL_SEO,
    durationMinutes: 2,
    startPath: '/dashboard/technical-seo/webp-converter',
  },

  {
    id: GUIDES.SEO_BACKEND,
    category: GUIDE_CATEGORIES.SEO_EDITOR,
    durationMinutes: 5,
    startPath: '/dashboard/seo-backend',
  },
  {
    id: GUIDES.SEO_FRONTEND,
    category: GUIDE_CATEGORIES.SEO_EDITOR,
    durationMinutes: 4,
    startPath: '/dashboard/seo-frontend',
  },
  {
    id: GUIDES.VISUAL_EDITOR,
    category: GUIDE_CATEGORIES.SEO_EDITOR,
    durationMinutes: 5,
    startPath: '/dashboard/visual-editor',
  },

  {
    id: GUIDES.BACKLINKS,
    category: GUIDE_CATEGORIES.LINKS,
    durationMinutes: 4,
    startPath: '/dashboard/backlinks',
  },
  {
    id: GUIDES.LINK_BUILDING,
    category: GUIDE_CATEGORIES.LINKS,
    durationMinutes: 4,
    startPath: '/dashboard/link-building',
  },

  {
    id: GUIDES.AUTOMATIONS,
    category: GUIDE_CATEGORIES.AUTOMATION,
    durationMinutes: 5,
    startPath: '/dashboard/automations',
  },
];

/**
 * Map from ONBOARDING_STEPS enum value → guide id. Used to auto-mark a guide
 * complete when the matching first-run step finishes.
 */
export const ONBOARDING_STEP_TO_GUIDE = GUIDES_CATALOG.reduce((acc, g) => {
  if (g.onboardingStepAlias) acc[g.onboardingStepAlias] = g.id;
  return acc;
}, {});

export function getGuide(id) {
  return GUIDES_CATALOG.find((g) => g.id === id) || null;
}

export function getGuidesByCategory() {
  const grouped = {};
  for (const cat of GUIDE_CATEGORY_ORDER) grouped[cat] = [];
  for (const g of GUIDES_CATALOG) {
    if (grouped[g.category]) grouped[g.category].push(g);
  }
  return grouped;
}

/**
 * Valid guide IDs as a Set, for cheap membership checks server-side.
 */
export const VALID_GUIDE_IDS = new Set(GUIDES_CATALOG.map((g) => g.id));
