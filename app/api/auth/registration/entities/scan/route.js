import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { getDraftAccountForUser } from '@/lib/draft-account';
import { discoverEntityTypesAndEntities } from '@/lib/entity-discovery';

const SESSION_COOKIE = 'user_session';

// Force dynamic - the scan can take many seconds and must not be cached.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Registration-time entity scanning.
 *
 * The site doesn't exist yet during onboarding (it's only created at
 * /finalize), so we can't write to SiteEntityType/SiteEntity. Instead the
 * scan results are stashed inside `Account.draftInterviewData.entityScan`
 * and migrated onto the real Site at finalize.
 *
 * Status lifecycle: SCANNING -> COMPLETED | FAILED | EMPTY
 *
 * - SCANNING: scan in progress (POST started, response not yet returned)
 * - COMPLETED: at least one entity type discovered
 * - EMPTY: scan ran cleanly but the site has no discoverable entities
 * - FAILED: scan threw or no sitemap was reachable
 *
 * The registration chat fires POST without awaiting, then issues GET when
 * the user reaches the entities-selection panel to check if the result is
 * ready. If neither COMPLETED nor EMPTY/FAILED within 10s of reaching that
 * panel, the chat skips the step silently.
 */

async function getDraftAccountFromSession() {
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!userId) return { error: 'Unauthorized', status: 401 };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) return { error: 'No registration in progress', status: 400 };

  const draftAccount = await getDraftAccountForUser(user.id);
  if (!draftAccount) return { error: 'No draft account found', status: 404 };

  return { user, draftAccount };
}

async function patchEntityScanState(accountId, currentInterviewData, patch) {
  const interviewData = currentInterviewData || {};
  const existingScan = interviewData.entityScan || {};
  const merged = {
    ...interviewData,
    entityScan: { ...existingScan, ...patch },
  };
  await prisma.account.update({
    where: { id: accountId },
    data: { draftInterviewData: merged },
  });
  return merged;
}

/**
 * POST /api/auth/registration/entities/scan
 *
 * Body: { url, language } - both optional. Pulled from draftInterviewData
 * if missing. Runs discovery synchronously and writes the result to
 * draftInterviewData.entityScan.
 */
export async function POST(request) {
  const session = await getDraftAccountFromSession();
  if (session.error) return NextResponse.json({ error: session.error }, { status: session.status });

  const { user, draftAccount } = session;

  let body = {};
  try { body = await request.json(); } catch { /* allow empty body */ }

  const interviewData = draftAccount.draftInterviewData || {};
  const url = (body.url || interviewData.websiteUrl || '').trim();
  const language = body.language || interviewData.selectedLanguage || null;

  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  let normalizedUrl = url;
  if (!/^https?:\/\//i.test(normalizedUrl)) normalizedUrl = `https://${normalizedUrl}`;
  normalizedUrl = normalizedUrl.replace(/\/+$/, '');

  // Idempotency: if a scan for the same URL has already finished (or is in
  // flight), reuse it. Re-running discovery against the same site wastes the
  // few seconds it takes and would also re-charge AI credits.
  const existingScan = interviewData.entityScan;
  if (existingScan && existingScan.url === normalizedUrl) {
    if (existingScan.status === 'SCANNING') {
      return NextResponse.json({
        success: true,
        status: 'SCANNING',
        alreadyInFlight: true,
      });
    }
    if (existingScan.status === 'COMPLETED' || existingScan.status === 'EMPTY') {
      return NextResponse.json({
        success: true,
        status: existingScan.status,
        entityScan: existingScan,
        cached: true,
      });
    }
    // FAILED / IDLE / null fall through to a fresh scan attempt.
  }

  await patchEntityScanState(draftAccount.id, interviewData, {
    status: 'SCANNING',
    url: normalizedUrl,
    language,
    startedAt: new Date().toISOString(),
    error: null,
    entityTypes: null,
    sitemapEntities: null,
    source: null,
    selectedSlugs: null,
  });

  try {
    const result = await discoverEntityTypesAndEntities(normalizedUrl, {
      // Tied to the draft account so AI-credits accounting still works during
      // onboarding. siteId omitted - no Site exists yet.
      accountId: draftAccount.id,
      useAI: true,
    });

    // EMPTY vs COMPLETED:
    //
    // buildEntityTypesList always seeds defaults (Posts, Pages) regardless
    // of what discovery returned, so checking entityTypes.length is useless
    // for distinguishing real results from empty defaults. Instead we look
    // at the discovery sources: did REST API return anything? Did we find
    // a sitemap with at least one entity in it?
    //
    // If neither, the URL is unreachable / dead / non-CMS - surface EMPTY
    // so the chat skips the panel silently per spec ("find nothing - don't
    // show anything about it to the user").
    const hasEntities = Object.values(result.sitemapEntities || {})
      .reduce((sum, arr) => sum + (arr?.length || 0), 0) > 0;
    const hasRealSignals =
      result.source.restApi ||
      (result.source.sitemap && hasEntities);

    const status = hasRealSignals ? 'COMPLETED' : 'EMPTY';

    // Re-read interview data in case it was updated during the scan (e.g.
    // user finished other interview answers). Avoid clobbering them.
    const refreshed = await prisma.account.findUnique({
      where: { id: draftAccount.id },
      select: { draftInterviewData: true },
    });

    const updated = await patchEntityScanState(
      draftAccount.id,
      refreshed?.draftInterviewData || {},
      {
        status,
        completedAt: new Date().toISOString(),
        entityTypes: result.entityTypes,
        sitemapEntities: result.sitemapEntities,
        source: result.source,
        // Default selection: core types + any type that found entities.
        // The user can adjust this in the panel before confirming.
        selectedSlugs: (result.entityTypes || [])
          .filter(t => t.isCore || (t.entityCount || 0) > 0)
          .map(t => t.slug),
      }
    );

    return NextResponse.json({
      success: true,
      status,
      entityScan: updated.entityScan,
    });
  } catch (error) {
    console.error('[registration/entities/scan] Scan failed:', error);

    const refreshed = await prisma.account.findUnique({
      where: { id: draftAccount.id },
      select: { draftInterviewData: true },
    });

    await patchEntityScanState(
      draftAccount.id,
      refreshed?.draftInterviewData || {},
      {
        status: 'FAILED',
        completedAt: new Date().toISOString(),
        error: error.message || 'Scan failed',
      }
    );

    return NextResponse.json({
      success: false,
      status: 'FAILED',
      error: error.message || 'Scan failed',
    }, { status: 200 });
    // 200 - the chat treats scan failure as a "skip silently" signal. A 5xx
    // would trigger error UI we don't want.
  }
}

/**
 * GET /api/auth/registration/entities/scan
 *
 * Returns the current scan state from draftInterviewData.entityScan.
 * Used by the chat to poll while waiting for an in-flight scan.
 */
export async function GET() {
  const session = await getDraftAccountFromSession();
  if (session.error) return NextResponse.json({ error: session.error }, { status: session.status });

  const { draftAccount } = session;
  const interviewData = draftAccount.draftInterviewData || {};
  const entityScan = interviewData.entityScan || null;

  return NextResponse.json({
    success: true,
    entityScan,
  });
}
