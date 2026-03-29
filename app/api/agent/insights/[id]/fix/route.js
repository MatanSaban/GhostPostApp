import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { generateInsightPreview, applyInsightFix, regenerateItem, isFixableType } from '@/lib/agent-fix';

const SESSION_COOKIE = 'user_session';

async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) return null;
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        lastSelectedAccountId: true,
        accountMemberships: { select: { accountId: true } },
      },
    });
  } catch {
    return null;
  }
}

/**
 * POST /api/agent/insights/[id]/fix
 * 
 * Modes:
 * - { mode: 'preview' } - Generate AI proposals without applying
 * - { mode: 'apply', proposals: [...] } - Apply user-approved proposals
 * - { mode: 'regenerate', itemIndex: number } - Regenerate one item
 */
export async function POST(request, { params }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const mode = body.mode || 'preview';

    const insight = await prisma.agentInsight.findUnique({ where: { id } });
    if (!insight) {
      return NextResponse.json({ error: 'Insight not found' }, { status: 404 });
    }

    const site = await prisma.site.findUnique({
      where: { id: insight.siteId },
      select: {
        id: true,
        accountId: true,
        name: true,
        url: true,
        siteKey: true,
        siteSecret: true,
        connectionStatus: true,
        wpLocale: true,
      },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const hasAccess = user.accountMemberships.some(m => m.accountId === site.accountId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (site.connectionStatus !== 'CONNECTED') {
      return NextResponse.json({ error: 'Plugin is not connected' }, { status: 400 });
    }

    if (!isFixableType(insight.titleKey)) {
      return NextResponse.json({ error: 'This insight type cannot be auto-fixed' }, { status: 400 });
    }

    if (!['PENDING', 'APPROVED', 'FAILED', 'EXECUTED'].includes(insight.status)) {
      return NextResponse.json({ error: 'Insight cannot be fixed in this status' }, { status: 400 });
    }

    // ─── Preview mode: generate proposals ─────────────────────
    if (mode === 'preview') {
      const result = await generateInsightPreview(insight, site);
      return NextResponse.json(result);
    }

    // ─── Regenerate mode: regenerate one item ─────────────────
    if (mode === 'regenerate') {
      const itemIndex = typeof body.itemIndex === 'number' ? body.itemIndex : 0;
      const result = await regenerateItem(insight, site, itemIndex);
      return NextResponse.json(result);
    }

    // ─── Apply mode: push approved proposals to WordPress ─────
    if (mode === 'apply') {
      const proposals = body.proposals;
      if (!Array.isArray(proposals) || proposals.length === 0) {
        return NextResponse.json({ error: 'No proposals provided' }, { status: 400 });
      }

      const options = {
        generateFeaturedImages: body.generateFeaturedImages || false, // 1 credit per image
        generateContentImages: body.generateContentImages || false, // 2 credits per image, max 3
      };

      const result = await applyInsightFix(insight, site, proposals, options);

      // Merge with previously fixed items to track partial progress
      const prevResults = insight.executionResult?.results || [];
      const allResults = [...prevResults];
      for (const r of result.results) {
        const existingIdx = allResults.findIndex(p => p.postId === r.postId);
        if (existingIdx >= 0) allResults[existingIdx] = r;
        else allResults.push(r);
      }
      const mergedResult = { ...result, results: allResults };

      await prisma.agentInsight.update({
        where: { id },
        data: { executionResult: mergedResult },
      });

      return NextResponse.json({
        success: result.success,
        summary: result.summary,
        results: result.results,
      });
    }

    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
  } catch (error) {
    console.error('[Agent API] Fix insight error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
