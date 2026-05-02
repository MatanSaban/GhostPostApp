import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { runSiteAudit, runDiscovery } from '@/lib/audit/site-auditor';
import { enforceResourceLimit } from '@/lib/account-limits';
import { getLimitFromPlan } from '@/lib/account-utils';
import { getCachedAuditById } from '@/lib/cache/site-audit.js';
import { invalidateAudit } from '@/lib/cache/invalidate.js';

export const maxDuration = 300;

/**
 * Retry a Prisma query on transient MongoDB connection errors.
 */
async function withRetry(fn, retries = 2) {
  try {
    return await fn();
  } catch (err) {
    const isTransient =
      err?.code === 'P2010' ||
      err?.code === 'P2034' ||
      err?.message?.includes('forcibly closed') ||
      err?.message?.includes('ECONNRESET') ||
      err?.message?.includes('write conflict') ||
      err?.message?.includes('deadlock');
    if (isTransient && retries > 0) {
      const delay = 300 * (3 - retries);
      console.warn(`[API/audit] Transient DB error - retrying in ${delay}ms (${retries} left)…`);
      await new Promise(r => setTimeout(r, delay));
      return withRetry(fn, retries - 1);
    }
    throw err;
  }
}

// Fields sufficient for list view + polling (skips huge issues/pageResults)
const LIGHT_SELECT = {
  id: true,
  siteId: true,
  status: true,
  deviceType: true,
  score: true,
  categoryScores: true,
  pagesScanned: true,
  pagesFound: true,
  discoveryMethod: true,
  progress: true,
  phase: true,
  screenshots: true,
  summary: true,
  summaryTranslations: true,
  startedAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
};

const SESSION_COOKIE = 'user_session';

async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) return null;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        isSuperAdmin: true,
        accountMemberships: {
          select: {
            accountId: true,
          },
        },
      },
    });
    return user;
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

/**
 * Verify user has access to the given site
 */
async function verifySiteAccess(user, siteId) {
  const siteWhere = user.isSuperAdmin
      ? { id: siteId }
      : { id: siteId, accountId: { in: user.accountMemberships.map(m => m.accountId) } };
      const site = await prisma.site.findFirst({
      where: siteWhere,
    select: { id: true, url: true, name: true, accountId: true },
  });
  return site;
}

// ─── GET: Fetch audit(s) for a site ─────────────────────────────

