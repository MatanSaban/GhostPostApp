const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const OUT = 'c:/tmp/index-create.txt';
const lines = [];
const log = (...a) => { lines.push(a.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' ')); fs.writeFileSync(OUT, lines.join('\n') + '\n'); };

async function withRetry(label, fn, attempts = 4) {
  for (let i = 1; i <= attempts; i++) {
    try { return await fn(); }
    catch (e) {
      log(`[${label}] attempt ${i} failed: ${e.message}`);
      if (i === attempts) throw e;
      await new Promise(r => setTimeout(r, 1500 * i));
    }
  }
}

(async () => {
  log('=== Phase 0: SiteAudit indexes', new Date().toISOString());

  // List current indexes first so we know what's there
  try {
    const before = await withRetry('listIndexes-before', () =>
      prisma.$runCommandRaw({ listIndexes: 'SiteAudit', cursor: {} })
    );
    log('\n--- existing indexes ---');
    for (const idx of (before.cursor?.firstBatch || [])) {
      log(`  ${idx.name}: ${JSON.stringify(idx.key)}`);
    }
  } catch (e) {
    log('listIndexes-before FAILED:', e.message);
  }

  // Create the three new indexes in background mode (no collection lock).
  // Names are explicit so re-runs are idempotent (Mongo silently no-ops on
  // existing index with the same definition).
  const newIndexes = [
    { key: { status: 1, updatedAt: 1 }, name: 'status_updatedAt', background: true },
    { key: { siteId: 1, deviceType: 1, createdAt: -1 }, name: 'siteId_deviceType_createdAt', background: true },
    { key: { phase: 1, chunkLeaseUntil: 1 }, name: 'phase_chunkLeaseUntil', background: true },
  ];

  log('\n--- creating ---');
  for (const idx of newIndexes) {
    try {
      await withRetry(`create-${idx.name}`, () =>
        prisma.$runCommandRaw({ createIndexes: 'SiteAudit', indexes: [idx] })
      );
      log(`  ${idx.name}: OK`);
    } catch (e) {
      log(`  ${idx.name}: FAILED - ${e.message}`);
    }
  }

  // Confirm by listing again
  try {
    const after = await withRetry('listIndexes-after', () =>
      prisma.$runCommandRaw({ listIndexes: 'SiteAudit', cursor: {} })
    );
    log('\n--- final indexes ---');
    for (const idx of (after.cursor?.firstBatch || [])) {
      log(`  ${idx.name}: ${JSON.stringify(idx.key)}`);
    }
  } catch (e) {
    log('listIndexes-after FAILED:', e.message);
  }

  await prisma.$disconnect();
  log('\n=== done');
})().catch((e) => { log('FATAL:', e.message); process.exit(1); });
