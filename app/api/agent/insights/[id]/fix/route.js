import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { generateInsightPreview, applyInsightFix, regenerateItem, isFixableType, isFreeFixable, applyFreeFix, generateMergedContent, applyMergedContent } from '@/lib/agent-fix';
import { getFixerConfig, getInsightType } from '@/lib/agent-fix/registry.js';
import { invalidateAgentInsights } from '@/lib/cache/invalidate.js';
import { enforceCredits } from '@/lib/account-limits';
import { notifyThirdPartyAiFailure } from '@/lib/admin-alerts';

const SESSION_COOKIE = 'user_session';

// Lower-bound credit floor for AI fixes. Real charging is dynamic (token-based,
// inside generateStructuredResponse / generateImage); the preflight uses the
// per-type credits from the registry to refuse near-empty accounts BEFORE we
// kick off a call that's guaranteed to fail at deduction time. Free fixes
// (registry kind === 'free') bypass this entirely.
function getPreflightFloor(titleKey) {
  const cfg = getFixerConfig(titleKey);
  if (!cfg || cfg.kind !== 'ai') return 0;
  return cfg.credits || 3;
}

// Mirror of the audit dispatcher's classifier — Vertex/Gemini upstream
// failures bubble up as fetch errors with these markers.
function isThirdPartyAiError(e) {
  if (!e) return false;
  if (e.thirdParty === true) return true;
  const msg = String(e.message || '').toLowerCase();
  return (
    msg.includes('vertex')
    || msg.includes('gemini')
    || msg.includes('googleapis')
    || msg.includes('imagen')
    || msg.includes('resource_exhausted')
    || msg.includes('unavailable')
    || msg.includes('upstream')
    || /\b(429|500|502|503|504)\b/.test(msg)
  );
}

