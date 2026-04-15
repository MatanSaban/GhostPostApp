import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { enableSecurityHeaders } from '@/lib/wp-api-client';
import { recalculateAuditAfterFix } from '@/lib/audit/recalculate-after-fix';

const SESSION_COOKIE = 'user_session';

// Map of audit issue keys → the HTTP header they relate to
const HEADER_ISSUE_MAP = {
  'audit.issues.noHsts': 'strict-transport-security',
  'audit.issues.noXFrameOptions': 'x-frame-options',
  'audit.issues.noContentTypeOptions': 'x-content-type-options',
  'audit.issues.noCsp': 'content-security-policy',
  'audit.issues.noReferrerPolicy': 'referrer-policy',
  'audit.issues.noPermissionsPolicy': 'permissions-policy',
};

// The "passed" counterparts
const PASSED_ISSUE_MAP = {
  'audit.issues.noHsts': 'audit.issues.hstsEnabled',
  'audit.issues.noXFrameOptions': 'audit.issues.xFrameOptionsSet',
  'audit.issues.noContentTypeOptions': 'audit.issues.contentTypeOptionsSet',
  'audit.issues.noCsp': 'audit.issues.cspSet',
  'audit.issues.noReferrerPolicy': 'audit.issues.referrerPolicySet',
  'audit.issues.noPermissionsPolicy': 'audit.issues.permissionsPolicySet',
};

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
 * POST: Enable security headers via the WP plugin
 *
 * Body: { siteId, auditId?, headerKeys?: string[] }
 *
 * Free operation (no credits). If headerKeys is provided, only those specific
 * headers are enabled. Otherwise all 6 are enabled at once.
 */
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { siteId, auditId, headerKeys } = await request.json();

    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
    }

    // Validate headerKeys if provided
    const validHeaderKeys = Object.values(HEADER_ISSUE_MAP);
    if (headerKeys && (!Array.isArray(headerKeys) || headerKeys.some((k) => !validHeaderKeys.includes(k)))) {
      return NextResponse.json({ error: 'Invalid headerKeys' }, { status: 400 });
    }

    // Verify site access
    const accountIds = user.accountMemberships.map((m) => m.accountId);
    const site = await prisma.site.findFirst({
      where: user.isSuperAdmin ? { id: siteId } : { id: siteId, accountId: { in: accountIds } },
      select: {
        id: true,
        url: true,
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
        { error: 'WordPress plugin is not connected', code: 'PLUGIN_NOT_CONNECTED' },
        { status: 422 }
      );
    }

    // Enable security headers via the plugin
    // If headerKeys provided, only enable those specific headers
    let result;
    try {
      if (headerKeys) {
        const headersObj = {};
        for (const k of headerKeys) headersObj[k] = true; // plugin fills defaults
        result = await enableSecurityHeaders(site, headersObj);
      } else {
        result = await enableSecurityHeaders(site);
      }
    } catch (err) {
      const is404 = err.message?.includes('rest_no_route') || err.message?.includes('(404)');
      if (is404) {
        return NextResponse.json(
          { error: 'Plugin update required', code: 'PLUGIN_UPDATE_REQUIRED' },
          { status: 422 }
        );
      }
      throw err;
    }

    // Determine which issue keys were targeted
    const targetedIssueKeys = headerKeys
      ? new Set(Object.entries(HEADER_ISSUE_MAP).filter(([, v]) => headerKeys.includes(v)).map(([k]) => k))
      : new Set(Object.keys(HEADER_ISSUE_MAP));

    // Update audit issues in-place
    let auditUpdated = false;
    if (auditId && result?.success) {
      const MAX_RETRIES = 5;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const audit = await prisma.siteAudit.findUnique({
            where: { id: auditId },
            select: { issues: true },
          });
          if (!audit) break;

          const updatedIssues = (audit.issues || []).map((issue) => {
            if (!targetedIssueKeys.has(issue.message)) return issue;
            return {
              ...issue,
              severity: 'passed',
              message: PASSED_ISSUE_MAP[issue.message] || issue.message,
              suggestion: null,
              details: 'Fixed via Ghost Post plugin',
            };
          });

          await prisma.siteAudit.update({
            where: { id: auditId },
            data: { issues: updatedIssues },
          });
          auditUpdated = true;
          break;
        } catch (retryErr) {
          if (retryErr.code === 'P2034' && attempt < MAX_RETRIES - 1) {
            await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
            continue;
          }
          throw retryErr;
        }
      }

      // Recalculate score
      recalculateAuditAfterFix(auditId, site.url).catch((err) =>
        console.warn('[FixSecurityHeaders] Recalc failed (non-fatal):', err.message)
      );
    }

    return NextResponse.json({
      success: true,
      headers: result?.headers || {},
      auditUpdated,
    });
  } catch (error) {
    console.error('[API/audit/fix-security-headers] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
