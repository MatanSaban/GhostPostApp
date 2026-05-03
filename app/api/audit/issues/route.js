import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { getIssuesByMessage, getIssuesByUrl, getIssuesByCategory } from '@/lib/audit/issues-helper';

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
    console.error('[API/audit/issues] auth error:', e.message);
    return null;
  }
}

/**
 * GET /api/audit/issues?auditId=X&siteId=Y[&issueKey=msg | &url=... | &category=...]
 *
 * Three query patterns:
 *   - issueKey: drill-down view of all occurrences of one issue type
 *   - url:      page-detail modal — all issues for a single URL
 *   - category: AccessibilityTab + AI translation cache — all issues of one type
 *
 * Backed by indexes on AuditIssue: ({auditId, message}), ({auditId, url}),
 * ({auditId, type}).
 *
 * Response: { issues: [...] }
 */
export async function GET(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const auditId = searchParams.get('auditId');
    const siteId = searchParams.get('siteId');
    const issueKey = searchParams.get('issueKey');
    const url = searchParams.get('url');
    const category = searchParams.get('category');

    if (!auditId) {
      return NextResponse.json({ error: 'auditId required' }, { status: 400 });
    }
    if (!issueKey && !url && !category) {
      return NextResponse.json({ error: 'issueKey, url, or category required' }, { status: 400 });
    }

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

    let issues;
    if (issueKey) issues = await getIssuesByMessage(auditId, issueKey);
    else if (url) issues = await getIssuesByUrl(auditId, url);
    else issues = await getIssuesByCategory(auditId, category);

    return NextResponse.json({ issues });
  } catch (error) {
    console.error('[API/audit/issues] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
