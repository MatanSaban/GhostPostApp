import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifySignature } from '@/lib/site-keys';
import { getDictionary, createTranslator } from '@/i18n/server';

/**
 * Decode percent-encoded characters in a URL so non-Latin paths (Hebrew,
 * Arabic, Cyrillic, …) render readably in plugin admin UIs instead of as
 * "%d7%90%d7%99%d7%9a-…". decodeURI preserves reserved characters (?, #,
 * &) so query strings and fragments stay intact. Returns the original
 * string on malformed escape sequences.
 */
function prettifyUrl(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    return decodeURI(url);
  } catch {
    return url;
  }
}

/**
 * POST /api/public/wp/seo-insights
 * Returns SEO insights data for a connected WordPress site.
 *
 * Headers:
 *   X-GP-Site-Key, X-GP-Timestamp, X-GP-Signature
 * Body:
 *   { siteUrl: string }
 */
export async function POST(request) {
  try {
    const siteKey = request.headers.get('X-GP-Site-Key');
    const timestamp = parseInt(request.headers.get('X-GP-Timestamp'), 10);
    const signature = request.headers.get('X-GP-Signature');

    if (!siteKey || !timestamp || !signature) {
      return NextResponse.json({ success: false, error: 'Missing required headers' }, { status: 400 });
    }

    const site = await prisma.site.findFirst({
      where: { siteKey },
      select: {
        id: true,
        siteSecret: true,
        connectionStatus: true,
      },
    });

    if (!site) {
      return NextResponse.json({ success: false, error: 'Invalid site key' }, { status: 404 });
    }

    const body = await request.text();
    const verification = verifySignature(body, timestamp, signature, site.siteSecret);
    if (!verification.valid) {
      return NextResponse.json({ success: false, error: verification.error }, { status: 401 });
    }

    if (site.connectionStatus !== 'CONNECTED') {
      return NextResponse.json({ success: false, error: 'Site not connected' }, { status: 403 });
    }

    // Parse the (already-verified) body for the plugin-supplied locale so we
    // can translate audit.issues.* keys into the language the user is
    // viewing the WP admin in. Defaults to English on missing/invalid input.
    let requestLocale = 'en';
    try {
      const parsed = JSON.parse(body);
      if (parsed?.locale === 'he' || parsed?.locale === 'en') {
        requestLocale = parsed.locale;
      }
    } catch { /* body was already validated upstream — fall through to en */ }
    const dictionary = await getDictionary(requestLocale);
    const t = createTranslator(dictionary);

    // Fetch keywords for this site
    const keywords = await prisma.keyword.findMany({
      where: { siteId: site.id },
      orderBy: { position: 'asc' },
      take: 50,
    });

    // Fetch latest completed audit with issues
    const latestAudit = await prisma.siteAudit.findFirst({
      where: { siteId: site.id, status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
    });

    // Fetch site entities (pages/posts) - limited to published, enabled types only
    const entities = await prisma.siteEntity.findMany({
      where: { siteId: site.id, status: 'PUBLISHED', entityType: { isEnabled: true } },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });

    // Build top keywords
    const topKeywords = keywords.slice(0, 10).map(kw => ({
      keyword: kw.keyword,
      position: kw.position || 0,
      volume: kw.searchVolume || 0,
      change: 0, // position change not tracked per-keyword in current schema
    }));

    // Build top pages from entities
    const topPages = entities.slice(0, 10).map(e => ({
      // Falling back to the URL means we may emit percent-encoded paths;
      // decode so Hebrew / non-Latin slugs are readable in plugin admin.
      page: e.title || prettifyUrl(e.url) || `/${e.slug}`,
      traffic: 0,
      avgPosition: null,
    }));

    // Convert kebab/snake-case axe rule IDs into a Title-Case fallback so
    // an unmapped accessibility violation reads as "Skip Link" instead of
    // the raw "skip-link". Used only when neither the i18n dictionary nor
    // the issue's stored axe `suggestion` (English help text) provides a
    // better human label.
    const humanize = (s) =>
      s.replace(/[-_]+/g, ' ')
       .replace(/\s+/g, ' ')
       .trim()
       .replace(/\b\w/g, (c) => c.toUpperCase());

    // Extract issues from latest audit. The plugin renders `description`
    // verbatim, so decode percent-encoded URLs before sending — otherwise
    // Hebrew slugs land as "%d7%90%d7%99%d7%9a-…".
    const issues = (latestAudit?.issues || [])
      .filter(i => i.severity === 'error' || i.severity === 'warning')
      .slice(0, 20)
      .map(issue => {
        const raw = issue.message || '';
        // Title resolution priority:
        //   1. dictionary key (audit.issues.<id>, a11y.<rule>, etc)
        //   2. axe-core's English help text stored on issue.suggestion (a11y rules only)
        //   3. humanized version of the suffix after the namespace dot
        let title = raw;
        if (raw.includes('.')) {
          const translated = t(raw);
          if (translated !== raw) {
            title = translated;
          } else if (raw.startsWith('a11y.') && issue.suggestion) {
            title = issue.suggestion;
          } else {
            title = humanize(raw.split('.').pop() || raw);
          }
        }
        return {
          severity: issue.severity || 'info',
          title,
          description: prettifyUrl(issue.url || ''),
        };
      });

    // Build traffic chart labels (last 6 months)
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(d.toLocaleString('en', { month: 'short' }));
    }

    return NextResponse.json({
      success: true,
      data: {
        totalTraffic: 0,
        aiTraffic: 0,
        keywordsCount: keywords.length,
        issuesCount: issues.length,
        issues: issues,
        topKeywords: topKeywords,
        topPages: topPages,
        trafficChart: {
          labels: months,
          organic: months.map(() => 0),
          ai: months.map(() => 0),
        },
      },
    });
  } catch (error) {
    console.error('WP seo-insights error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
