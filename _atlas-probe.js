const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const OUT = 'c:/tmp/atlas-probe.txt';
const lines = [];
const log = (...args) => {
  const line = args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ');
  lines.push(line);
  fs.writeFileSync(OUT, lines.join('\n') + '\n');
};

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
  log('=== Atlas probe', new Date().toISOString());

  // 1. Collection stats — total size, doc count, avg size, indexes
  try {
    const stats = await withRetry('collStats', () =>
      prisma.$runCommandRaw({ collStats: 'SiteAudit' })
    );
    log('\n--- collStats(SiteAudit) ---');
    log(`docs:           ${stats.count}`);
    log(`totalSize:      ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
    log(`avgObjSize:     ${(stats.avgObjSize / 1024).toFixed(1)} KB`);
    log(`storageSize:    ${(stats.storageSize / 1024 / 1024).toFixed(1)} MB`);
    log(`totalIndexSize: ${(stats.totalIndexSize / 1024 / 1024).toFixed(1)} MB`);
    log(`nindexes:       ${stats.nindexes}`);
  } catch (e) { log('collStats FAILED:', e.message); }

  // 2. Top 10 largest SiteAudit documents — find the hot ones
  try {
    const sizes = await withRetry('docSizes', () =>
      prisma.$runCommandRaw({
        aggregate: 'SiteAudit',
        pipeline: [
          { $project: {
            _id: 1,
            siteId: 1,
            status: 1,
            phase: 1,
            deviceType: 1,
            pagesScanned: 1,
            createdAt: 1,
            sizeKB: { $divide: [{ $bsonSize: '$$ROOT' }, 1024] },
            issuesCount: { $size: { $ifNull: ['$issues', []] } },
            pageResultsCount: { $size: { $ifNull: ['$pageResults', []] } },
          }},
          { $sort: { sizeKB: -1 } },
          { $limit: 10 },
        ],
        cursor: {},
      })
    );
    log('\n--- top 10 largest SiteAudit docs ---');
    for (const d of (sizes.cursor?.firstBatch || [])) {
      log(`${d._id?.$oid || d._id} | ${d.sizeKB?.toFixed(0)} KB | status=${d.status} phase=${d.phase || 'legacy'} dev=${d.deviceType} pages=${d.pagesScanned} issues=${d.issuesCount} prs=${d.pageResultsCount}`);
    }
  } catch (e) { log('docSizes FAILED:', e.message); }

  // 3. Indexes — what's indexed on the hot collection?
  try {
    const indexes = await withRetry('indexes', () =>
      prisma.$runCommandRaw({ listIndexes: 'SiteAudit', cursor: {} })
    );
    log('\n--- indexes on SiteAudit ---');
    for (const idx of (indexes.cursor?.firstBatch || [])) {
      log(`${idx.name}: ${JSON.stringify(idx.key)}`);
    }
  } catch (e) { log('indexes FAILED:', e.message); }

  // 4. Currently running operations — anything stuck?
  try {
    const ops = await withRetry('currentOp', () =>
      prisma.$runCommandRaw({ currentOp: 1, secs_running: { $gt: 1 } })
    );
    const inprog = ops.inprog || [];
    log('\n--- long-running ops (>1s) ---');
    log(`count: ${inprog.length}`);
    for (const op of inprog.slice(0, 10)) {
      log(`  ${op.op} ${op.ns} secs=${op.secs_running} desc=${op.desc?.slice(0, 60)}`);
    }
  } catch (e) { log('currentOp FAILED:', e.message); }

  // 5. Server status — connections + opcounters
  try {
    const ss = await withRetry('serverStatus', () =>
      prisma.$runCommandRaw({ serverStatus: 1 })
    );
    log('\n--- serverStatus snapshot ---');
    if (ss.connections) log(`connections: current=${ss.connections.current} available=${ss.connections.available} totalCreated=${ss.connections.totalCreated}`);
    if (ss.opcounters) log(`opcounters: insert=${ss.opcounters.insert} query=${ss.opcounters.query} update=${ss.opcounters.update} delete=${ss.opcounters.delete} command=${ss.opcounters.command}`);
    if (ss.mem) log(`mem: resident=${ss.mem.resident}MB virtual=${ss.mem.virtual}MB`);
    if (ss.wiredTiger?.cache) {
      const c = ss.wiredTiger.cache;
      log(`wt-cache: bytes-currently=${(c['bytes currently in the cache'] / 1024 / 1024).toFixed(0)}MB max=${(c['maximum bytes configured'] / 1024 / 1024).toFixed(0)}MB`);
    }
  } catch (e) { log('serverStatus FAILED:', e.message); }

  // 6. Anything in system.profile? (only if profiling is enabled — usually not)
  try {
    const prof = await withRetry('profile', () =>
      prisma.$runCommandRaw({
        find: 'system.profile',
        filter: { ns: 'ghostpost.SiteAudit' },
        sort: { ts: -1 },
        limit: 5,
      })
    );
    const docs = prof.cursor?.firstBatch || [];
    log('\n--- last 5 slow ops on SiteAudit (if profiling on) ---');
    log(`count: ${docs.length}`);
    for (const d of docs) log(`  op=${d.op} millis=${d.millis} keysExamined=${d.keysExamined} docsExamined=${d.docsExamined}`);
  } catch (e) { log('profile FAILED (likely profiling disabled):', e.message); }

  await prisma.$disconnect();
  log('\n=== done');
})().catch(e => { log('FATAL:', e.message); process.exit(1); });
