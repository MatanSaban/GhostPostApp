import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const site = await p.site.findFirst({
  where: { url: { contains: 'benatovlaw' } },
  select: { id: true, url: true },
});
if (!site) { console.log('Site not found'); process.exit(0); }
console.log('Site:', site.id, site.url);
console.log('---');
const audits = await p.siteAudit.findMany({
  where: { siteId: site.id },
  select: {
    id: true, status: true, phase: true, deviceType: true,
    pagesScanned: true, pagesFound: true, chunkLeaseUntil: true,
    progress: true, startedAt: true, updatedAt: true, createdAt: true,
    chunkErrors: true,
  },
  orderBy: { createdAt: 'desc' },
  take: 4,
});
for (const a of audits) {
  const pending = await p.siteAudit.findUnique({
    where: { id: a.id },
    select: { pendingUrls: true },
  });
  const now = new Date();
  const ageMin = Math.round((now - new Date(a.createdAt)) / 60000);
  const lastTouchMin = Math.round((now - new Date(a.updatedAt)) / 60000);
  const leaseHeld = a.chunkLeaseUntil ? (new Date(a.chunkLeaseUntil) > now) : false;
  console.log('Audit:', a.id);
  console.log('  status:', a.status, 'phase:', a.phase || '(legacy)', 'device:', a.deviceType);
  console.log('  age:', ageMin, 'min | last touch:', lastTouchMin, 'min ago');
  console.log('  pages: scanned=' + a.pagesScanned + ' / found=' + a.pagesFound + ' / pendingUrls=' + (pending.pendingUrls?.length || 0));
  console.log('  lease:', a.chunkLeaseUntil || '(none)', leaseHeld ? '[ACTIVE]' : '[expired/none]');
  console.log('  progress.label:', a.progress?.labelKey, '| pct:', a.progress?.percentage, '| stuckPage:', a.progress?.labelParams?.page);
  console.log('  chunkErrors:', (a.chunkErrors || []).length);
  if ((a.chunkErrors || []).length > 0) {
    const counts = {};
    for (const e of a.chunkErrors) counts[e.kind] = (counts[e.kind] || 0) + 1;
    console.log('    by kind:', counts);
    const recent = a.chunkErrors.slice(-3);
    console.log('    last 3:', JSON.stringify(recent, null, 2));
  }
  console.log('---');
}
await p.$disconnect();
