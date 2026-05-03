/**
 * Backlink sync engine.
 *
 * Two entry points share one merge core:
 *   - syncBacklinksForSite   — pulls live from DataForSEO, comprehensive
 *                              (rows missing from the pull are marked LOST).
 *   - importBacklinksFromGscCsv — applies a parsed GSC CSV upload, additive
 *                              (CSV exports are samples; never marks LOST).
 *
 * Every run writes a BacklinkSync record so the UI can show last-sync info
 * and so we can throttle manual triggers.
 */

import prisma from '@/lib/prisma';
import { fetchBacklinksForSite } from '@/lib/dataforseo/backlinks';
import { runBacklinkInsights } from '@/lib/backlinks/insights';

/**
 * Core merge: reconcile a list of fresh items against existing Backlink rows
 * for a site, with per-source rules. Internal — callers should use one of
 * the wrappers below.
 *
 * @param {object} params
 * @param {string} params.siteId
 * @param {'DATAFORSEO'|'GSC_CSV'} params.source
 * @param {Array<object>} params.items - normalized rows
 * @param {boolean} params.markMissingAsLost - when true, rows whose `sources`
 *   include `source` but which weren't observed in this batch are marked LOST.
 *   DataForSEO sets this to true (full pull); CSV imports set it to false
 *   (CSV is a sample, not the universe).
 * @param {string|null} params.triggeredBy - userId, or null for cron
 */
async function applyBacklinkSync({ siteId, source, items, markMissingAsLost, triggeredBy }) {
  const syncRecord = await prisma.backlinkSync.create({
    data: { siteId, source, status: 'RUNNING', triggeredBy },
  });

  try {
    // Load all existing rows for this site so we can:
    //   - dedupe by (referringUrl, targetUrl)
    //   - graduate "shadow" rows (referringUrl, targetUrl='') from GSC into
    //     fully-specified rows when DataForSEO finds the target
    //   - apply LOST detection scoped to the syncing source
    const existing = await prisma.backlink.findMany({
      where: { siteId },
      select: {
        id: true,
        referringUrl: true,
        targetUrl: true,
        sources: true,
        status: true,
        firstSeen: true,
      },
    });
    const byKey = new Map(
      existing.map(r => [`${r.referringUrl}\t${r.targetUrl}`, r])
    );
    // Group rows by referringUrl so we can find a "shadow" (S, '') quickly.
    const byReferringUrl = new Map();
    for (const r of existing) {
      const list = byReferringUrl.get(r.referringUrl) || [];
      list.push(r);
      byReferringUrl.set(r.referringUrl, list);
    }

    let newCount = 0;
    let updatedCount = 0;
    const seenKeys = new Set();

    for (const item of items) {
      const itemTarget = item.targetUrl || '';
      const exactKey = `${item.referringUrl}\t${itemTarget}`;
      seenKeys.add(exactKey);

      const exact = byKey.get(exactKey);

      if (exact) {
        // Hit on exact (referringUrl, targetUrl). Merge: refresh provided
        // fields, keep null fields untouched, restore ACTIVE if previously LOST.
        const sources = Array.from(new Set([...(exact.sources || []), source]));
        const data = {
          sources,
          status: exact.status === 'LOST' ? 'ACTIVE' : exact.status,
        };
        if (item.lastSeen) data.lastSeen = item.lastSeen;
        if (item.anchorText !== null && item.anchorText !== undefined) data.anchorText = item.anchorText;
        if (item.isDofollow !== null && item.isDofollow !== undefined) data.isDofollow = item.isDofollow;
        if (item.domainRating !== null && item.domainRating !== undefined) data.domainRating = item.domainRating;
        if (item.spamScore !== null && item.spamScore !== undefined) data.spamScore = item.spamScore;
        await prisma.backlink.update({ where: { id: exact.id }, data });
        updatedCount += 1;
        continue;
      }

      // No exact match. If THIS sync has a real target and a shadow row
      // (S, '') already exists from GSC, graduate it: set the target,
      // record both sources. This avoids creating a duplicate row when a
      // GSC-discovered link is later confirmed by DataForSEO.
      if (itemTarget !== '' && byReferringUrl.has(item.referringUrl)) {
        const shadow = (byReferringUrl.get(item.referringUrl) || []).find(r => r.targetUrl === '');
        if (shadow) {
          const sources = Array.from(new Set([...(shadow.sources || []), source]));
          await prisma.backlink.update({
            where: { id: shadow.id },
            data: {
              targetUrl: itemTarget,
              sources,
              anchorText: item.anchorText ?? null,
              isDofollow: item.isDofollow ?? null,
              domainRating: item.domainRating ?? null,
              spamScore: item.spamScore ?? null,
              lastSeen: item.lastSeen || shadow.firstSeen,
              status: 'ACTIVE',
            },
          });
          // Update our local indexes so subsequent items in this batch don't
          // create a second row for the same (S, T) pair.
          byKey.delete(`${item.referringUrl}\t`);
          byKey.set(exactKey, { ...shadow, targetUrl: itemTarget, sources });
          updatedCount += 1;
          continue;
        }
      }

      // Pure insert.
      await prisma.backlink.create({
        data: {
          siteId,
          referringUrl: item.referringUrl,
          referringDomain: item.referringDomain || '',
          targetUrl: itemTarget,
          anchorText: item.anchorText ?? null,
          isDofollow: item.isDofollow ?? null,
          domainRating: item.domainRating ?? null,
          spamScore: item.spamScore ?? null,
          firstSeen: item.firstSeen || new Date(),
          lastSeen: item.lastSeen || new Date(),
          status: 'ACTIVE',
          sources: [source],
        },
      });
      newCount += 1;
    }

    let lostCount = 0;
    if (markMissingAsLost) {
      // Only DataForSEO triggers this. Mark rows attributed to THIS source
      // that weren't seen in the current pull as LOST. CSV-only rows are
      // never touched (their source didn't run; absence is meaningless).
      for (const row of existing) {
        const key = `${row.referringUrl}\t${row.targetUrl}`;
        if (seenKeys.has(key)) continue;
        if (!(row.sources || []).includes(source)) continue;
        if (row.status === 'LOST') continue;
        await prisma.backlink.update({ where: { id: row.id }, data: { status: 'LOST' } });
        lostCount += 1;
      }
    }

    return prisma.backlinkSync.update({
      where: { id: syncRecord.id },
      data: {
        status: 'COMPLETED',
        totalFound: items.length,
        newCount,
        lostCount,
        completedAt: new Date(),
      },
    });
  } catch (err) {
    await prisma.backlinkSync.update({
      where: { id: syncRecord.id },
      data: {
        status: 'FAILED',
        errorMessage: String(err?.message || err).slice(0, 500),
        completedAt: new Date(),
      },
    });
    throw err;
  }
}

