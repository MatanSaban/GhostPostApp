import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { runSiteAudit } from '@/lib/audit/site-auditor';
import { enforceResourceLimit } from '@/lib/account-limits';

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
  const accountIds = user.accountMemberships.map(m => m.accountId);
  const site = await prisma.site.findFirst({
    where: {
      id: siteId,
      accountId: { in: accountIds },
    },
    select: { id: true, url: true, name: true },
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

    // If specific audit requested
    if (auditId) {
      const audit = await prisma.siteAudit.findFirst({
        where: { id: auditId, siteId },
      });
      if (!audit) {
        return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
      }
      return NextResponse.json({ audit });
    }

    // Build filter — if deviceType is specified, filter by it
    const where = { siteId };
    if (deviceType) {
      where.deviceType = deviceType;
    }

    // Get all audits for the site, most recent first
    const audits = await prisma.siteAudit.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // Also get the latest (for quick access)
    const latest = audits.length > 0 ? audits[0] : null;

    return NextResponse.json({ audits, latest });
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

    const { siteId } = await request.json();

    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
    }

    const site = await verifySiteAccess(user, siteId);
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // ── Enforce siteAudits plan limit ────────────────────────
    const accountId = (await prisma.site.findUnique({
      where: { id: siteId },
      select: { accountId: true },
    }))?.accountId;

    if (accountId) {
      const limitCheck = await enforceResourceLimit(accountId, 'siteAudits');
      if (!limitCheck.allowed) {
        return NextResponse.json(limitCheck, { status: 403 });
      }
    }

    // Check if there's already a running audit for this site
    const runningAudit = await prisma.siteAudit.findFirst({
      where: {
        siteId,
        status: { in: ['PENDING', 'RUNNING'] },
      },
    });

    if (runningAudit) {
      return NextResponse.json({ 
        audits: [runningAudit],
        message: 'An audit is already running for this site',
      });
    }

    // Create TWO separate audit records — one for desktop, one for mobile
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
    runSiteAudit(desktopAudit.id, site.url, siteId, 'desktop').catch(err => {
      console.error(`[API/audit] Background desktop audit error for ${desktopAudit.id}:`, err);
    });
    runSiteAudit(mobileAudit.id, site.url, siteId, 'mobile').catch(err => {
      console.error(`[API/audit] Background mobile audit error for ${mobileAudit.id}:`, err);
    });

    return NextResponse.json({
      audits: [desktopAudit, mobileAudit],
      message: 'Desktop and mobile audits started',
    });
  } catch (error) {
    console.error('[API/audit] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
