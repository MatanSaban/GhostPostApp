import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser, loadAccessibleSite, accountHasPaidPlan } from '@/lib/backlinks/access';
import { renderDisavowTxt } from '@/lib/backlinks/disavow';

export async function GET(request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get('siteId');
  if (!siteId) {
    return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
  }

  const access = await loadAccessibleSite({
    userId: user.id,
    isSuperAdmin: user.isSuperAdmin,
    siteId,
  });
  if (!access) return NextResponse.json({ error: 'Site not found or no access' }, { status: 404 });
  if (!accountHasPaidPlan(access.account)) {
    return NextResponse.json({ error: 'Backlink Audit requires a paid plan', code: 'PLAN_REQUIRED' }, { status: 403 });
  }

  // Export everything not already acknowledged. Empty exports are still
  // allowed — useful when the user wants to clear a stale upload.
  const entries = await prisma.disavowEntry.findMany({
    where: { siteId, status: { not: 'ACKNOWLEDGED' } },
    orderBy: [{ scope: 'asc' }, { value: 'asc' }],
    select: { id: true, scope: true, value: true, reason: true, status: true },
  });

  if (entries.length === 0) {
    return NextResponse.json({ error: 'No disavow entries to export', code: 'EMPTY' }, { status: 400 });
  }

  const txt = renderDisavowTxt({ siteUrl: access.site.url, entries });

  // Mark all PENDING entries as EXPORTED. (Already-EXPORTED ones are kept as
  // EXPORTED — re-downloading shouldn't churn timestamps.)
  const pendingIds = entries.filter(e => e.status === 'PENDING').map(e => e.id);
  if (pendingIds.length > 0) {
    await prisma.disavowEntry.updateMany({
      where: { id: { in: pendingIds } },
      data: { status: 'EXPORTED', exportedAt: new Date() },
    });
  }

  // Use a hostname-derived filename so a user with multiple sites can tell
  // the downloads apart at a glance.
  let host = 'site';
  try { host = new URL(access.site.url).hostname.replace(/^www\./i, ''); } catch {}
  const filename = `disavow-${host}.txt`;

  return new NextResponse(txt, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
