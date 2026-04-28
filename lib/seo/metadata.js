// Centralized metadata system for the GhostSEO Platform.
//
// All page metadata flows through this file. Two consumers:
//
//   1. Server pages / layouts call `buildMetadata({ pageKey, params })`
//      from their `generateMetadata` export. Next.js handles the
//      <title>, <meta>, openGraph, twitter, robots, canonical, icons.
//
//   2. Client pages render <PageMeta /> (which is mounted once in each
//      client layout). It looks up metadata for the current pathname
//      from `pageRegistry` and updates document.title and the
//      description meta tag at runtime.
//
// To add metadata for a new page, add an entry to `pageRegistry`
// keyed by route pattern (Next.js style — e.g. `/dashboard/strategy/[slug]`)
// and add the matching translation keys to i18n dictionaries under `meta.*`.

import { defaultLocale } from '@/i18n/config';

const BRAND_NAME = 'GhostSEO';

// The canonical public origin for the platform. Used for metadataBase,
// openGraph url, and canonical URLs. Falls back when env is not set.
function resolveSiteOrigin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'https://app.ghostpost.com';
}

export const siteConfig = {
  brand: BRAND_NAME,
  origin: resolveSiteOrigin(),
  defaultTitle: `${BRAND_NAME} — AI-Powered SEO Automation`,
  // Used by Next.js as the title template; %s is the per-page title.
  titleTemplate: `%s | ${BRAND_NAME}`,
  defaultDescription:
    'Automate your SEO strategy with GhostSEO. AI-powered content creation, optimization, and site management.',
  defaultKeywords: ['SEO', 'AI', 'automation', 'content', 'optimization', 'GhostSEO'],
  themeColor: '#7b2cbf',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
  ogImage: '/ghostpost_logo.png',
  twitter: {
    card: 'summary_large_image',
  },
};

