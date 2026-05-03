import { NextResponse } from 'next/server';
import { getAuthenticatedUser, loadAccessibleSite, accountHasPaidPlan } from '@/lib/backlinks/access';
import { syncBacklinksForSite, getLatestSync } from '@/lib/backlinks/sync';

// DataForSEO calls cost real money, so a manual sync is rate-limited to once
// per day per site for everyone except superadmins (who often need to retry
// while debugging). Cron-driven syncs are not affected.
const MANUAL_SYNC_COOLDOWN_HOURS = 24;

export const maxDuration = 60;

export async function POST(request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let siteId;
  try {
    const body = await request.json();
    siteId = body?.siteId;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  if (!siteId) {
    return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
  }

  const access = await loadAccessibleSite({ userId: user.id, isSuperAdmin: user.isSuperAdmin, siteId });
  if (!access) {
    return NextResponse.json({ error: 'Site not found or no access' }, { status: 404 });
  }
  if (!accountHasPaidPlan(access.account)) {
    return NextResponse.json({ error: 'Backlink Audit requires a paid plan', code: 'PLAN_REQUIRED' }, { status: 403 });
  }

  if (!user.isSuperAdmin) {
    const last = await getLatestSync(siteId);
    if (last && last.status === 'COMPLETED') {
      const ageMs = Date.now() - new Date(last.completedAt || last.createdAt).getTime();
      const cooldownMs = MANUAL_SYNC_COOLDOWN_HOURS * 60 * 60 * 1000;
      if (ageMs < cooldownMs) {
        const retryAfterSeconds = Math.ceil((cooldownMs - ageMs) / 1000);
        return NextResponse.json(
          { error: 'Sync cooldown active', code: 'COOLDOWN', retryAfterSeconds },
          { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
        );
      }
    }
  }

  try {
    const result = await syncBacklinksForSite({
      siteId,
      source: 'DATAFORSEO',
      triggeredBy: user.id,
    });
    return NextResponse.json({
      success: true,
      sync: {
        id: result.id,
        status: result.status,
        totalFound: result.totalFound,
        newCount: result.newCount,
        lostCount: result.lostCount,
        completedAt: result.completedAt,
      },
    });
  } catch (err) {
    // Log the underlying provider error for ops, but never echo provider
    // names or upstream error text back to the client — the user sees only
    // a generic failure message.
    console.error('[backlinks/sync] failed:', err);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
