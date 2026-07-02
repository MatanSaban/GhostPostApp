/**
 * Contract resolver — turns a site + path into the resolved public SEO the
 * Contract API serves. All data comes from what the platform already computes:
 *
 *   desired override  (SiteSeoOverride - accepted fixes/recommendations)
 *        ▸ falls back to ▸
 *   latest audit page (AuditPageResultDoc - observed title/description/robots)
 *        ▸ falls back to ▸
 *   site entity       (SiteEntity - title/excerpt/featuredImage from crawl)
 *        ▸ falls back to ▸
 *   sensible defaults (canonical = the page's own URL, robots = index,follow)
 *
 * Redirects come from the platform-managed Redirection table. Everything here
 * is public SEO - no secrets.
 */

import prisma from '@/lib/prisma';

const REDIRECT_CODE = { PERMANENT: 301, TEMPORARY: 302, FOUND: 307 };

/**
 * Normalize a request path: ensure a single leading slash, drop query/hash,
 * and strip a trailing slash (except the root "/").
 * @param {string} input
 * @returns {string}
 */
export function normalizePath(input) {
  let p = String(input || '/').trim();
  // If a full URL was passed, keep only the pathname.
  try {
    if (/^https?:\/\//i.test(p)) p = new URL(p).pathname;
  } catch { /* treat as a raw path */ }
  p = p.split('#')[0].split('?')[0];
  if (!p.startsWith('/')) p = `/${p}`;
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p || '/';
}

function baseUrl(siteUrl) {
  let b = String(siteUrl || '').trim().replace(/\/+$/, '');
  if (b && !/^https?:\/\//i.test(b)) b = `https://${b}`;
  return b;
}

// Candidate absolute URLs an audit/entity row might have stored for a path.
function urlCandidates(siteUrl, path) {
  const b = baseUrl(siteUrl);
  if (path === '/') return [b, `${b}/`];
  return [`${b}${path}`, `${b}${path}/`];
}

// The SiteSeoOverride model may not exist on the Prisma client until the client
// is regenerated after adding it. Guard so the Contract still serves audit +
// entity data before that, then automatically picks up overrides post-regen.
function overridesEnabled() {
  return typeof prisma.siteSeoOverride?.findFirst === 'function';
}

/**
 * Resolve the public SEO object for one path.
 * @param {{ id: string, url: string }} site
 * @param {string} path
 */
export async function resolveSeoForPath(site, path) {
  const norm = normalizePath(path);
  const candidates = urlCandidates(site.url, norm);
  const canonicalDefault = candidates[0];
  const slug = norm === '/' ? '' : norm.replace(/^\//, '');

  // 1. Desired override (accepted fix/recommendation).
  let override = null;
  if (overridesEnabled()) {
    override = await prisma.siteSeoOverride.findUnique({
      where: { siteId_path: { siteId: site.id, path: norm } },
    }).catch(() => null);
  }

  // 2. Latest completed audit's observation for this URL.
  let page = null;
  const latestAudit = await prisma.siteAudit.findFirst({
    where: { siteId: site.id, status: 'COMPLETED' },
    orderBy: { completedAt: 'desc' },
    select: { id: true },
  });
  if (latestAudit) {
    page = await prisma.auditPageResultDoc.findFirst({
      where: { auditId: latestAudit.id, url: { in: candidates } },
      select: { title: true, metaDescription: true, robotsMeta: true, statusCode: true },
    });
  }

  // 3. Entity (crawl/sitemap-derived) by URL or slug.
  const entity = await prisma.siteEntity.findFirst({
    where: {
      siteId: site.id,
      OR: [{ url: { in: candidates } }, ...(slug ? [{ slug }] : [])],
    },
    select: { title: true, excerpt: true, featuredImage: true, seoData: true, url: true },
  });

  const seoData = entity?.seoData || {};
  const title = override?.title || page?.title || seoData.title || entity?.title || null;
  const description = override?.description || page?.metaDescription || seoData.description || entity?.excerpt || null;
  const canonical = override?.canonical || seoData.canonical || canonicalDefault;
  const robots = override?.robots || page?.robotsMeta || seoData.robots || 'index,follow';
  const ogImage = override?.ogImage || seoData.ogImage || entity?.featuredImage || null;

  let jsonLd = override?.jsonLd ?? seoData.schema ?? [];
  if (!Array.isArray(jsonLd)) jsonLd = jsonLd ? [jsonLd] : [];

  const source = override ? 'override' : page ? 'audit' : entity ? 'entity' : 'default';

  return {
    path: norm,
    canonical,
    title: title || '',
    description: description || '',
    robots,
    openGraph: {
      'og:title': title || '',
      'og:description': description || '',
      'og:url': canonical,
      'og:type': 'website',
      ...(ogImage ? { 'og:image': ogImage } : {}),
    },
    twitter: {
      'twitter:card': ogImage ? 'summary_large_image' : 'summary',
      'twitter:title': title || '',
      'twitter:description': description || '',
      ...(ogImage ? { 'twitter:image': ogImage } : {}),
    },
    jsonLd,
    source,
  };
}

/**
 * The platform-managed redirect table for a site, as ready-to-apply rules.
 * @param {{ id: string }} site
 */
export async function resolveRedirects(site) {
  const rows = await prisma.redirection.findMany({
    where: { siteId: site.id, isActive: true },
    select: { sourceUrl: true, targetUrl: true, type: true },
    orderBy: { updatedAt: 'desc' },
  });
  return rows.map((r) => ({
    source: r.sourceUrl,
    destination: r.targetUrl,
    statusCode: REDIRECT_CODE[r.type] || 301,
  }));
}

/**
 * A cheap manifest the SDK/edge polls to detect changes (etag/version) and
 * learn what the Contract holds. `version` changes whenever the underlying SEO
 * or redirects change, so consumers can skip re-fetching unchanged data.
 * @param {{ id: string, url: string }} site
 */
export async function buildManifest(site) {
  const [latestAudit, redirectCount, overrideAgg] = await Promise.all([
    prisma.siteAudit.findFirst({
      where: { siteId: site.id, status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
      select: { id: true, completedAt: true },
    }),
    prisma.redirection.count({ where: { siteId: site.id, isActive: true } }),
    overridesEnabled()
      ? prisma.siteSeoOverride.aggregate({
          where: { siteId: site.id },
          _count: { _all: true },
          _max: { updatedAt: true },
        }).catch(() => null)
      : null,
  ]);

  const overrideCount = overrideAgg?._count?._all || 0;
  const parts = [
    latestAudit?.id || 'noaudit',
    latestAudit?.completedAt ? new Date(latestAudit.completedAt).getTime() : 0,
    `r${redirectCount}`,
    `o${overrideCount}`,
    overrideAgg?._max?.updatedAt ? new Date(overrideAgg._max.updatedAt).getTime() : 0,
  ];
  const version = parts.join('.');

  return {
    siteId: site.id,
    version,
    counts: { redirects: redirectCount, overrides: overrideCount },
    lastAuditAt: latestAudit?.completedAt || null,
  };
}