// Page registry — single source of truth for per-page metadata.
//
// Key:   route pattern (Next.js style, with [param] placeholders).
// Value: { titleKey, descriptionKey, robots? }
//
//   - titleKey / descriptionKey resolve against the i18n dictionary
//     under the `meta.*` namespace (e.g. `meta.dashboard.home.title`).
//   - robots defaults to "noindex" because this is a private SaaS app.
//     Set `robots: 'index'` for any pages you want search engines to find.
//
// When you add a new page.jsx, add an entry here and add the strings
// to en.json + he.json under `meta`.
export const pageRegistry = {
  '/': {
    titleKey: 'meta.home.title',
    descriptionKey: 'meta.home.description',
    robots: 'index',
  },

  // Auth
  '/auth': { titleKey: 'meta.auth.index.title', descriptionKey: 'meta.auth.index.description' },
  '/auth/login': { titleKey: 'meta.auth.login.title', descriptionKey: 'meta.auth.login.description' },
  '/auth/register': { titleKey: 'meta.auth.register.title', descriptionKey: 'meta.auth.register.description' },
  '/auth/register/thank-you': { titleKey: 'meta.auth.thankYou.title', descriptionKey: 'meta.auth.thankYou.description' },
  '/auth/accept-invite': { titleKey: 'meta.auth.acceptInvite.title', descriptionKey: 'meta.auth.acceptInvite.description' },
  '/accept-invite': { titleKey: 'meta.auth.acceptInvite.title', descriptionKey: 'meta.auth.acceptInvite.description' },

  // Dashboard
  '/dashboard': { titleKey: 'meta.dashboard.home.title', descriptionKey: 'meta.dashboard.home.description' },
  '/dashboard/agent': { titleKey: 'meta.dashboard.agent.title', descriptionKey: 'meta.dashboard.agent.description' },
  '/dashboard/automations': { titleKey: 'meta.dashboard.automations.title', descriptionKey: 'meta.dashboard.automations.description' },
  '/dashboard/strategy': { titleKey: 'meta.dashboard.strategy.index.title', descriptionKey: 'meta.dashboard.strategy.index.description' },
  '/dashboard/strategy/site-profile': { titleKey: 'meta.dashboard.strategy.siteProfile.title', descriptionKey: 'meta.dashboard.strategy.siteProfile.description' },
  '/dashboard/strategy/keywords': { titleKey: 'meta.dashboard.strategy.keywords.title', descriptionKey: 'meta.dashboard.strategy.keywords.description' },
  '/dashboard/strategy/competitors': { titleKey: 'meta.dashboard.strategy.competitors.title', descriptionKey: 'meta.dashboard.strategy.competitors.description' },
  '/dashboard/strategy/content-planner': { titleKey: 'meta.dashboard.strategy.contentPlanner.title', descriptionKey: 'meta.dashboard.strategy.contentPlanner.description' },
  '/dashboard/strategy/ai-content-wizard': { titleKey: 'meta.dashboard.strategy.aiWizard.title', descriptionKey: 'meta.dashboard.strategy.aiWizard.description' },
  '/dashboard/strategy/clusters': { titleKey: 'meta.dashboard.strategy.clusters.title', descriptionKey: 'meta.dashboard.strategy.clusters.description' },
  '/dashboard/entities': { titleKey: 'meta.dashboard.entities.index.title', descriptionKey: 'meta.dashboard.entities.index.description' },
  '/dashboard/entities/media': { titleKey: 'meta.dashboard.entities.media.title', descriptionKey: 'meta.dashboard.entities.media.description' },
  '/dashboard/entities/sitemaps': { titleKey: 'meta.dashboard.entities.sitemaps.title', descriptionKey: 'meta.dashboard.entities.sitemaps.description' },
  '/dashboard/entities/sitemaps/[id]': { titleKey: 'meta.dashboard.entities.sitemapDetail.title', descriptionKey: 'meta.dashboard.entities.sitemapDetail.description' },
  '/dashboard/entities/[type]': { titleKey: 'meta.dashboard.entities.type.title', descriptionKey: 'meta.dashboard.entities.type.description' },
  '/dashboard/entities/[type]/[id]': { titleKey: 'meta.dashboard.entities.detail.title', descriptionKey: 'meta.dashboard.entities.detail.description' },
  '/dashboard/technical-seo': { titleKey: 'meta.dashboard.technicalSeo.index.title', descriptionKey: 'meta.dashboard.technicalSeo.index.description' },
  '/dashboard/technical-seo/redirections': { titleKey: 'meta.dashboard.technicalSeo.redirections.title', descriptionKey: 'meta.dashboard.technicalSeo.redirections.description' },
  '/dashboard/technical-seo/webp-converter': { titleKey: 'meta.dashboard.technicalSeo.webp.title', descriptionKey: 'meta.dashboard.technicalSeo.webp.description' },
  '/dashboard/technical-seo/site-audit': { titleKey: 'meta.dashboard.technicalSeo.audit.title', descriptionKey: 'meta.dashboard.technicalSeo.audit.description' },
  '/dashboard/site-audit': { titleKey: 'meta.dashboard.siteAudit.title', descriptionKey: 'meta.dashboard.siteAudit.description' },
  '/dashboard/seo-frontend': { titleKey: 'meta.dashboard.seoFrontend.title', descriptionKey: 'meta.dashboard.seoFrontend.description' },
  '/dashboard/seo-backend': { titleKey: 'meta.dashboard.seoBackend.title', descriptionKey: 'meta.dashboard.seoBackend.description' },
  '/dashboard/backlinks': { titleKey: 'meta.dashboard.backlinks.title', descriptionKey: 'meta.dashboard.backlinks.description' },
  '/dashboard/link-building': { titleKey: 'meta.dashboard.linkBuilding.title', descriptionKey: 'meta.dashboard.linkBuilding.description' },
  '/dashboard/my-websites': { titleKey: 'meta.dashboard.myWebsites.title', descriptionKey: 'meta.dashboard.myWebsites.description' },
  '/dashboard/notifications': { titleKey: 'meta.dashboard.notifications.title', descriptionKey: 'meta.dashboard.notifications.description' },
  '/dashboard/settings': { titleKey: 'meta.dashboard.settings.title', descriptionKey: 'meta.dashboard.settings.description' },
  '/dashboard/support': { titleKey: 'meta.dashboard.support.index.title', descriptionKey: 'meta.dashboard.support.index.description' },
  '/dashboard/support/new': { titleKey: 'meta.dashboard.support.new.title', descriptionKey: 'meta.dashboard.support.new.description' },
  '/dashboard/support/access': { titleKey: 'meta.dashboard.support.access.title', descriptionKey: 'meta.dashboard.support.access.description' },
  '/dashboard/support/[id]': { titleKey: 'meta.dashboard.support.detail.title', descriptionKey: 'meta.dashboard.support.detail.description' },
  '/dashboard/visual-editor': { titleKey: 'meta.dashboard.visualEditor.title', descriptionKey: 'meta.dashboard.visualEditor.description' },
  '/dashboard/restore-account': { titleKey: 'meta.dashboard.restoreAccount.title', descriptionKey: 'meta.dashboard.restoreAccount.description' },

  // Admin
  '/admin': { titleKey: 'meta.admin.home.title', descriptionKey: 'meta.admin.home.description' },
  '/admin/accounts': { titleKey: 'meta.admin.accounts.title', descriptionKey: 'meta.admin.accounts.description' },
  '/admin/accounts/[id]': { titleKey: 'meta.admin.accountDetail.title', descriptionKey: 'meta.admin.accountDetail.description' },
  '/admin/users': { titleKey: 'meta.admin.users.title', descriptionKey: 'meta.admin.users.description' },
  '/admin/users/[id]': { titleKey: 'meta.admin.userDetail.title', descriptionKey: 'meta.admin.userDetail.description' },
  '/admin/subscriptions': { titleKey: 'meta.admin.subscriptions.title', descriptionKey: 'meta.admin.subscriptions.description' },
  '/admin/plans': { titleKey: 'meta.admin.plans.title', descriptionKey: 'meta.admin.plans.description' },
  '/admin/addons': { titleKey: 'meta.admin.addons.title', descriptionKey: 'meta.admin.addons.description' },
  '/admin/coupons': { titleKey: 'meta.admin.coupons.title', descriptionKey: 'meta.admin.coupons.description' },
  '/admin/pricing': { titleKey: 'meta.admin.pricing.title', descriptionKey: 'meta.admin.pricing.description' },
  '/admin/interview-flow': { titleKey: 'meta.admin.interviewFlow.title', descriptionKey: 'meta.admin.interviewFlow.description' },
  '/admin/interview-questions': { titleKey: 'meta.admin.interviewQuestions.title', descriptionKey: 'meta.admin.interviewQuestions.description' },
  '/admin/push-questions': { titleKey: 'meta.admin.pushQuestions.title', descriptionKey: 'meta.admin.pushQuestions.description' },
  '/admin/bot-actions': { titleKey: 'meta.admin.botActions.title', descriptionKey: 'meta.admin.botActions.description' },
  '/admin/translations': { titleKey: 'meta.admin.translations.title', descriptionKey: 'meta.admin.translations.description' },
  '/admin/backlinks': { titleKey: 'meta.admin.backlinks.title', descriptionKey: 'meta.admin.backlinks.description' },
  '/admin/website': { titleKey: 'meta.admin.website.index.title', descriptionKey: 'meta.admin.website.index.description' },
  '/admin/website/settings': { titleKey: 'meta.admin.website.settings.title', descriptionKey: 'meta.admin.website.settings.description' },
  '/admin/website/blog': { titleKey: 'meta.admin.website.blog.title', descriptionKey: 'meta.admin.website.blog.description' },
  '/admin/website/blog/new': { titleKey: 'meta.admin.website.blogNew.title', descriptionKey: 'meta.admin.website.blogNew.description' },
  '/admin/website/blog/[slug]': { titleKey: 'meta.admin.website.blogEdit.title', descriptionKey: 'meta.admin.website.blogEdit.description' },
  '/admin/website/pages': { titleKey: 'meta.admin.website.pages.title', descriptionKey: 'meta.admin.website.pages.description' },
  '/admin/website/pages/[pageId]': { titleKey: 'meta.admin.website.pageEdit.title', descriptionKey: 'meta.admin.website.pageEdit.description' },
  '/admin/faq': { titleKey: 'meta.admin.faq.title', descriptionKey: 'meta.admin.faq.description' },
  '/admin/support': { titleKey: 'meta.admin.support.title', descriptionKey: 'meta.admin.support.description' },
  '/admin/support/[id]': { titleKey: 'meta.admin.supportDetail.title', descriptionKey: 'meta.admin.supportDetail.description' },
  '/admin/impersonation': { titleKey: 'meta.admin.impersonation.title', descriptionKey: 'meta.admin.impersonation.description' },
  '/admin/impersonation/sessions/[id]': { titleKey: 'meta.admin.impersonationSession.title', descriptionKey: 'meta.admin.impersonationSession.description' },
};

