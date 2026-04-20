import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { runSiteAudit } from '@/lib/audit/site-auditor';
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

    // Auto-fail audits stuck in PENDING/RUNNING for >15 min
    // (e.g. background process died after server restart)
    const STALE_MS = 15 * 60 * 1000;
    const now = Date.now();
    for (const audit of audits) {
      if (audit.status === 'PENDING' || audit.status === 'RUNNING') {
        const started = audit.startedAt || audit.createdAt;
        if (now - new Date(started).getTime() > STALE_MS) {
          console.warn(`[API/audit] GET: marking stale audit ${audit.id} as FAILED`);
          audit.status = 'FAILED';
          audit.completedAt = new Date();
          audit.score = 0;
          // Fire-and-forget DB update
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
              }],
            },
          })
            .then(() => invalidateAudit(siteId))
            .catch(() => {});
        }
      }
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

    // Mark audits stuck for >15 min as FAILED so we don't block new scans
    const STALE_MS = 15 * 60 * 1000;
    const now = Date.now();
    const stillRunning = [];

    for (const audit of runningAudits) {
      const started = audit.startedAt || audit.createdAt;
      if (now - new Date(started).getTime() > STALE_MS) {
        console.warn(`[API/audit] Marking stale audit ${audit.id} as FAILED (stuck since ${started})`);
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
            }],
          },
        }).catch(() => {});
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
    const auditOptions = { maxPages, userId: user.id, ...(urls?.length ? { urls } : {}) };
    runSiteAudit(desktopAudit.id, site.url, siteId, 'desktop', auditOptions).catch(err => {
      console.error(`[API/audit] Background desktop audit error for ${desktopAudit.id}:`, err);
    });
    runSiteAudit(mobileAudit.id, site.url, siteId, 'mobile', auditOptions).catch(err => {
      console.error(`[API/audit] Background mobile audit error for ${mobileAudit.id}:`, err);
    });

    return NextResponse.json({
      audits: [desktopAudit, mobileAudit],
      message: 'Desktop and mobile audits started',
      maxPages,
      planMaxPages,
    });
  } catch (error) {
    console.error('[API/audit] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