export async function GET(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    const auditId = searchParams.get('auditId');
    const deviceType = searchParams.get('deviceType'); // "desktop" | "mobile"

    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
    }

    const site = await verifySiteAccess(user, siteId);
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // If specific audit requested - return full document (with issues + pageResults)
    if (auditId) {
      const audit = await withRetry(() =>
        getCachedAuditById({ auditId, siteId, accountId: site.accountId })
      );
      if (!audit) {
        return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
      }
      return NextResponse.json({ audit });
    }

    // Build filter - if deviceType is specified, filter by it
    const where = { siteId };
    if (deviceType) {
      where.deviceType = deviceType;
    }

    // Get audits for the site - LIGHT query (no issues/pageResults) for fast polling
    const audits = await withRetry(() =>
      prisma.siteAudit.findMany({
        where,
        select: LIGHT_SELECT,
        orderBy: { createdAt: 'desc' },
        take: 20,
      })
    );

    // Heartbeat-based watchdog. Every alive worker (legacy or chunked) writes
    // progress + advances `updatedAt` every few seconds. A multi-minute gap
    // means the worker is gone.
    //
    // Behavior depends on phase:
    //   • phase=null (legacy single-shot) or 'discovery' → mark FAILED.
    //   • phase='scanning'   → re-trigger /api/audit/continue. Only mark
    //                          FAILED if total wall time > HARD_LIMIT_MS.
    //   • phase='finalizing' → re-trigger /api/audit/finalize. Hard-fail
    //                          after FINAL_HARD_LIMIT_MS.
    const STALE_MS        = 5 * 60 * 1000;       // gap that means "worker dead"
    const HARD_LIMIT_MS   = 4 * 60 * 60 * 1000;  // total wall time before scanning is given up
    const FINAL_HARD_LIMIT_MS = 30 * 60 * 1000;  // finalizing should never legitimately take this long
    const now = Date.now();
    const origin = request.nextUrl.origin;

    for (const audit of audits) {
      if (audit.status !== 'PENDING' && audit.status !== 'RUNNING') continue;

      const lastTouch = audit.updatedAt || audit.startedAt || audit.createdAt;
      const startedAt = audit.startedAt || audit.createdAt;
      if (now - new Date(lastTouch).getTime() <= STALE_MS) continue;

      const phase = audit.phase || null;
      const totalAge = now - new Date(startedAt).getTime();

      // Resumable phases: re-trigger their next stage instead of FAILing,
      // unless we've blown past the absolute time budget.
      if (phase === 'scanning' && totalAge < HARD_LIMIT_MS) {
        console.warn(`[API/audit] GET: nudging stalled scanning audit ${audit.id} via /continue`);
        fetch(`${origin}/api/audit/continue?auditId=${audit.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }).catch(() => {});
        continue;
      }
      if (phase === 'finalizing' && totalAge < FINAL_HARD_LIMIT_MS) {
        console.warn(`[API/audit] GET: nudging stalled finalizing audit ${audit.id} via /finalize`);
        fetch(`${origin}/api/audit/finalize?auditId=${audit.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }).catch(() => {});
        continue;
      }

      // Legacy or non-resumable: mark FAILED with the same shape as before.
      const p = audit.progress || {};
      const stuckAt = p.labelKey || 'unknown';
      const stuckStep = p.currentStep ?? null;
      const stuckTotal = p.totalSteps ?? null;
      console.warn(
        `[API/audit] GET: marking stale audit ${audit.id} as FAILED (phase=${phase || 'legacy'}, stuck at: ${stuckAt}${stuckStep != null ? ` step ${stuckStep}/${stuckTotal}` : ''})`
      );
      audit.status = 'FAILED';
      audit.completedAt = new Date();
      audit.score = 0;
      prisma.siteAudit.update({
        where: { id: audit.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          score: 0,
          issues: [{
            type: 'technical',
            severity: 'error',
            message: 'audit.issues.auditTimedOut',
            suggestion: 'audit.suggestions.retryAudit',
            source: 'system',
            details: JSON.stringify({
              stuckAt, currentStep: stuckStep, totalSteps: stuckTotal,
              deviceType: audit.deviceType || null, phase,
            }),
          }],
        },
      })
        .then(() => invalidateAudit(siteId))
        .catch((err) => console.error(`[API/audit] GET stale-fail update for ${audit.id} failed:`, err));
    }

    // Also get the latest (for quick access)
    const latest = audits.length > 0 ? audits[0] : null;

    // Get plan max pages for UI display
    const accountWithPlan = await prisma.site.findUnique({
      where: { id: siteId },
      select: {
        account: {
          select: {
            subscription: {
              select: { plan: { select: { limitations: true } } },
            },
          },
        },
      },
    });
    const planLimitations = accountWithPlan?.account?.subscription?.plan?.limitations;
    const planMaxPages = getLimitFromPlan(planLimitations, 'maxAuditPages', 500) || 500;

    return NextResponse.json({ audits, latest, planMaxPages });
  } catch (error) {
    console.error('[API/audit] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── POST: Start a new audit ────────────────────────────────────

export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { siteId, maxPages: requestedMaxPages, urls: requestedUrls } = await request.json();

    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
    }

    const site = await verifySiteAccess(user, siteId);
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // ── Enforce siteAudits plan limit ────────────────────────
    const accountWithPlan = await prisma.site.findUnique({
      where: { id: siteId },
      select: {
        accountId: true,
        account: {
          select: {
            subscription: {
              select: {
                plan: { select: { limitations: true } },
              },
            },
          },
        },
      },
    });
    const accountId = accountWithPlan?.accountId;

    if (accountId) {
      const limitCheck = await enforceResourceLimit(accountId, 'siteAudits');
      if (!limitCheck.allowed) {
        return NextResponse.json(limitCheck, { status: 403 });
      }
    }

    // ── Determine max pages from plan ────────────────────────
    const planLimitations = accountWithPlan?.account?.subscription?.plan?.limitations;
    const planMaxPages = getLimitFromPlan(planLimitations, 'maxAuditPages', 500) || 500;
    // User-requested limit, capped by plan
    const maxPages = requestedMaxPages
      ? Math.min(Math.max(1, Math.floor(Number(requestedMaxPages))), planMaxPages)
      : planMaxPages;

    // Check if there's already a running audit for this site
    const runningAudits = await prisma.siteAudit.findMany({
      where: {
        siteId,
        status: { in: ['PENDING', 'RUNNING'] },
      },
    });

    // Mark audits whose worker has stopped writing progress as FAILED so we
    // don't block new scans. Keyed off updatedAt — the audit pipeline writes
    // progress every few seconds while alive.
    const STALE_MS = 5 * 60 * 1000;
    const now = Date.now();
    const stillRunning = [];

    for (const audit of runningAudits) {
      const lastTouch = audit.updatedAt || audit.startedAt || audit.createdAt;
      if (now - new Date(lastTouch).getTime() > STALE_MS) {
        const p = audit.progress || {};
        const stuckAt = p.labelKey || 'unknown';
        const stuckStep = p.currentStep ?? null;
        const stuckTotal = p.totalSteps ?? null;
        console.warn(
          `[API/audit] Marking stale audit ${audit.id} as FAILED (stuck at: ${stuckAt}${stuckStep != null ? ` step ${stuckStep}/${stuckTotal}` : ''}, last touch ${lastTouch})`
        );
        await prisma.siteAudit.update({
          where: { id: audit.id },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            score: 0,
            issues: [{
              type: 'technical',
              severity: 'error',
              message: 'audit.issues.auditTimedOut',
              suggestion: 'audit.suggestions.retryAudit',
              source: 'system',
              details: JSON.stringify({
                stuckAt,
                currentStep: stuckStep,
                totalSteps: stuckTotal,
                deviceType: audit.deviceType || null,
              }),
            }],
          },
        }).catch((err) => console.error(`[API/audit] POST stale-fail update for ${audit.id} failed:`, err));
        invalidateAudit(siteId);
      } else {
        stillRunning.push(audit);
      }
    }

    if (stillRunning.length > 0) {
      return NextResponse.json({ 
        audits: stillRunning,
        message: 'An audit is already running for this site',
      });
    }

    // Create TWO separate audit records - one for desktop, one for mobile
    const desktopAudit = await prisma.siteAudit.create({
      data: {
        siteId,
        status: 'PENDING',
        deviceType: 'desktop',
      },
    });

    const mobileAudit = await prisma.siteAudit.create({
      data: {
        siteId,
        status: 'PENDING',
        deviceType: 'mobile',
      },
    });

    // Start both audits in the background (fire & forget)
    // Validate and sanitize URLs if provided
    const urls = Array.isArray(requestedUrls)
      ? requestedUrls.filter(u => typeof u === 'string' && u.startsWith('http')).slice(0, maxPages)
      : null;

    // Pull the initiating user's locale so the summary generator can
    // pre-cache a translation for them. Falls back to 'en'.
    const localeCookie = (await cookies()).get('ghostseo-locale')?.value;
    const userLocale = localeCookie || 'en';

    const auditOptions = {
      maxPages,
      userId: user.id,
      userLocale,
      ...(urls?.length ? { urls } : {}),
    };

    // ── Dispatch: chunked pipeline (new) vs single-shot (legacy) ──────
    // Flag-gated rollout. New audits with the flag ON go through
    // runDiscovery → /api/audit/continue → /api/audit/finalize. Old audits
    // (phase=null in DB) keep running on whatever path created them.
    const useChunked = process.env.AUDIT_CHUNKED_EXECUTION === '1' || process.env.AUDIT_CHUNKED_EXECUTION === 'true';

    if (useChunked) {
      const origin = request.nextUrl.origin;
      const startChunked = async (auditRecord, deviceType) => {
        try {
          const disc = await runDiscovery(auditRecord.id, site.url, siteId, deviceType, auditOptions);
          if (!disc.ok || disc.empty) return; // discovery already wrote terminal state
          // Kick off the first chunk. Subsequent chunks self-trigger.
          fetch(`${origin}/api/audit/continue?auditId=${auditRecord.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          }).catch((err) => {
            console.error(`[API/audit] Initial /continue trigger failed for ${auditRecord.id}:`, err.message);
          });
        } catch (err) {
          console.error(`[API/audit] Chunked discovery error for ${auditRecord.id}:`, err);
        }
      };
      // Both runs in parallel — same as legacy.
      startChunked(desktopAudit, 'desktop');
      startChunked(mobileAudit, 'mobile');
    } else {
      runSiteAudit(desktopAudit.id, site.url, siteId, 'desktop', auditOptions).catch(err => {
        console.error(`[API/audit] Background desktop audit error for ${desktopAudit.id}:`, err);
      });
      runSiteAudit(mobileAudit.id, site.url, siteId, 'mobile', auditOptions).catch(err => {
        console.error(`[API/audit] Background mobile audit error for ${mobileAudit.id}:`, err);
      });
    }

    return NextResponse.json({
      audits: [desktopAudit, mobileAudit],
      message: 'Desktop and mobile audits started',
      maxPages,
      planMaxPages,
      pipeline: useChunked ? 'chunked' : 'legacy',
    });
  } catch (error) {
    console.error('[API/audit] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── DELETE: Force-fail a stuck audit (superadmin / dev only) ────
//
// The in-flight worker (if still alive) keeps running — we can't reach across
// processes to abort it. But once the DB record is FAILED, the polling UI
// flips to the failed card immediately and a new audit can be started; any
// late write from the dead worker just updates a record that's already done.
export async function DELETE(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isDev = process.env.NODE_ENV === 'development';
    if (!user.isSuperAdmin && !isDev) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const auditId = searchParams.get('auditId');
    const siteId = searchParams.get('siteId');

    if (!auditId || !siteId) {
      return NextResponse.json({ error: 'auditId and siteId are required' }, { status: 400 });
    }

    const site = await verifySiteAccess(user, siteId);
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const audit = await prisma.siteAudit.findFirst({
      where: { id: auditId, siteId },
      select: { id: true, status: true, progress: true, deviceType: true },
    });
    if (!audit) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    }
    if (audit.status !== 'PENDING' && audit.status !== 'RUNNING') {
      return NextResponse.json({ error: 'Audit is not running' }, { status: 409 });
    }

    const p = audit.progress || {};
    await prisma.siteAudit.update({
      where: { id: auditId },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        score: 0,
        progress: { ...p, failureReason: 'CANCELLED_BY_USER' },
        issues: [{
          type: 'technical',
          severity: 'error',
          message: 'audit.issues.auditCancelled',
          suggestion: 'audit.suggestions.retryAudit',
          source: 'system',
          details: JSON.stringify({
            cancelledBy: user.id,
            stuckAt: p.labelKey || 'unknown',
            currentStep: p.currentStep ?? null,
            totalSteps: p.totalSteps ?? null,
            deviceType: audit.deviceType || null,
          }),
        }],
      },
    });
    await invalidateAudit(siteId);

    console.warn(`[API/audit] DELETE: audit ${auditId} force-failed by ${user.id} (superadmin=${user.isSuperAdmin}, dev=${isDev})`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[API/audit] DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