// Resolve a key like "meta.dashboard.home.title" against a dictionary object.
// Returns the resolved string, or null if the key is missing.
export function resolveTranslation(dictionary, key) {
  if (!dictionary || !key) return null;
  const parts = key.split('.');
  let value = dictionary;
  for (const part of parts) {
    if (value && typeof value === 'object' && part in value) {
      value = value[part];
    } else {
      return null;
    }
  }
  return typeof value === 'string' ? value : null;
}

// Match a concrete pathname (e.g. "/dashboard/entities/blog/123") against
// the registry, which contains route patterns (e.g. "/dashboard/entities/[type]/[id]").
// Returns the registry entry, or null if no match.
//
// Picks the most specific match — exact hits win over patterns, longer
// patterns win over shorter ones.
export function matchRoute(pathname) {
  if (!pathname) return null;
  // Strip query and trailing slash (except root).
  const cleanPath = pathname.split('?')[0].replace(/\/+$/, '') || '/';

  if (pageRegistry[cleanPath]) {
    return { pattern: cleanPath, ...pageRegistry[cleanPath] };
  }

  const cleanSegments = cleanPath.split('/');
  let bestMatch = null;
  let bestSpecificity = -1;

  for (const pattern of Object.keys(pageRegistry)) {
    const patternSegments = pattern.split('/');
    if (patternSegments.length !== cleanSegments.length) continue;

    let matches = true;
    let specificity = 0;
    for (let i = 0; i < patternSegments.length; i++) {
      const ps = patternSegments[i];
      const cs = cleanSegments[i];
      if (ps.startsWith('[') && ps.endsWith(']')) {
        // Dynamic segment matches anything.
        continue;
      }
      if (ps !== cs) {
        matches = false;
        break;
      }
      // Static segment match — boost specificity.
      specificity += 1;
    }

    if (matches && specificity > bestSpecificity) {
      bestSpecificity = specificity;
      bestMatch = { pattern, ...pageRegistry[pattern] };
    }
  }

  return bestMatch;
}

