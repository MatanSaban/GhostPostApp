const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const OUT = 'c:/tmp/audit-check-trace.txt';
const lines = [];
const log = (...args) => lines.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
const flush = () => fs.writeFileSync(OUT, lines.join('\n') + '\n');

(async () => {
  log('connecting at', new Date().toISOString());
  flush();
  try {
    const site = await prisma.site.findFirst({
      where: { url: { contains: 'trace.direct' } },
      select: { id: true, url: true, accountId: true },
    });
    if (!site) { log('no site'); flush(); return; }
    log('Site:', site.id, site.url, 'account:', site.accountId);
    log('---');

    const audits = await prisma.siteAudit.findMany({
      where: { siteId: site.id },
      select: {
        id: true, status: true, phase: true, deviceType: true,
        pagesScanned: true, pagesFound: true, chunkLeaseUntil: true,
        progress: true, startedAt: true, updatedAt: true, createdAt: true,
        chunkErrors: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 8,
    });
    const now = new Date();
    log('Total audits found:', audits.length);
    log('Active audits (PENDING/RUNNING):', audits.filter(a => a.status === 'PENDING' || a.status === 'RUNNING').length);
    log('---');
    for (const a of audits) {
      const pending = await prisma.siteAudit.findUnique({
        where: { id: a.id },
        select: { pendingUrls: true },
      });
      const ageMin = Math.round((now - new Date(a.createdAt)) / 60000);
      const lastTouchMin = Math.round((now - new Date(a.updatedAt)) / 60000);
      const leaseHeld = a.chunkLeaseUntil ? (new Date(a.chunkLeaseUntil) > now) : false;
      log('Audit:', a.id);
      log('  status:', a.status, 'phase:', a.phase || '(legacy)', 'device:', a.deviceType);
      log('  age:', ageMin, 'min | last touch:', lastTouchMin, 'min ago | created:', a.createdAt);
      log('  pages scanned/found/pending:', a.pagesScanned, '/', a.pagesFound, '/', pending.pendingUrls?.length || 0);
      log('  lease:', a.chunkLeaseUntil, leaseHeld ? '[ACTIVE]' : '[expired/none]');
      log('  progress.label:', a.progress?.labelKey, 'pct:', a.progress?.percentage, 'page:', a.progress?.labelParams?.page);
      log('  chunkErrors:', (a.chunkErrors || []).length);
      if (a.chunkErrors && a.chunkErrors.length > 0) {
        const counts = {};
        for (const e of a.chunkErrors) counts[e.kind] = (counts[e.kind] || 0) + 1;
        log('    by kind:', JSON.stringify(counts));
        log('    last 3:', JSON.stringify(a.chunkErrors.slice(-3)));
      }
      log('');
      flush();
    }
  } catch (e) {
    log('ERR:', e.message);
  }
  await prisma.$disconnect();
  log('done');
  flush();
})();
