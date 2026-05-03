import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { getPageSpeedInsights } from '@/lib/audit/pagespeed-client';
import { analyzeHtml } from '@/lib/audit/html-analyzer';
import { deductAiCredits } from '@/lib/account-utils';
import { invalidateAudit } from '@/lib/cache/invalidate.js';
import { BOT_FETCH_HEADERS } from '@/lib/bot-identity';
import { GEMINI_MODEL } from '@/lib/ai/models.js';
import {
  getAllPageResults,
  appendPageResult,
  applyBulkUpdates,
} from '@/lib/audit/page-results-helper';
import {
  getAllIssues,
  replaceIssuesForUrls,
} from '@/lib/audit/issues-helper';

export const maxDuration = 300;

const SESSION_COOKIE = 'user_session';
// 1 GCoin per page refresh, regardless of how many issues are being verified
// on that page. Per-issue billing: clicking "Recheck" on 5 issues that happen
// to live on the same URL costs 5 GCoins (5 separate calls, 5 fetches).
const RECHECK_COST_PER_URL = 1;

// Sources we can re-detect with the lightweight fetch + analyzeHtml + PSI
// pipeline. Issues from `axe` (accessibility), `playwright` (DOM in a real
// browser), or `ai-vision` (Gemini Vision) need the heavy pipeline — we
// preserve them as-is rather than falsely concluding they were resolved.
const RECHECKABLE_SOURCES = new Set(['html', 'psi', 'pagespeed', 'fetch', 'system', null]);

function isRecheckable(issue) {
  return RECHECKABLE_SOURCES.has(issue.source ?? null);
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
        accountMemberships: { select: { accountId: true } },
      },
    });
  } catch (error) {
    console.error('[Recheck] Auth error:', error);
    return null;
  }
}

async function verifySiteAccess(user, siteId) {
  const accountIds = user.accountMemberships.map((m) => m.accountId);
  return prisma.site.findFirst({
    where: user.isSuperAdmin ? { id: siteId } : { id: siteId, accountId: { in: accountIds } },
    select: { id: true, url: true, accountId: true },
  });
}

// Single source of truth for the page-result shape we persist. Mirrors the
// shape the rescan endpoint writes so both code paths remain comparable.
function normalizePageResult(pr) {
  return {
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
  };
}

function normalizeIssue(i) {
  return {
    type: i.type || 'technical',
    severity: i.severity || 'warning',
    message: i.message || '',
    url: i.url || null,
    suggestion: i.suggestion || null,
    source: i.source || null,
    details: i.details || null,
    detailedSources: i.detailedSources || undefined,
  };
}

// Re-fetch + re-analyze one URL. Mirrors the scan path the per-page rescan
// endpoint already uses (fetch + analyzeHtml + PSI). No Playwright/Vision —
// matches existing behavior and keeps the cost basis predictable.
async function rescanUrl(url) {
  const issues = [];
  const pageResult = { url, jsErrors: [], brokenResources: [] };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const start = Date.now();

    const response = await fetch(url, {
      signal: controller.signal,
      headers: BOT_FETCH_HEADERS,
      redirect: 'follow',
    });
    clearTimeout(timeoutId);

    const ttfb = Date.now() - start;
    pageResult.ttfb = ttfb;
    pageResult.statusCode = response.status;
    const headers = Object.fromEntries(response.headers.entries());

    const html = await response.text();
    issues.push(...analyzeHtml(html, url, headers, ttfb));

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
    // PSI failed — graceful skip, won't surface as an issue.
  }

  pageResult.issueCount = issues.length;
  return { issues: issues.map(normalizeIssue), pageResult };
}