// Get { title, description } for a pathname, resolved against the dictionary.
// Used by the <PageMeta /> client component.
export function getPageMetaForPath(pathname, dictionary) {
  const entry = matchRoute(pathname);
  if (!entry) {
    return {
      title: siteConfig.defaultTitle,
      description: siteConfig.defaultDescription,
      robots: 'noindex',
    };
  }
  const title = resolveTranslation(dictionary, entry.titleKey);
  const description = resolveTranslation(dictionary, entry.descriptionKey);
  return {
    title: title || siteConfig.defaultTitle,
    description: description || siteConfig.defaultDescription,
    robots: entry.robots || 'noindex',
  };
}

// Build a Next.js metadata object for a server `generateMetadata` export.
// Pass `pageKey` (route pattern) for an explicit registry lookup, OR pass
// `title` / `description` directly to override.
//
// `dictionary` is optional — if omitted, it falls back to the static
// English dictionary from i18n/dictionaries/en.json (so server pages still
// produce sensible <title> tags before user locale is known).
export async function buildMetadata({
  pageKey,
  dictionary,
  locale,
  title,
  description,
  robots,
  openGraph,
  twitter,
  alternates,
} = {}) {
  // Lazy-load dictionary for the requested locale if not provided.
  let dict = dictionary;
  if (!dict) {
    try {
      const mod = await import(`@/i18n/dictionaries/${locale || defaultLocale}.json`);
      dict = mod.default;
    } catch {
      dict = {};
    }
  }

  const entry = pageKey ? pageRegistry[pageKey] : null;
  const resolvedTitle =
    title ||
    (entry ? resolveTranslation(dict, entry.titleKey) : null) ||
    siteConfig.defaultTitle;
  const resolvedDescription =
    description ||
    (entry ? resolveTranslation(dict, entry.descriptionKey) : null) ||
    siteConfig.defaultDescription;
  const resolvedRobots = robots || entry?.robots || 'noindex';

  return {
    title: resolvedTitle,
    description: resolvedDescription,
    keywords: siteConfig.defaultKeywords,
    icons: siteConfig.icons,
    robots: robotsToNextFormat(resolvedRobots),
    openGraph: {
      title: resolvedTitle,
      description: resolvedDescription,
      siteName: siteConfig.brand,
      type: 'website',
      images: [{ url: siteConfig.ogImage }],
      ...openGraph,
    },
    twitter: {
      card: siteConfig.twitter.card,
      title: resolvedTitle,
      description: resolvedDescription,
      images: [siteConfig.ogImage],
      ...twitter,
    },
    alternates,
  };
}