/**
 * DataForSEO sync wrapper. Fetches live, then merges with LOST-on-missing,
 * then runs the insight detectors. Insight failures are swallowed so a flaky
 * AI call or HEAD check never poisons the user-visible sync result.
 */
export async function syncBacklinksForSite({ siteId, source = 'DATAFORSEO', triggeredBy = null }) {
  if (source !== 'DATAFORSEO') {
    throw new Error(`syncBacklinksForSite only supports DATAFORSEO; got ${source}`);
  }

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { id: true, url: true, accountId: true, isActive: true },
  });
  if (!site) {
    throw new Error(`Site ${siteId} not found`);
  }

  const items = await fetchBacklinksForSite(site.url);
  const syncResult = await applyBacklinkSync({
    siteId,
    source: 'DATAFORSEO',
    items,
    markMissingAsLost: true,
    triggeredBy,
  });

  // Fire and forget — insights are advisory, sync result is authoritative.
  runBacklinkInsights({ siteId, accountId: site.accountId }).catch(err => {
    console.warn('[backlinks/sync] insights failed:', err?.message || err);
  });

  return syncResult;
}

/**
 * GSC CSV import. Pre-parsed items are merged additively — CSVs are samples,
 * not full enumerations, so absence does not imply a lost link.
 */
export async function importBacklinksFromGscCsv({ siteId, items, triggeredBy = null }) {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { id: true, isActive: true },
  });
  if (!site) {
    throw new Error(`Site ${siteId} not found`);
  }

  return applyBacklinkSync({
    siteId,
    source: 'GSC_CSV',
    items: items || [],
    markMissingAsLost: false,
    triggeredBy,
  });
}

/**
 * Returns the most recent BacklinkSync for a site. Used by the UI to show
 * "last synced X ago" and to gate manual-refresh rate limiting.
 */
export async function getLatestSync(siteId) {
  return prisma.backlinkSync.findFirst({
    where: { siteId },
    orderBy: { createdAt: 'desc' },
  });
}
