import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { aggregateIssues, getSeverityCounts } from '@/lib/audit/issues-helper';

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
  } catch (e) {
    console.error('[API/audit/issues/aggregate] auth error:', e.message);
    return null;
  }
}

/**
 * GET /api/audit/issues/aggregate?auditId=X[&siteId=Y][&category=technical|performance|visual|accessibility]
 *
 * Returns aggregated issue rows + severity counts. Replaces the client-side
 * `aggregateIssuesByCategory` call that used to run on the full issues array.
 *
 * Server-side aggregation keeps response payload tiny (one row per unique
 * message, ~50 rows for a typical audit) regardless of total issue count.
 *
 * Response shape:
 *   {
 *     rows: [{ key, message, severity, type, source, suggestion, details, count, urls[], device }],
 *     severityCounts: { passed, warnings, errors, info },
 *   }
 */
export async function GET(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const auditId = searchParams.get('auditId');
    const siteId = searchParams.get('siteId');
    const category = searchParams.get('category');

    if (!auditId) {
      return NextResponse.json({ error: 'auditId required' }, { status: 400 });
    }

    // Verify the user can access this audit's site. We need the audit's siteId
    // either from the query (cheap path) or from the audit itself (one indexed read).
    let resolvedSiteId = siteId;
    if (!resolvedSiteId) {
      const audit = await prisma.siteAudit.findUnique({
        where: { id: auditId },
        select: { siteId: true },
      });
      if (!audit) return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
      resolvedSiteId = audit.siteId;
    }

    const accountIds = user.accountMemberships.map((m) => m.accountId);
    const site = await prisma.site.findFirst({
      where: user.isSuperAdmin
        ? { id: resolvedSiteId }
        : { id: resolvedSiteId, accountId: { in: accountIds } },
      select: { id: true },
    });
    if (!site) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const [rows, severityCounts] = await Promise.all([
      aggregateIssues(auditId, category ? { category } : {}),
      getSeverityCounts(auditId),
    ]);

    return NextResponse.json({ rows, severityCounts });
  } catch (error) {
    console.error('[API/audit/issues/aggregate] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