// Convenience factory: create a `generateMetadata` export for a server page
// in one line. Reads the locale from the `ghostseo-locale` cookie and
// looks up the registry entry for `pageKey`.
//
//   export const generateMetadata = createGenerateMetadata('/dashboard/agent');
//
// The factory is async — Next.js handles that fine.
export function createGenerateMetadata(pageKey, overrides = {}) {
  return async function generateMetadata() {
    // Lazy-import to avoid pulling next/headers into client bundles.
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const localeCookie = cookieStore.get('ghostseo-locale');
    const { locales: supported, defaultLocale: fallback } = await import('@/i18n/config');
    const locale = localeCookie?.value && supported.includes(localeCookie.value)
      ? localeCookie.value
      : fallback;
    return buildMetadata({ pageKey, locale, ...overrides });
  };
}

// Build the root metadata (used by app/layout.jsx).
// Sets title template, metadataBase, defaults — everything that
// applies site-wide unless a child page overrides it.
export async function buildRootMetadata({ locale } = {}) {
  let dict = {};
  try {
    const mod = await import(`@/i18n/dictionaries/${locale || defaultLocale}.json`);
    dict = mod.default;
  } catch {}

  const defaultTitle =
    resolveTranslation(dict, 'meta.default.title') || siteConfig.defaultTitle;
  const defaultDescription =
    resolveTranslation(dict, 'meta.default.description') || siteConfig.defaultDescription;

  return {
    metadataBase: new URL(siteConfig.origin),
    title: {
      default: defaultTitle,
      template: siteConfig.titleTemplate,
    },
    description: defaultDescription,
    keywords: siteConfig.defaultKeywords,
    applicationName: siteConfig.brand,
    icons: siteConfig.icons,
    // Private SaaS app — hide from search by default.
    robots: robotsToNextFormat('noindex'),
    openGraph: {
      title: defaultTitle,
      description: defaultDescription,
      siteName: siteConfig.brand,
      type: 'website',
      url: siteConfig.origin,
      images: [{ url: siteConfig.ogImage }],
    },
    twitter: {
      card: siteConfig.twitter.card,
      title: defaultTitle,
      description: defaultDescription,
      images: [siteConfig.ogImage],
    },
  };
}

// Viewport export — Next.js 14+ wants viewport/themeColor split out
// of metadata. Server layouts/pages can re-export this directly.
export const defaultViewport = {
  themeColor: siteConfig.themeColor,
  width: 'device-width',
  initialScale: 1,
};

function robotsToNextFormat(robots) {
  if (robots === 'index') {
    return { index: true, follow: true };
  }
  // Default: noindex, nofollow (private app).
  return { index: false, follow: false };
}
