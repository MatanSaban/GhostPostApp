import { NextResponse } from 'next/server';
import { purgeExpiredArchivedAccounts } from '@/lib/account-archive';

function verifyAuth(request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  return authHeader === `Bearer ${cronSecret}`;
}

/**
 * POST /api/cron/purge-archived-accounts
 * Permanently deletes accounts whose 14-day restore window has expired.
 * Runs the original destructive cascade (sites, content, members, roles,
 * subscription, account, and the owner user if they own nothing else).
 *
 * Schedule this nightly via Vercel Cron or an external scheduler.
 */
export async function POST(request) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const purgedIds = await purgeExpiredArchivedAccounts();
    console.log(`[Cron Purge] Purged ${purgedIds.length} expired accounts`);
    return NextResponse.json({ success: true, purgedCount: purgedIds.length, purgedIds });
  } catch (error) {
    console.error('[Cron Purge] Error:', error);
    return NextResponse.json({ error: 'Purge failed' }, { status: 500 });
  }
}

// Allow GET too so Vercel Cron can hit it without a body.
export const GET = POST;
