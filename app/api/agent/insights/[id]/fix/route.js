import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { generateInsightPreview, applyInsightFix, regenerateItem, isFixableType, generateMergedContent, applyMergedContent } from '@/lib/agent-fix';
import { invalidateAgentInsights } from '@/lib/cache/invalidate.js';

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
        isSuperAdmin: true,
        lastSelectedAccountId: true,
        accountMemberships: { select: { accountId: true } },
      },
    });
  } catch {
    return null;
  }
}

// ─── Background fix execution ─────────────────────────────────────────

async function runFixInBackground(insightId, siteId, mode, executeFn) {
  try {
    const result = await executeFn();

    // Re-fetch insight to get latest executionResult
    const latest = await prisma.agentInsight.findUnique({ where: { id: insightId } });

    if (mode === 'generate') {
      // Store generated content for user preview
      await prisma.agentInsight.update({
        where: { id: insightId },
        data: {
          executionResult: {
            ...(latest?.executionResult || {}),
            fixStatus: 'GENERATED',
            fixCompletedAt: new Date().toISOString(),
            generatedContent: result.post,
          },
        },
      });
    } else {
      // For apply/apply-generated: merge results and mark completed
      const prevResults = latest?.executionResult?.results || [];
      const allResults = [...prevResults];
      for (const r of (result.results || [])) {
        const existingIdx = allResults.findIndex(p => p.postId === r.postId);
        if (existingIdx >= 0) allResults[existingIdx] = r;
        else allResults.push(r);
      }

      const updateData = {
        executionResult: {
          fixStatus: 'COMPLETED',
          fixCompletedAt: new Date().toISOString(),
          success: result.success,
          results: allResults,
          summary: result.summary,
          actions: result.actions || [],
        },
      };

      const isCannibalization = latest?.titleKey?.includes('cannibalization');
      if (isCannibalization && result.success) {
        updateData.status = 'EXECUTED';
        updateData.executedAt = new Date();
      }

      await prisma.agentInsight.update({
        where: { id: insightId },
        data: updateData,
      });
    }

    invalidateAgentInsights(siteId);
  } catch (error) {
    console.error(`[Agent Fix] Background ${mode} failed for insight ${insightId}:`, error);
    try {
      const latest = await prisma.agentInsight.findUnique({ where: { id: insightId } });
      await prisma.agentInsight.update({
        where: { id: insightId },
        data: {
          executionResult: {
            ...(latest?.executionResult || {}),
            fixStatus: 'FAILED',
            fixCompletedAt: new Date().toISOString(),
            fixError: error.message,
            fixMode: mode,
          },
        },
      });
      invalidateAgentInsights(siteId);
    } catch (dbErr) {
      console.error(`[Agent Fix] Failed to update error status for insight ${insightId}:`, dbErr);
    }
  }
}

/**
 * GET /api/agent/insights/[id]/fix
 * Poll the current fix status for background operations.
 */
