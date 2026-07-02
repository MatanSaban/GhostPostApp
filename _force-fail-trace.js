/**
 * One-shot cleanup for stuck trace.direct audits.
 * Marks any RUNNING/PENDING audit for the site as FAILED so the user can
 * start a fresh one. Safe to re-run — only touches non-terminal audits.
 */
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const OUT = 'c:/tmp/force-fail-trace.txt';
const lines = [];
const log = (...args) => lines.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
const flush = () => fs.writeFileSync(OUT, lines.join('\n') + '\n');

(async () => {
  log('start', new Date().toISOString());
  flush();
  try {
    const site = await prisma.site.findFirst({
      where: { url: { contains: 'trace.direct' } },
      select: { id: true, url: true },
    });
    if (!site) { log('no site found'); flush(); return; }
    log('site:', site.id, site.url);

    const stuck = await prisma.siteAudit.findMany({
      where: { siteId: site.id, status: { in: ['PENDING', 'RUNNING'] } },
      select: { id: true, status: true, phase: true, deviceType: true, progress: true },
    });
    log('stuck count:', stuck.length);

    for (const a of stuck) {
      const p = a.progress || {};
      await prisma.siteAudit.update({
        where: { id: a.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          score: 0,
          chunkLeaseUntil: null,
          progress: { ...p, failureReason: 'CLEANUP_STUCK_AFTER_DISCOVERY' },
          issues: [{
            type: 'technical',
            severity: 'error',
            message: 'audit.issues.auditTimedOut',
            suggestion: 'audit.suggestions.retryAudit',
            source: 'system',
            details: JSON.stringify({
              stuckAt: p.labelKey || 'unknown',
              currentStep: p.currentStep ?? null,
              totalSteps: p.totalSteps ?? null,
              deviceType: a.deviceType || null,
              phase: a.phase || null,
              cleanup: 'manual',
            }),
          }],
        },
      });
      log('  failed:', a.id, '(', a.deviceType, a.phase, ')');
    }

    // Clear the start lock so a new audit can be kicked off immediately.
    await prisma.site.update({
      where: { id: site.id },
      data: { auditStartLockUntil: null },
    });
    log('cleared auditStartLockUntil');
  } catch (e) {
    log('ERR:', e.message);
  }
  await prisma.$disconnect();
  log('done');
  flush();
})();
