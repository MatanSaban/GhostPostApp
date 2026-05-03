/**
 * Phase 2 migration — embedded SiteAudit.issues[] → AuditIssue collection.
 *
 * Usage:
 *   node _migrate-issues.js           # dry-run, prints plan
 *   node _migrate-issues.js --apply   # commits
 *
 * Idempotent. Per audit:
 *   1. Skip if no embedded issues.
 *   2. Skip if any AuditIssueDoc row already exists for this audit.
 *   3. Otherwise read site for accountId, createMany the rows, leave the
 *      embedded array intact (the dual-mode reader still falls back to it
 *      until Phase 5 cleanup).
 *
 * Same shape + safety story as _migrate-pageresults.js.
 */

const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');
const OUT = 'c:/tmp/migrate-issues.txt';
const lines = [];
const log = (...a) => {
  const line = `[${new Date().toISOString()}] ` + a.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' ');
  lines.push(line);
  console.log(line);
  fs.writeFileSync(OUT, lines.join('\n') + '\n');
};

async function main() {
  log(`=== migrate-issues ${APPLY ? 'APPLY MODE' : 'DRY-RUN MODE'} ===`);

  const candidates = await prisma.$runCommandRaw({
    aggregate: 'SiteAudit',
    pipeline: [
      { $match: { $expr: { $gt: [{ $size: { $ifNull: ['$issues', []] } }, 0] } } },
      { $project: { _id: 1, siteId: 1, issues: 1 } },
    ],
    cursor: { batchSize: 50 },
  });

  const audits = candidates?.cursor?.firstBatch || [];
  log(`Found ${audits.length} audit(s) with embedded issues.`);

  let migrated = 0;
  let skippedAlreadyDone = 0;
  let skippedEmpty = 0;
  let totalRows = 0;
  let errors = 0;

  for (const a of audits) {
    const auditId = a._id?.$oid || String(a._id);
    const siteId = a.siteId?.$oid || String(a.siteId);
    const embeddedRows = a.issues || [];

    if (embeddedRows.length === 0) {
      skippedEmpty++;
      continue;
    }

    const existingCount = await prisma.auditIssueDoc.count({ where: { auditId } });
    if (existingCount > 0) {
      log(`  skip ${auditId} — ${existingCount} rows already in AuditIssue collection`);
      skippedAlreadyDone++;
      continue;
    }

    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { accountId: true },
    });
    if (!site) {
      log(`  WARN: site ${siteId} not found for audit ${auditId} — skipping`);
      errors++;
      continue;
    }
    const accountId = site.accountId;

    log(`  migrate ${auditId} → ${embeddedRows.length} rows`);

    if (APPLY) {
      try {
        await prisma.auditIssueDoc.createMany({
          data: embeddedRows.map((i) => ({
            auditId,
            siteId,
            accountId,
            type: i.type || 'technical',
            severity: i.severity || 'warning',
            message: i.message || '',
            url: i.url || null,
            suggestion: i.suggestion || null,
            source: i.source || null,
            details: i.details || null,
            detailedSources: i.detailedSources || undefined,
            device: i.device || null,
            boundingBox: i.boundingBox || undefined,
          })),
        });
        migrated++;
        totalRows += embeddedRows.length;
      } catch (err) {
        log(`  ERROR migrating ${auditId}: ${err.message?.split('\n')[0]?.slice(0, 200)}`);
        errors++;
      }
    } else {
      migrated++;
      totalRows += embeddedRows.length;
    }
  }

  log('');
  log('=== Summary ===');
  log(`mode:                ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  log(`audits with data:    ${audits.length}`);
  log(`would migrate:       ${migrated}`);
  log(`skipped (empty):     ${skippedEmpty}`);
  log(`skipped (done):      ${skippedAlreadyDone}`);
  log(`errors:              ${errors}`);
  log(`total rows:          ${totalRows}`);
  log('');
  if (!APPLY) {
    log('DRY-RUN complete. Re-run with --apply to commit.');
  } else if (errors === 0) {
    log('APPLY complete with no errors. The embedded issues[] arrays are');
    log('intact — dual-mode reader still falls back to them. After ~1 week');
    log('clean in mode=on, run the cleanup script (Phase 5) to null them.');
  } else {
    log('APPLY completed with errors. Re-run to retry the failed audits.');
  }
}

main()
  .catch((e) => { log(`FATAL: ${e.message}`); process.exit(1); })
  .finally(() => prisma.$disconnect());
