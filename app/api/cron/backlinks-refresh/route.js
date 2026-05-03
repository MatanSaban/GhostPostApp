import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { syncBacklinksForSite } from '@/lib/backlinks/sync';
import { accountHasPaidPlan } from '@/lib/backlinks/access';

// Weekly cron (vercel.json: "0 4 * * 1"). Each DataForSEO call is paid, so we
// scope strictly to active sites on a paid plan and process them serially.
// Failure on one site never blocks the others.
export const maxDuration = 300;

function verifyAuth(request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // dev mode
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[cron/backlinks-refresh] starting weekly refresh');

  const sites = await prisma.site.findMany({
    where: { isActive: true },
    select: {
      id: true,
      url: true,
      account: {
        select: {
          isActive: true,
          archivedAt: true,
          subscription: { select: { plan: { select: { slug: true, price: true, isFreeFallback: true } } } },
        },
      },
    },
  });

  const eligible = sites.filter(s =>
    s.account?.isActive &&
    !s.account?.archivedAt &&
    accountHasPaidPlan(s.account)
  );

  console.log(`[cron/backlinks-refresh] eligible sites: ${eligible.length}/${sites.length}`);

  const results = [];
  for (const site of eligible) {
    try {
      const sync = await syncBacklinksForSite({
        siteId: site.id,
        source: 'DATAFORSEO',
        triggeredBy: null,
      });
      results.push({
        siteId: site.id,
        url: site.url,
        status: 'ok',
        totalFound: sync.totalFound,
        newCount: sync.newCount,
        lostCount: sync.lostCount,
      });
    } catch (err) {
      console.error(`[cron/backlinks-refresh] ${site.url} failed:`, err);
      results.push({
        siteId: site.id,
        url: site.url,
        status: 'error',
        error: String(err?.message || err).slice(0, 200),
      });
    }
  }

  return NextResponse.json({
    processed: results.length,
    succeeded: results.filter(r => r.status === 'ok').length,
    failed: results.filter(r => r.status === 'error').length,
    results,
  });
}
