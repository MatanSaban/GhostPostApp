// Re-runs _create-indexes.js every minute until all three indexes exist.
// Exits cleanly when done. Idempotent (createIndexes no-ops on existing).

const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

const PROGRESS = 'c:/tmp/index-loop.txt';
const lines = [];
const log = (...a) => {
  const line = `[${new Date().toISOString()}] ` + a.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' ');
  lines.push(line);
  fs.writeFileSync(PROGRESS, lines.join('\n') + '\n');
};

const TARGET_INDEXES = [
  { key: { status: 1, updatedAt: 1 }, name: 'status_updatedAt', background: true },
  { key: { siteId: 1, deviceType: 1, createdAt: -1 }, name: 'siteId_deviceType_createdAt', background: true },
  { key: { phase: 1, chunkLeaseUntil: 1 }, name: 'phase_chunkLeaseUntil', background: true },
];

async function attemptOnce() {
  // Fresh client per attempt — avoids stale topology cache after Atlas failover.
  const prisma = new PrismaClient();
  try {
    // Probe: does the cluster have a primary right now?
    await prisma.$runCommandRaw({ ping: 1 });
    log('cluster reachable, attempting createIndexes...');

    let okCount = 0;
    for (const idx of TARGET_INDEXES) {
      try {
        await prisma.$runCommandRaw({ createIndexes: 'SiteAudit', indexes: [idx] });
        log(`  ✓ ${idx.name}`);
        okCount++;
      } catch (e) {
        log(`  ✗ ${idx.name}: ${e.message?.split('\n')[0]?.slice(0, 100)}`);
      }
    }

    if (okCount === TARGET_INDEXES.length) {
      // Verify by listing
      try {
        const after = await prisma.$runCommandRaw({ listIndexes: 'SiteAudit', cursor: {} });
        log('final indexes:');
        for (const i of (after.cursor?.firstBatch || [])) {
          log(`  ${i.name}: ${JSON.stringify(i.key)}`);
        }
      } catch (e) {
        log('listIndexes after-success failed (non-fatal):', e.message?.slice(0, 100));
      }
      return true;
    }
    return false;
  } catch (e) {
    log('cluster ping failed:', e.message?.split('\n')[0]?.slice(0, 120));
    return false;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

(async () => {
  log('=== index loop start');
  const MAX_MINUTES = 60; // give up after 1 hour of cluster being down
  for (let minute = 1; minute <= MAX_MINUTES; minute++) {
    log(`--- attempt ${minute} ---`);
    const done = await attemptOnce();
    if (done) {
      log('=== ALL INDEXES IN PLACE — exiting cleanly ===');
      process.exit(0);
    }
    log(`waiting 60s before next attempt...`);
    await new Promise(r => setTimeout(r, 60_000));
  }
  log('=== gave up after 60 minutes — cluster never recovered');
  process.exit(1);
})();
