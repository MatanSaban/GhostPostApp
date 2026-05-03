/**
 * Phase 1 migration — embedded SiteAudit.pageResults[] → AuditPageResult collection.
 *
 * Usage:
 *   node _migrate-pageresults.js              # dry-run, prints plan
 *   node _migrate-pageresults.js --apply      # actually moves data
 *
 * Safe to re-run. Idempotent. Per audit:
 *   1. Skip if no embedded pageResults to migrate.
 *   2. Skip if any AuditPageResult row already exists for this audit (assume
 *      previously migrated; re-running shouldn't double-insert).
 *   3. Otherwise: read site for accountId, createMany the rows, leave the
 *      embedded array intact so the dual-mode reader can still fall back to
 *      it. Phase 5 cleanup will null the embedded arrays once we're confident.
 *
 * Batched per audit to keep memory bounded; runs sequentially across audits
 * because the bottleneck is per-audit createMany latency, not throughput.
 */

const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');
const OUT = 'c:/tmp/migrate-pageresults.txt';
const lines = [];
const log = (...a) => {
  const line = `[${new Date().toISOString()}] ` + a.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' ');
  lines.push(line);
  console.log(line);
  fs.writeFileSync(OUT, lines.join('\n') + '\n');
};

async function main() {
  log(`=== migrate-pageresults ${APPLY ? 'APPLY MODE' : 'DRY-RUN MODE'} ===`);

  // Pull all audits that have a non-empty embedded pageResults array.
  // This filter happens server-side via $expr so we don't ship 80MB to Node.
  const candidates = await prisma.$runCommandRaw({
    aggregate: 'SiteAudit',
    pipeline: [
      { $match: { $expr: { $gt: [{ $size: { $ifNull: ['$pageResults', []] } }, 0] } } },
      { $project: { _id: 1, siteId: 1, pageResults: 1 } },
    ],
    cursor: { batchSize: 50 },
  });

  const audits = candidates?.cursor?.firstBatch || [];
  log(`Found ${audits.length} audit(s) with embedded pageResults.`);

  let migrated = 0;
  let skippedAlreadyDone = 0;
  let skippedEmpty = 0;
  let totalRows = 0;
  let errors = 0;

  for (const a of audits) {
    const auditId = a._id?.$oid || String(a._id);
    const siteId = a.siteId?.$oid || String(a.siteId);
    const embeddedRows = a.pageResults || [];

    if (embeddedRows.length === 0) {
      skippedEmpty++;
      continue;
    }

    // Idempotency check — has anyone already inserted rows for this audit?
    const existingCount = await prisma.auditPageResultDoc.count({
      where: { auditId },
    });
    if (existingCount > 0) {
      log(`  skip ${auditId} — ${existingCount} rows already in AuditPageResult collection`);
      skippedAlreadyDone++;
      continue;
    }

    // Need accountId to denormalize. Pulled from the site.
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
        await prisma.auditPageResultDoc.createMany({
          data: embeddedRows.map((pr) => ({
            auditId,
            siteId,
            accountId,
            url: pr.url,
            statusCode: pr.statusCode ?? null,
            title: pr.title ?? null,
            metaDescription: pr.metaDescription ?? null,
            robotsMeta: pr.robotsMeta ?? null,
            ttfb: pr.ttfb ?? null,
            performanceScore: pr.performanceScore ?? null,
            lcp: pr.lcp ?? null,
            cls: pr.cls ?? null,
            inp: pr.inp ?? null,
            jsErrors: pr.jsErrors || [],
            brokenResources: pr.brokenResources || [],
            issueCount: pr.issueCount ?? 0,
            screenshotDesktop: pr.screenshotDesktop ?? null,
            screenshotMobile: pr.screenshotMobile ?? null,
            screenshotsDesktop: pr.screenshotsDesktop || [],
            screenshotsMobile: pr.screenshotsMobile || [],
            filmstripDesktop: pr.filmstripDesktop ?? null,
            filmstripMobile: pr.filmstripMobile ?? null,
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
    log('APPLY complete with no errors. The embedded pageResults[] arrays are');
    log('intact — the dual-mode reader still falls back to them. After ~1 week');
    log('of clean prod runs in mode=on, run the cleanup script (Phase 5) to');
    log('null them out and reclaim Atlas storage.');
  } else {
    log('APPLY completed with errors. Re-run to retry the failed audits — the');
    log('idempotency guard skips ones that already migrated.');
  }
}

main()
  .catch((e) => { log(`FATAL: ${e.message}`); process.exit(1); })
  .finally(() => prisma.$disconnect());