export async function GET(request, { params }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const insight = await prisma.agentInsight.findUnique({
      where: { id },
      select: { id: true, siteId: true, status: true, executionResult: true },
    });
    if (!insight) {
      return NextResponse.json({ error: 'Insight not found' }, { status: 404 });
    }

    const site = await prisma.site.findUnique({
      where: { id: insight.siteId },
      select: { accountId: true },
    });
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const hasAccess = user.isSuperAdmin || user.accountMemberships.some(m => m.accountId === site.accountId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const execResult = insight.executionResult || {};
    return NextResponse.json({
      fixStatus: execResult.fixStatus || null,
      executionResult: execResult,
      insightStatus: insight.status,
    });
  } catch (error) {
    console.error('[Agent API] GET fix status error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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
        googleIntegration: {
          select: {
            id: true,
            gscConnected: true,
            gscSiteUrl: true,
            gaConnected: true,
            gaPropertyId: true,
            accessToken: true,
            refreshToken: true,
            tokenExpiresAt: true,
          },
        },
      },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const hasAccess = user.isSuperAdmin || user.accountMemberships.some(m => m.accountId === site.accountId);
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
      const result = await generateInsightPreview(insight, site, user.id);
      return NextResponse.json(result);
    }

    // ─── Regenerate mode: regenerate one item ─────────────────
    if (mode === 'regenerate') {
      const itemIndex = typeof body.itemIndex === 'number' ? body.itemIndex : 0;
      const result = await regenerateItem(insight, site, itemIndex);
      return NextResponse.json(result);
    }

    // ─── Generate mode: generate merged content (background) ────
    if (mode === 'generate') {
      const proposal = body.proposal;
      if (!proposal) {
        return NextResponse.json({ error: 'No proposal provided' }, { status: 400 });
      }

      // Prevent concurrent fix operations
      const currentFixStatus = insight.executionResult?.fixStatus;
      if (currentFixStatus === 'GENERATING' || currentFixStatus === 'APPLYING') {
        return NextResponse.json({ error: 'Fix already in progress', fixStatus: currentFixStatus }, { status: 409 });
      }

      const options = {
        generateFeaturedImages: body.generateFeaturedImages || false,
        wordCount: proposal.wordCount,
        articleType: proposal.articleType,
        mergeInstructions: proposal.mergeInstructions,
        contentImagesCount: proposal.contentImageCount || 0,
        featuredImagePrompt: proposal.featuredImagePrompt || '',
        contentImagesPrompt: proposal.contentImagesPrompt || '',
      };

      // Mark as generating and store proposal for later retrieval
      await prisma.agentInsight.update({
        where: { id },
        data: {
          executionResult: {
            ...(insight.executionResult || {}),
            fixStatus: 'GENERATING',
            fixStartedAt: new Date().toISOString(),
            fixMode: 'generate',
            fixProposal: proposal,
          },
        },
      });

      invalidateAgentInsights(insight.siteId);

      // Fire and forget - client polls GET for status
      runFixInBackground(id, insight.siteId, 'generate', () => generateMergedContent(insight, site, proposal, options)).catch(err => {
        console.error(`[Agent Fix] Background generate error for insight ${id}:`, err);
      });

      return NextResponse.json({ fixInProgress: true, fixStatus: 'GENERATING' });
    }

    // ─── Apply-generated mode: apply previously generated content (background) ─
    if (mode === 'apply-generated') {
      const { proposal, generatedPost } = body;
      if (!proposal || !generatedPost) {
        return NextResponse.json({ error: 'Missing proposal or generated content' }, { status: 400 });
      }

      // Prevent concurrent fix operations
      const currentFixStatus = insight.executionResult?.fixStatus;
      if (currentFixStatus === 'APPLYING') {
        return NextResponse.json({ error: 'Fix already in progress', fixStatus: currentFixStatus }, { status: 409 });
      }

      const options = {
        generateFeaturedImages: body.generateFeaturedImages || false,
        googleIntegration: site.googleIntegration || null,
      };

      // Mark as applying
      await prisma.agentInsight.update({
        where: { id },
        data: {
          executionResult: {
            ...(insight.executionResult || {}),
            fixStatus: 'APPLYING',
            fixStartedAt: new Date().toISOString(),
            fixMode: 'apply-generated',
          },
        },
      });

      invalidateAgentInsights(insight.siteId);

      // Fire and forget
      runFixInBackground(id, insight.siteId, 'apply-generated', () => applyMergedContent(insight, site, proposal, generatedPost, options)).catch(err => {
        console.error(`[Agent Fix] Background apply-generated error for insight ${id}:`, err);
      });

      return NextResponse.json({ fixInProgress: true, fixStatus: 'APPLYING' });
    }

    // ─── Apply mode: push approved proposals to WordPress ─────
    if (mode === 'apply') {
      const proposals = body.proposals;
      if (!Array.isArray(proposals) || proposals.length === 0) {
        return NextResponse.json({ error: 'No proposals provided' }, { status: 400 });
      }

      const options = {
        generateFeaturedImages: body.generateFeaturedImages || false,
        generateContentImages: body.generateContentImages || false,
      };

      const isCannibalization = insight.titleKey?.includes('cannibalization');

      if (isCannibalization) {
        // Prevent concurrent fix operations
        const currentFixStatus = insight.executionResult?.fixStatus;
        if (currentFixStatus === 'APPLYING') {
          return NextResponse.json({ error: 'Fix already in progress', fixStatus: currentFixStatus }, { status: 409 });
        }

        // Mark as applying
        await prisma.agentInsight.update({
          where: { id },
          data: {
            executionResult: {
              ...(insight.executionResult || {}),
              fixStatus: 'APPLYING',
              fixStartedAt: new Date().toISOString(),
              fixMode: 'apply',
            },
          },
        });

        invalidateAgentInsights(insight.siteId);

        // Fire and forget
        runFixInBackground(id, insight.siteId, 'apply', () => applyInsightFix(insight, site, proposals, options)).catch(err => {
          console.error(`[Agent Fix] Background apply error for insight ${id}:`, err);
        });

        return NextResponse.json({ fixInProgress: true, fixStatus: 'APPLYING' });
      }

      // Non-cannibalization: keep synchronous (fast SEO updates)
      const result = await applyInsightFix(insight, site, proposals, options);

      // Merge with previously fixed items
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

      invalidateAgentInsights(insight.siteId);

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
