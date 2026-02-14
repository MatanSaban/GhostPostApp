import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { getPageSpeedInsights } from '@/lib/audit/pagespeed-client';
import { analyzeHtml } from '@/lib/audit/html-analyzer';
import { deductAiCredits } from '@/lib/account-utils';

const SESSION_COOKIE = 'user_session';
const RESCAN_CREDIT_COST = 1;

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
          select: { accountId: true },
        },
      },
    });
    return user;
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

async function verifySiteAccess(user, siteId) {
  const accountIds = user.accountMemberships.map((m) => m.accountId);
  return prisma.site.findFirst({
    where: { id: siteId, accountId: { in: accountIds } },
    select: { id: true, url: true },
  });
}

/**
 * POST: Rescan a single URL within an existing audit
 *
 * Body: { auditId, siteId, url }
 *
 * Rescans the given URL (fetch + HTML analysis + PSI) and updates
 * the corresponding pageResult + issues in the existing audit record.
 */
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { auditId, siteId, url } = await request.json();

    if (!auditId || !siteId || !url) {
      return NextResponse.json(
        { error: 'auditId, siteId, and url are required' },
        { status: 400 }
      );
    }

    const site = await verifySiteAccess(user, siteId);
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Deduct 1 AI credit for rescan
    let creditDeduction = null;
    const accountIds = user.accountMemberships.map(m => m.accountId);
    const siteRecord = await prisma.site.findFirst({
      where: { id: siteId, accountId: { in: accountIds } },
      select: { accountId: true },
    });

    if (siteRecord) {
      const deduction = await deductAiCredits(siteRecord.accountId, RESCAN_CREDIT_COST, {
        userId: user.id,
        siteId,
        source: 'audit_rescan',
        description: `Rescan page: ${url}`,
      });

      if (!deduction.success) {
        console.warn('[Rescan] Credit deduction failed:', deduction.error);
        return NextResponse.json(
          { error: deduction.error || 'Credit deduction failed', code: 'INSUFFICIENT_CREDITS', resourceKey: 'aiCredits' },
          { status: 402 }
        );
      }
      creditDeduction = deduction;
    }

    // Fetch the existing audit
    const audit = await prisma.siteAudit.findFirst({
      where: { id: auditId, siteId },
    });

    if (!audit || audit.status !== 'COMPLETED') {
      return NextResponse.json(
        { error: 'Audit not found or not completed' },
        { status: 404 }
      );
    }

    // ── Run scan on the single URL ──────────────────────────

    const issues = [];
    const pageResult = {
      url,
      jsErrors: [],
      brokenResources: [],
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const start = Date.now();

      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'GhostPost-SiteAuditor/2.0' },
        redirect: 'follow',
      });
      clearTimeout(timeoutId);

      const ttfb = Date.now() - start;
      pageResult.ttfb = ttfb;
      pageResult.statusCode = response.status;
      const headers = Object.fromEntries(response.headers.entries());

      const html = await response.text();
      const htmlIssues = analyzeHtml(html, url, headers, ttfb);
      issues.push(...htmlIssues);

      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      pageResult.title = titleMatch ? titleMatch[1].trim() : null;
      const descMatch = html.match(
        /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*?)["']/i
      );
      pageResult.metaDescription = descMatch ? descMatch[1].trim() : null;
    } catch (err) {
      issues.push({
        type: 'technical',
        severity: 'error',
        message: 'audit.issues.siteUnreachable',
        url,
        suggestion: 'audit.suggestions.checkUrl',
        source: 'fetch',
      });
    }

    // PSI
    try {
      const psi = await getPageSpeedInsights(url);
      if (psi) {
        pageResult.performanceScore = psi.score;
        pageResult.lcp = psi.lcp;
        pageResult.cls = psi.cls;
        pageResult.inp = psi.inp;
        issues.push(...(psi.issues || []));
      }
    } catch {
      // PSI failed — graceful skip
    }

    pageResult.issueCount = issues.length;

    // ── Update the audit record ─────────────────────────────

    // Replace the old page result for this URL
    const existingPageResults = audit.pageResults || [];
    // Normalize every page result to ensure required fields exist (older records may lack them)
    const normalizePageResult = (pr) => ({
      url: pr.url,
      statusCode: pr.statusCode || null,
      title: pr.title || null,
      metaDescription: pr.metaDescription || null,
      ttfb: pr.ttfb || null,
      performanceScore: pr.performanceScore || null,
      lcp: pr.lcp || null,
      cls: pr.cls || null,
      inp: pr.inp || null,
      jsErrors: pr.jsErrors || [],
      brokenResources: pr.brokenResources || [],
      issueCount: pr.issueCount || 0,
      screenshotDesktop: pr.screenshotDesktop || null,
      screenshotMobile: pr.screenshotMobile || null,
      screenshotsDesktop: pr.screenshotsDesktop || [],
      screenshotsMobile: pr.screenshotsMobile || [],
      filmstripDesktop: pr.filmstripDesktop || null,
      filmstripMobile: pr.filmstripMobile || null,
    });
    const updatedPageResults = existingPageResults.map((pr) =>
      pr.url === url
        ? normalizePageResult({ ...pr, ...pageResult })
        : normalizePageResult(pr)
    );

    // Replace old issues for this URL, keep others
    const existingIssues = audit.issues || [];
    const otherIssues = existingIssues.filter((i) => i.url !== url);
    const updatedIssues = [
      ...otherIssues,
      ...issues.map((i) => ({
        type: i.type || 'technical',
        severity: i.severity || 'warning',
        message: i.message || '',
        url: i.url || null,
        suggestion: i.suggestion || null,
        source: i.source || null,
        details: i.details || null,
      })),
    ];

    await prisma.siteAudit.update({
      where: { id: auditId },
      data: {
        issues: updatedIssues,
        pageResults: updatedPageResults,
      },
    });

    return NextResponse.json({
      success: true,
      pageResult,
      issueCount: issues.length,
      creditsUpdated: creditDeduction ? { used: creditDeduction.usedTotal } : null,
    });
  } catch (error) {
    console.error('[API/audit/rescan] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
