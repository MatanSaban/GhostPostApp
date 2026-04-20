import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifySignature } from '@/lib/site-keys';

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
      page: e.title || e.url || `/${e.slug}`,
      traffic: 0,
      avgPosition: null,
    }));

    // Extract issues from latest audit
    const issues = (latestAudit?.issues || [])
      .filter(i => i.severity === 'error' || i.severity === 'warning')
      .slice(0, 20)
      .map(issue => ({
        severity: issue.severity || 'info',
        title: issue.message || '',
        description: issue.url || '',
      }));

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
