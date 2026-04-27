/**
 * Unified Fix Dispatcher
 *
 * Single endpoint for the entire AI Fix / Free Fix surface in the site audit.
 * Replaces the previous per-issue routes (apply-title-fix, apply-description-fix,
 * apply-og-fix, apply-alt-fix, apply-image-format-fix, fix-noindex,
 * fix-security-headers, set-favicon, fix-issue, etc.) by routing through the
 * fix-registry to per-handler modules in lib/audit/fixers/.
 *
 * Actions:
 *   preview — Generate AI suggestions (or compute manual-output for non-WP).
 *             For WP+plugin: free, cached on the audit doc until next run.
 *             For non-WP / no-plugin: full charge on success (preview = result).
 *
 *   apply   — Push the user-confirmed values via the WP plugin and update
 *             the audit issues in-place. Charges full price on success.
 *
 *   cancel  — User opened a preview then closed without applying. If the
 *             preview was already cached but never applied, charge the
 *             cancel-fee (half, rounded down to even). Two consecutive
 *             cancels of the same cached preview only charge once.
 *
 * Errors from third-party AI providers (Gemini, Imagen) trigger a SuperAdmin
 * email and return a "tryLater" code — the user is NOT charged.
 *
 * Body shape:
 *   { auditId, siteId, issueType, action: 'preview'|'apply'|'cancel', payload? }
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { getFixer } from '@/lib/audit/fix-registry';
import { cancelCharge } from '@/lib/ai/credit-pricing';
import { deductAiCredits } from '@/lib/account-utils';
import { enforceCredits } from '@/lib/account-limits';
import { notifyThirdPartyAiFailure } from '@/lib/admin-alerts';
import { invalidateAudit } from '@/lib/cache/invalidate.js';
import { getHandler } from '@/lib/audit/fixers';

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
        accountMemberships: { select: { accountId: true } },
      },
    });
  } catch {
    return null;
  }
}

function isPluginConnected(site) {
  return site?.platform === 'wordpress'
    && site?.connectionStatus === 'CONNECTED'
    && !!site?.siteKey;
}

function err(status, code, message, extra = {}) {
  return NextResponse.json({ error: message, code, ...extra }, { status });
}

// ─── Audit preview cache (lives on audit.fixPreviews JSON field) ─────

async function readPreview(auditId, issueType) {
  const audit = await prisma.siteAudit.findUnique({
    where: { id: auditId },
    select: { fixPreviews: true },
  });
  return audit?.fixPreviews?.[issueType] || null;
}

async function writePreview(auditId, issueType, entry) {
  const audit = await prisma.siteAudit.findUnique({
    where: { id: auditId },
    select: { fixPreviews: true },
  });
  const previews = { ...(audit?.fixPreviews || {}), [issueType]: entry };
  await prisma.siteAudit.update({
    where: { id: auditId },
    data: { fixPreviews: previews },
  });
}

async function markPreviewCharged(auditId, issueType, type, creditsUsed) {
  const audit = await prisma.siteAudit.findUnique({
    where: { id: auditId },
    select: { fixPreviews: true },
  });
  const existing = audit?.fixPreviews?.[issueType];
  if (!existing) return;
  const next = {
    ...existing,
    charged: { ...(existing.charged || {}), [type]: creditsUsed },
  };
  const previews = { ...(audit?.fixPreviews || {}), [issueType]: next };
  await prisma.siteAudit.update({
    where: { id: auditId },
    data: { fixPreviews: previews },
  });
}

// ─── Dispatcher entry point ──────────────────────────────────────────

export async function POST(request) {
  const startedAt = Date.now();
  try {
    const user = await getAuthenticatedUser();
    if (!user) return err(401, 'UNAUTHORIZED', 'Unauthorized');

    const body = await request.json();
    const { auditId, siteId, issueType, action, payload = {} } = body || {};

    if (!auditId || !siteId || !issueType || !action) {
      return err(400, 'BAD_REQUEST', 'auditId, siteId, issueType, action are required');
    }
    if (!['preview', 'apply', 'cancel'].includes(action)) {
      return err(400, 'BAD_REQUEST', `Unknown action: ${action}`);
    }

    const fixer = getFixer(issueType);
    if (!fixer) {
      return err(400, 'NOT_FIXABLE', `No fixer registered for ${issueType}`);
    }

    // ── Site access ──
    const accountIds = user.accountMemberships.map((m) => m.accountId);
    const site = await prisma.site.findFirst({
      where: user.isSuperAdmin
        ? { id: siteId }
        : { id: siteId, accountId: { in: accountIds } },
      select: {
        id: true, url: true, name: true, accountId: true,
        platform: true, connectionStatus: true, siteKey: true, siteSecret: true,
      },
    });
    if (!site) return err(404, 'SITE_NOT_FOUND', 'Site not found');

    const handler = getHandler(fixer.handler);
    if (!handler) {
      return err(500, 'HANDLER_MISSING', `Handler not implemented: ${fixer.handler}`);
    }

    const wpAuto = isPluginConnected(site);
    const ctx = { user, site, fixer, issueType, payload, wpAuto, accountId: site.accountId };

    if (action === 'preview') return handlePreview(ctx, auditId);
    if (action === 'apply')   return handleApply(ctx, auditId, handler);
    if (action === 'cancel')  return handleCancel(ctx, auditId);
  } catch (error) {
    console.error('[API/audit/fix] Dispatcher error:', error);
    return err(500, 'INTERNAL', 'Internal server error');
  } finally {
    // Light timing log so we notice if a handler stalls.
    const ms = Date.now() - startedAt;
    if (ms > 5000) console.warn(`[API/audit/fix] Slow request: ${ms}ms`);
  }
}

// ─── Action: preview ─────────────────────────────────────────────────

async function handlePreview(ctx, auditId) {
  const { fixer, issueType, payload, wpAuto, accountId, user, site } = ctx;
  const handler = getHandler(fixer.handler);

  // 1. Cache hit — return immediately, no charge, no AI call.
  const cached = await readPreview(auditId, issueType);
  if (cached?.suggestions || cached?.manualOutputs) {
    return NextResponse.json({
      success: true,
      cached: true,
      suggestions: cached.suggestions || null,
      manualOutputs: cached.manualOutputs || null,
      previewable: !!fixer.previewable,
      kind: fixer.kind,
      fixedCredits: fixer.kind === 'ai' ? fixer.credits : 0,
    });
  }

  // 2. Pre-flight credit check for AI fixers (avoid AI call we can't bill).
  if (fixer.kind === 'ai') {
    const check = await enforceCredits(accountId, fixer.credits);
    if (!check.allowed) {
      return err(402, 'INSUFFICIENT_CREDITS', check.error || 'Insufficient Ai-GCoins', {
        resourceKey: 'aiCredits',
        required: fixer.credits,
      });
    }
  }

  // 3. Generate the preview.
  let preview;
  try {
    preview = await handler.preview({ site, payload, wpAuto });
  } catch (e) {
    if (isThirdPartyAiError(e)) {
      notifyThirdPartyAiFailure({
        provider: e.provider || 'gemini',
        model: e.model,
        operation: `preview ${issueType}`,
        errorMessage: e.message,
        accountId, siteId: site.id, userId: user.id,
      });
      return err(503, 'AI_PROVIDER_FAILED',
        'Our AI provider is temporarily unavailable. We have notified the team and you have not been charged.',
        { provider: e.provider || 'gemini' });
    }
    console.error('[fix] preview handler crashed:', e);
    return err(500, 'PREVIEW_FAILED', e.message || 'Preview failed');
  }

  // Handler must return one of:
  //   { suggestions: [...], usage }     — WP-auto path: AI suggested fixes
  //   { manualOutputs: [...], usage }   — non-WP path: ready-to-copy outputs
  if (!preview || (!preview.suggestions && !preview.manualOutputs)) {
    return err(500, 'PREVIEW_EMPTY', 'Handler returned no preview');
  }

  // 4. Charging logic split:
  //    - WP-auto: preview is free; user can review/edit before applying.
  //    - Non-WP / no-plugin: the preview IS the deliverable, charge full now.
  let creditsCharged = 0;
  let balance;
  const charged = {}; // { preview?: N, apply?: N, cancel?: N }

  if (fixer.kind === 'ai' && !wpAuto) {
    const dedu = await deductAiCredits(accountId, fixer.credits, {
      userId: user.id,
      siteId: site.id,
      source: `audit_fix:${fixer.handler}:preview-only`,
      description: `AI Fix (manual delivery): ${issueType}`,
      metadata: {
        issueType,
        wpAuto: false,
        ...(preview.usage || {}),
      },
    });
    if (!dedu.success) {
      return err(402, 'CHARGE_FAILED', dedu.error || 'Failed to charge Ai-GCoins');
    }
    creditsCharged = fixer.credits;
    balance = dedu.balance;
    charged.preview = creditsCharged;
  }

  // 5. Cache the preview on the audit doc so re-opens are free.
  await writePreview(auditId, issueType, {
    suggestions: preview.suggestions || null,
    manualOutputs: preview.manualOutputs || null,
    usage: preview.usage || null,
    generatedAt: new Date().toISOString(),
    charged,
  });

  return NextResponse.json({
    success: true,
    cached: false,
    suggestions: preview.suggestions || null,
    manualOutputs: preview.manualOutputs || null,
    previewable: !!fixer.previewable,
    kind: fixer.kind,
    fixedCredits: fixer.kind === 'ai' ? fixer.credits : 0,
    creditsUsed: creditsCharged,
    remainingBalance: balance,
  });
}

// ─── Action: apply ───────────────────────────────────────────────────

async function handleApply(ctx, auditId, handler) {
  const { fixer, issueType, payload, wpAuto, accountId, user, site } = ctx;

  if (!wpAuto) {
    return err(400, 'WP_REQUIRED',
      'Apply is only available for WordPress sites with the plugin connected. Use the manual instructions instead.');
  }

  const cached = await readPreview(auditId, issueType);
  // The user MAY apply with edited values that differ from cache; that's
  // fine — the modal sends the final values in payload.fixes. Cache only
  // matters for charge-deduplication (so we don't double-bill).

  // Pre-flight: AI fixers charge full price on apply (unless we already
  // charged at preview time on the no-plugin path — but apply is gated to
  // wpAuto so that case can't happen here).
  let creditsCharged = 0;
  let balance;
  if (fixer.kind === 'ai') {
    const alreadyCharged = cached?.charged?.apply || 0;
    if (alreadyCharged > 0) {
      // Idempotent re-apply — don't charge again.
      creditsCharged = 0;
    } else {
      const check = await enforceCredits(accountId, fixer.credits);
      if (!check.allowed) {
        return err(402, 'INSUFFICIENT_CREDITS', check.error || 'Insufficient Ai-GCoins', {
          resourceKey: 'aiCredits',
          required: fixer.credits,
        });
      }
    }
  }

  // Run the apply handler — pushes to plugin + updates audit issues.
  let result;
  try {
    result = await handler.apply({ site, payload, audit: { id: auditId }, wpAuto });
  } catch (e) {
    if (isThirdPartyAiError(e)) {
      notifyThirdPartyAiFailure({
        provider: e.provider || 'gemini',
        model: e.model,
        operation: `apply ${issueType}`,
        errorMessage: e.message,
        accountId, siteId: site.id, userId: user.id,
      });
      return err(503, 'AI_PROVIDER_FAILED',
        'Our AI provider is temporarily unavailable. We have notified the team and you have not been charged.',
        { provider: e.provider || 'gemini' });
    }
    console.error('[fix] apply handler crashed:', e);
    return err(500, 'APPLY_FAILED', e.message || 'Apply failed');
  }

  const successCount = (result?.results || []).filter((r) => r.pushed).length;
  if (successCount === 0) {
    // Nothing pushed — don't charge.
    return NextResponse.json({
      success: false,
      results: result?.results || [],
      auditUpdated: false,
      creditsUsed: 0,
    }, { status: 207 });
  }

  // Charge proportionally if some items failed (e.g. user wanted 10, 6 succeeded).
  if (fixer.kind === 'ai' && (cached?.charged?.apply || 0) === 0) {
    const requested = (payload?.fixes?.length) || 1;
    const proportion = Math.min(1, successCount / requested);
    const rawCharge = Math.round(fixer.credits * proportion);
    const finalCharge = Math.max(2, rawCharge % 2 === 0 ? rawCharge : rawCharge + 1);

    const dedu = await deductAiCredits(accountId, finalCharge, {
      userId: user.id,
      siteId: site.id,
      source: `audit_fix:${fixer.handler}:apply`,
      description: `AI Fix applied: ${issueType} (${successCount}/${requested})`,
      metadata: {
        issueType,
        successCount,
        requested,
        fixedPrice: fixer.credits,
        proportionalCharge: finalCharge,
      },
    });
    if (dedu.success) {
      creditsCharged = finalCharge;
      balance = dedu.balance;
      await markPreviewCharged(auditId, issueType, 'apply', finalCharge);
    } else {
      console.warn('[fix] post-apply deduction failed:', dedu.error);
    }
  }

  if (result?.auditUpdated) invalidateAudit(site.id);

  return NextResponse.json({
    success: true,
    results: result.results,
    auditUpdated: !!result.auditUpdated,
    creditsUsed: creditsCharged,
    remainingBalance: balance,
  });
}

// ─── Action: cancel ──────────────────────────────────────────────────

async function handleCancel(ctx, auditId) {
  const { fixer, issueType, accountId, user, site } = ctx;

  // Only AI previews on the WP-auto path can incur a cancel charge.
  // (Manual-delivery previews already charged at preview time.)
  // Free fixes never charge.
  if (fixer.kind !== 'ai') {
    return NextResponse.json({ success: true, creditsUsed: 0, reason: 'not-billable' });
  }

  const cached = await readPreview(auditId, issueType);
  if (!cached) {
    return NextResponse.json({ success: true, creditsUsed: 0, reason: 'no-preview' });
  }
  if (cached.charged?.preview || cached.charged?.apply || cached.charged?.cancel) {
    // Already settled — opening again is free, closing again is free.
    return NextResponse.json({ success: true, creditsUsed: 0, reason: 'already-charged' });
  }

  const fee = cancelCharge(fixer.credits);
  if (fee <= 0) {
    await markPreviewCharged(auditId, issueType, 'cancel', 0);
    return NextResponse.json({ success: true, creditsUsed: 0, reason: 'below-threshold' });
  }

  const dedu = await deductAiCredits(accountId, fee, {
    userId: user.id,
    siteId: site.id,
    source: `audit_fix:${fixer.handler}:cancel`,
    description: `AI Fix preview cancelled: ${issueType}`,
    metadata: {
      issueType,
      fixedPrice: fixer.credits,
      cancelFee: fee,
    },
  });
  if (!dedu.success) {
    return err(402, 'CHARGE_FAILED', dedu.error || 'Failed to charge cancel fee');
  }
  await markPreviewCharged(auditId, issueType, 'cancel', fee);

  return NextResponse.json({
    success: true,
    creditsUsed: fee,
    remainingBalance: dedu.balance,
  });
}

// ─── Error classification ────────────────────────────────────────────

function isThirdPartyAiError(e) {
  // Vertex / Google AI SDK errors usually surface as fetch failures with
  // 5xx status, "RESOURCE_EXHAUSTED", "UNAVAILABLE", or upstream 429s.
  if (!e) return false;
  if (e.thirdParty === true) return true; // explicit flag from handler
  const msg = String(e.message || '').toLowerCase();
  return (
    msg.includes('vertex') ||
    msg.includes('gemini') ||
    msg.includes('googleapis') ||
    msg.includes('resource_exhausted') ||
    msg.includes('unavailable') ||
    msg.includes('upstream') ||
    /\b(429|500|502|503|504)\b/.test(msg)
  );
}