function aiApologyResponse(e, { operation, accountId, siteId, userId }) {
  notifyThirdPartyAiFailure({
    provider: e.provider || 'gemini',
    model: e.model,
    operation,
    errorMessage: e.message,
    accountId, siteId, userId,
  });
  return NextResponse.json({
    error: 'Our AI provider is temporarily unavailable. We have notified the team and you have not been charged.',
    code: 'AI_PROVIDER_FAILED',
    provider: e.provider || 'gemini',
  }, { status: 503 });
}

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
    const wasThirdParty = isThirdPartyAiError(error);
    if (wasThirdParty) {
      try {
        const insightForAlert = await prisma.agentInsight.findUnique({
          where: { id: insightId },
          select: { siteId: true, accountId: true },
        });
        notifyThirdPartyAiFailure({
          provider: error.provider || 'gemini',
          model: error.model,
          operation: `agent fix ${mode}`,
          errorMessage: error.message,
          accountId: insightForAlert?.accountId,
          siteId: insightForAlert?.siteId,
        });
      } catch { /* alert is best-effort */ }
    }
    try {
      const latest = await prisma.agentInsight.findUnique({ where: { id: insightId } });
      await prisma.agentInsight.update({
        where: { id: insightId },
        data: {
          executionResult: {
            ...(latest?.executionResult || {}),
            fixStatus: 'FAILED',
            fixCompletedAt: new Date().toISOString(),
            fixError: wasThirdParty
              ? 'Our AI provider is temporarily unavailable. We have notified the team and you have not been charged.'
              : error.message,
            fixErrorCode: wasThirdParty ? 'AI_PROVIDER_FAILED' : 'INTERNAL',
            wasThirdPartyError: wasThirdParty,
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
      fixError: execResult.fixError || null,
      fixErrorCode: execResult.fixErrorCode || null,
      wasThirdPartyError: !!execResult.wasThirdPartyError,
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

    if (!isFixableType(insight.titleKey)) {
      return NextResponse.json({ error: 'This insight type cannot be auto-fixed' }, { status: 400 });
    }

    // Some free fixes (e.g. rescanCompetitors) operate on platform DB only and
    // don't need a connected CMS. Everything else requires a live connection.
    const fixerCfg = getFixerConfig(insight.titleKey);
    const requiresConnection = fixerCfg?.requiresConnection !== false;
    if (requiresConnection && site.connectionStatus !== 'CONNECTED') {
      return NextResponse.json({ error: 'Plugin is not connected' }, { status: 400 });
    }

    if (!['PENDING', 'APPROVED', 'FAILED', 'EXECUTED'].includes(insight.status)) {
      return NextResponse.json({ error: 'Insight cannot be fixed in this status' }, { status: 400 });
    }

    const insightType = getInsightType(insight.titleKey);
    const isCannibalization = insightType === 'cannibalization';
    const isFree = isFreeFixable(insight.titleKey);

    // ─── Free fixes: short-circuit, skip credit gating + preview flow ──
    if (isFree) {
      if (mode !== 'apply' && mode !== 'preview') {
        return NextResponse.json({ error: 'Free fixes only support mode "apply"' }, { status: 400 });
      }
      // Free fixes don't have a preview phase — UI calls apply directly.
      // We still allow `mode: 'preview'` to return the no-op success so the
      // shared modal-open path doesn't have to special-case free fixers.
      if (mode === 'preview') {
        return NextResponse.json({ success: true, free: true, proposals: [] });
      }
      try {
        const result = await applyFreeFix(insight, site, body.itemIndices || null);
        // Merge with previously fixed items
        const prevResults = insight.executionResult?.results || [];
        const allResults = [...prevResults];
        for (const r of (result.results || [])) {
          const existingIdx = allResults.findIndex(p => p.url === r.url || p.postId === r.postId);
          if (existingIdx >= 0) allResults[existingIdx] = r;
          else allResults.push(r);
        }
        await prisma.agentInsight.update({
          where: { id },
          data: {
            executionResult: { ...result, results: allResults },
            ...(result.success ? { status: 'EXECUTED', executedAt: new Date() } : {}),
          },
        });
        invalidateAgentInsights(insight.siteId);
        return NextResponse.json({
          success: result.success,
          summary: result.summary,
          results: result.results,
          free: true,
        });
      } catch (e) {
        console.error(`[Agent Fix] Free fix error for ${insightType}:`, e);
        return NextResponse.json({ error: e.message || 'Internal server error' }, { status: 500 });
      }
    }

    // ─── Credit preflight (AI fixes only) ────────────────────
    // Refuse near-empty accounts BEFORE we kick off an AI call that's
    // guaranteed to fail at deduction time. The floor is a lower bound;
    // real charging is dynamic and happens inside the AI helpers.
    // 'apply' on cannibalization re-runs an AI generate so it's gated too.
    const billableModes = new Set(['preview', 'regenerate', 'generate']);
    if (isCannibalization && mode === 'apply') billableModes.add('apply');

    if (billableModes.has(mode)) {
      const floor = getPreflightFloor(insight.titleKey);
      const check = await enforceCredits(site.accountId, floor);
      if (!check.allowed) {
        return NextResponse.json({
          error: check.error || 'Insufficient AI credits',
          code: 'INSUFFICIENT_CREDITS',
          resourceKey: 'aiCredits',
          required: floor,
        }, { status: 402 });
      }
    }

    const apologyCtx = {
      accountId: site.accountId,
      siteId: site.id,
      userId: user.id,
    };

    // ─── Preview mode: generate proposals ─────────────────────
    // Cached on insight.executionResult.previewCache so re-opening the modal
    // doesn't re-charge token costs. Pass `fresh: true` to force regeneration.
    if (mode === 'preview') {
      const cached = insight.executionResult?.previewCache;
      if (cached?.result && !body.fresh) {
        return NextResponse.json({ ...cached.result, cached: true, cachedAt: cached.generatedAt });
      }

      let result;
      try {
        result = await generateInsightPreview(insight, site, user.id);
      } catch (e) {
        if (isThirdPartyAiError(e)) return aiApologyResponse(e, { operation: `preview ${insightType}`, ...apologyCtx });
        throw e;
      }

      // Only cache successful previews so a transient empty/error result isn't
      // remembered. Failed proposals can still be retried with regenerate.
      if (result?.success !== false) {
        await prisma.agentInsight.update({
          where: { id },
          data: {
            executionResult: {
              ...(insight.executionResult || {}),
              previewCache: {
                result,
                generatedAt: new Date().toISOString(),
              },
            },
          },
        }).catch((e) => console.warn('[Agent Fix] previewCache write failed:', e.message));
      }
      return NextResponse.json(result);
    }

    // ─── Regenerate mode: regenerate one item ─────────────────
    // Surgically replaces previewCache.result.proposals[itemIndex] so the
    // updated item is preserved on next modal re-open.
    if (mode === 'regenerate') {
      const itemIndex = typeof body.itemIndex === 'number' ? body.itemIndex : 0;
      let result;
      try {
        result = await regenerateItem(insight, site, itemIndex);
      } catch (e) {
        if (isThirdPartyAiError(e)) return aiApologyResponse(e, { operation: `regenerate ${insightType}`, ...apologyCtx });
        throw e;
      }

      const cached = insight.executionResult?.previewCache;
      if (result?.proposal && cached?.result?.proposals) {
        const updatedProposals = [...cached.result.proposals];
        updatedProposals[itemIndex] = result.proposal;
        await prisma.agentInsight.update({
          where: { id },
          data: {
            executionResult: {
              ...(insight.executionResult || {}),
              previewCache: {
                ...cached,
                result: { ...cached.result, proposals: updatedProposals },
                generatedAt: new Date().toISOString(),
              },
            },
          },
        }).catch((e) => console.warn('[Agent Fix] previewCache regenerate write failed:', e.message));
      }
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
      let result;
      try {
        result = await applyInsightFix(insight, site, proposals, options);
      } catch (e) {
        if (isThirdPartyAiError(e)) return aiApologyResponse(e, { operation: `apply ${insightType}`, ...apologyCtx });
        throw e;
      }

      // Merge with previously fixed items
      const prevResults = insight.executionResult?.results || [];
      const allResults = [...prevResults];
      for (const r of result.results) {
        const existingIdx = allResults.findIndex(p => p.postId === r.postId);
        if (existingIdx >= 0) allResults[existingIdx] = r;
        else allResults.push(r);
      }
      // executionResult is replaced wholesale here, which implicitly drops
      // previewCache — the proposals are now consumed; a future re-open
      // would regenerate against the post-apply state.
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