/**
 * POST /api/audit/recheck
 *
 * Re-verify one or more URLs from a completed audit. For each URL:
 *  - Re-fetch + re-analyze (HTML + PSI), same path as /api/audit/rescan.
 *  - Diff old vs. new issues for that URL.
 *  - Persist updated issues + pageResults.
 *  - Skip score/categoryScores/summary recalc — caller is expected to nudge
 *    the user toward a fresh full audit to pick those up.
 *
 * Body: { auditId, siteId, urls: string[] }
 * Cost: urls.length GCoins, deducted up-front. Returns 402 if insufficient.
 *
 * Returns:
 *   {
 *     success: true,
 *     urlResults: [{
 *       url,
 *       resolved: [issueMessageKey, ...],   // present before, gone now
 *       stillPresent: [issueMessageKey, ...],
 *       newIssues: [issueMessageKey, ...],  // appeared on this recheck
 *     }],
 *     issues, pageResults, // updated full arrays for client to swap in
 *     balance, // remaining GCoins
 *   }
 */
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { auditId, siteId, urls } = await request.json();

    if (!auditId || !siteId || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json(
        { error: 'auditId, siteId, and a non-empty urls array are required' },
        { status: 400 }
      );
    }

    // Cap batch size — defense in depth against accidental huge requests
    // burning GCoins. UI confirmation modal is the primary guard.
    if (urls.length > 200) {
      return NextResponse.json(
        { error: 'Too many URLs in one recheck (max 200)' },
        { status: 400 }
      );
    }

    const site = await verifySiteAccess(user, siteId);
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Deduct up-front. If the user lacks enough GCoins for the whole batch we
    // refuse the entire batch (per the agreed UX — no partial rechecks).
    const cost = urls.length * RECHECK_COST_PER_URL;
    const deduction = await deductAiCredits(site.accountId, cost, {
      userId: user.id,
      siteId,
      source: 'audit_recheck',
      description: `Recheck ${urls.length} page(s)`,
      metadata: { model: GEMINI_MODEL, urls: urls.slice(0, 20) },
    });

    if (!deduction.success) {
      return NextResponse.json(
        {
          error: deduction.error || 'Ai-GCoin deduction failed',
          code: 'INSUFFICIENT_CREDITS',
          resourceKey: 'aiCredits',
          need: cost,
        },
        { status: 402 }
      );
    }

    // Audit metadata only — issues + pageResults via helpers below.
    const audit = await prisma.siteAudit.findFirst({
      where: { id: auditId, siteId },
      select: { id: true, status: true },
    });

    if (!audit || audit.status !== 'COMPLETED') {
      return NextResponse.json(
        { error: 'Audit not found or not completed' },
        { status: 404 }
      );
    }
    const baselinePageResults = await getAllPageResults(auditId);
    const baselineIssuesAll = await getAllIssues(auditId);

    // Re-scan each URL. Sequential is fine for typical batch sizes (1-20);
    // PSI rate limits make heavy parallelism risky.
    const urlResults = [];
    const newIssuesPerUrl = new Map();   // url -> normalized issue[]
    const newPageResultByUrl = new Map(); // url -> normalized pageResult

    const baselineIssues = baselineIssuesAll;

    for (const url of urls) {
      const { issues, pageResult } = await rescanUrl(url);
      newIssuesPerUrl.set(url, issues);
      newPageResultByUrl.set(url, pageResult);

      // Diff is restricted to recheckable sources. An a11y issue from `axe`
      // not appearing in the lightweight rescan does NOT mean it's resolved —
      // it just means we didn't run the analyzer that produces it.
      const oldKeys = new Set(
        baselineIssues
          .filter((i) => i.url === url && i.severity !== 'passed' && isRecheckable(i))
          .map((i) => i.message)
      );
      const newKeys = new Set(issues.filter(isRecheckable).map((i) => i.message));

      const resolved = [...oldKeys].filter((k) => !newKeys.has(k));
      const stillPresent = [...oldKeys].filter((k) => newKeys.has(k));
      const newOnes = [...newKeys].filter((k) => !oldKeys.has(k));

      urlResults.push({
        url,
        resolved,
        stillPresent,
        newIssues: newOnes,
      });
    }

    // Phase 2: issues via helper. For each rechecked URL we want to:
    //   - delete only the recheckable-source issues (heavy-source ones from
    //     axe / playwright / ai-vision must be preserved — we can't speak to
    //     them with the lightweight pipeline)
    //   - insert the freshly-detected recheckable issues for that URL
    // The helper's replaceIssuesForUrls handles both stores under the flag.
    const replacementIssues = [];
    for (const url of urls) {
      replacementIssues.push(...newIssuesPerUrl.get(url).filter(isRecheckable));
    }
    // Pull accountId for any new docs the helper needs to insert.
    const siteRowR = await prisma.site.findUnique({
      where: { id: siteId },
      select: { accountId: true },
    });
    await replaceIssuesForUrls(
      { auditId, siteId, accountId: siteRowR?.accountId },
      urls,
      isRecheckable, // delete predicate: only recheckable-source issues
      replacementIssues,
    );

    // Build a finalIssues array for the response payload (back-compat with
    // client that swaps state in-place). Read fresh through the helper so
    // any concurrent fix flows are picked up.
    const finalIssues = await getAllIssues(auditId);

    // ── PageResults via helper ────────────────────────────────────────
    // For each rechecked URL: merge new metrics into existing pageResult and
    // upsert. Existing rows: bulk-update. Brand-new URLs (rare — shouldn't
    // exist after a completed audit, but guard): append.
    const existingByUrl = new Map(baselinePageResults.map((pr) => [pr.url, pr]));
    const bulkUpdates = new Map();
    const appendList = [];
    for (const url of urls) {
      const next = newPageResultByUrl.get(url);
      const existing = existingByUrl.get(url);
      if (existing) {
        bulkUpdates.set(url, normalizePageResult({ ...existing, ...next }));
      } else {
        appendList.push(normalizePageResult(next));
      }
    }
    if (bulkUpdates.size > 0) {
      await applyBulkUpdates({ auditId }, bulkUpdates);
    }
    if (appendList.length > 0) {
      const siteRow = await prisma.site.findUnique({
        where: { id: siteId },
        select: { accountId: true },
      });
      for (const pr of appendList) {
        await appendPageResult(
          { auditId, siteId, accountId: siteRow?.accountId },
          pr,
        );
      }
    }
    // Build the response payload — clients expect the full updated set so
    // they can swap state in-place. Read fresh through the helper to pick up
    // any concurrent writers.
    const finalPageResults = await getAllPageResults(auditId);

    invalidateAudit(siteId);

    // Per the design contract: NO score / categoryScores / summary recalc.
    // The client surfaces a "rechecks happened — run a new audit to refresh
    // your score" banner instead.

    return NextResponse.json({
      success: true,
      urlResults,
      issues: finalIssues,
      pageResults: finalPageResults,
      balance: deduction.balance,
      cost,
      // useAICredits() reads this and refreshes the global GCoin badge.
      creditsUpdated: { used: deduction.usedTotal },
    });
  } catch (error) {
    console.error('[API/audit/recheck] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
