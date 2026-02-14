import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { setFavicon } from '@/lib/wp-api-client';

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
        accountMemberships: {
          select: { accountId: true },
        },
      },
    });
  } catch {
    return null;
  }
}

/**
 * POST: Set website favicon via the WP plugin
 *
 * Body: { siteId, auditId?, attachmentId }
 *
 * Cost: FREE — no credits charged
 * Pushes the selected media attachment as the site icon via the WP plugin.
 * If auditId is provided, updates the audit issues in-place (noFavicon → faviconGood).
 */
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { siteId, auditId, attachmentId } = await request.json();

    if (!siteId || !attachmentId) {
      return NextResponse.json(
        { error: 'siteId and attachmentId are required' },
        { status: 400 }
      );
    }

    // Verify site access
    const accountIds = user.accountMemberships.map(m => m.accountId);
    const site = await prisma.site.findFirst({
      where: { id: siteId, accountId: { in: accountIds } },
      select: {
        id: true,
        url: true,
        accountId: true,
        connectionStatus: true,
        siteKey: true,
        siteSecret: true,
      },
    });
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    if (site.connectionStatus !== 'CONNECTED' || !site.siteKey) {
      return NextResponse.json(
        { error: 'Plugin is not connected', code: 'PLUGIN_REQUIRED' },
        { status: 422 }
      );
    }

    // Set the favicon via the WP plugin
    const result = await setFavicon(site, attachmentId);

    if (!result?.success) {
      return NextResponse.json(
        { error: result?.error || 'Failed to set favicon' },
        { status: 500 }
      );
    }

    // Update audit issues in-place if auditId provided
    let auditUpdated = false;
    if (auditId) {
      try {
        const audit = await prisma.siteAudit.findUnique({
          where: { id: auditId },
          select: { issues: true },
        });

        if (audit) {
          const updatedIssues = (audit.issues || []).map(issue => {
            if (issue.message === 'audit.issues.noFavicon') {
              return {
                ...issue,
                severity: 'passed',
                message: 'audit.issues.faviconGood',
                suggestion: null,
                details: `Favicon set (attachment #${attachmentId})`,
              };
            }
            return issue;
          });

          await prisma.siteAudit.update({
            where: { id: auditId },
            data: { issues: updatedIssues },
          });
          auditUpdated = true;
        }
      } catch (err) {
        console.warn('[SetFavicon] Audit update failed:', err.message);
      }
    }

    return NextResponse.json({
      success: true,
      faviconUrl: result.faviconUrl,
      auditUpdated,
    });
  } catch (error) {
    console.error('[API/audit/set-favicon] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
