/**
 * Audit-issues storage abstraction (Phase 2).
 *
 * Mirrors the design of page-results-helper.js:
 *
 *   AUDIT_USE_ISSUES_COLLECTION='off' (default) — embedded `SiteAudit.issues[]`
 *   AUDIT_USE_ISSUES_COLLECTION='dual'           — write both, read collection
 *                                                  with embedded fallback
 *   AUDIT_USE_ISSUES_COLLECTION='on'             — collection only
 *
 * Every consumer reads/writes through this module. Never touch
 * `prisma.auditIssueDoc` or `audit.issues` directly from feature code.
 */

import prisma from '@/lib/prisma';

const FLAG_ENV = 'AUDIT_USE_ISSUES_COLLECTION';

export function getMode() {
  const v = (process.env[FLAG_ENV] || '').toLowerCase();
  if (v === '1' || v === 'on' || v === 'true') return 'on';
  if (v === 'dual') return 'dual';
  return 'off';
}

const writesNewCollection = () => {
  const m = getMode();
  return m === 'dual' || m === 'on';
};
const writesEmbedded = () => {
  const m = getMode();
  return m === 'off' || m === 'dual';
};
const readsNewCollection = () => {
  const m = getMode();
  return m === 'dual' || m === 'on';
};

/**
 * Strip the doc-only fields so the returned shape matches the legacy embedded
 * shape. Preserves `id` so transformers can diff against it (see
 * applyIssuesTransform).
 */
function stripDocFields(doc) {
  if (!doc) return doc;
  const { auditId: _aid, siteId: _sid, accountId: _acc, createdAt: _ca, ...rest } = doc;
  return rest;
}

/**
 * Read all issues for an audit. Returns the same shape as the legacy
 * embedded array (with an extra `id` field on each issue when sourced from
 * the new collection — caller can ignore it; spreads preserve it).
 */
export async function getAllIssues(auditId) {
  if (!auditId) return [];

  if (readsNewCollection()) {
    const docs = await prisma.auditIssueDoc.findMany({
      where: { auditId },
      orderBy: { createdAt: 'asc' },
    });
    if (docs.length > 0) return docs.map(stripDocFields);

    if (getMode() !== 'off') {
      const audit = await prisma.siteAudit.findUnique({
        where: { id: auditId },
        select: { issues: true },
      });
      return audit?.issues || [];
    }
    return [];
  }

  const audit = await prisma.siteAudit.findUnique({
    where: { id: auditId },
    select: { issues: true },
  });
  return audit?.issues || [];
}

/**
 * Read issues filtered by URL — page-detail modal, fix flows.
 */
export async function getIssuesByUrl(auditId, url) {
  if (!auditId) return [];

  if (readsNewCollection()) {
    const docs = await prisma.auditIssueDoc.findMany({
      where: { auditId, url },
    });
    if (docs.length > 0) return docs.map(stripDocFields);

    if (getMode() !== 'off') {
      const audit = await prisma.siteAudit.findUnique({
        where: { id: auditId },
        select: { issues: true },
      });
      return (audit?.issues || []).filter((i) => i.url === url);
    }
    return [];
  }

  const audit = await prisma.siteAudit.findUnique({
    where: { id: auditId },
    select: { issues: true },
  });
  return (audit?.issues || []).filter((i) => i.url === url);
}

/**
 * Append a batch of new issues. Used by per-page persist (chunked path),
 * cross-page analysis, vision, recheck.
 *
 * Pass `{ skipEmbedded: true }` if the caller already wrote the embedded
 * array atomically (e.g. processChunk's raw $push on 'off' or 'dual' mode).
 */
export async function appendIssues({ auditId, siteId, accountId }, issues, opts = {}) {
  if (!issues || issues.length === 0) return;

  const promises = [];

  if (writesNewCollection()) {
    promises.push(
      prisma.auditIssueDoc.createMany({
        data: issues.map((i) => normalizeForInsert({ auditId, siteId, accountId }, i)),
      }),
    );
  }

  if (writesEmbedded() && !opts.skipEmbedded) {
    promises.push(
      prisma.$runCommandRaw({
        update: 'SiteAudit',
        updates: [{
          q: { _id: { $oid: auditId } },
          u: { $push: { issues: { $each: issues } } },
        }],
      }),
    );
  }

  await Promise.all(promises);
}

/**
 * Whether the embedded-write path should be exercised by the caller. Used
 * by processChunk's atomic raw $push to gate whether `issues` is included
 * in the same op as pageResults / pendingUrls / pagesScanned.
 */
export function shouldIncludeIssuesInRawPush() {
  return writesEmbedded();
}

/**
 * Replace the issue set for a specific URL. Used by recheck (re-evaluating
 * recheckable issues for one or more URLs) and rescan (full per-page reset).
 *
 * Caller passes:
 *   - `urls`: the URL set being rechecked/rescanned
 *   - `predicateForRemoval(issue)`: filter — only delete issues for which this returns true
 *   - `replacements`: new issues to insert (already normalized)
 *
 * Behavior:
 *   - Embedded mode: read-modify-write — strip matching, append new.
 *   - Collection mode: deleteMany matching, createMany new.
 */
export async function replaceIssuesForUrls(
  { auditId, siteId, accountId },
  urls,
  predicateForRemoval,
  replacements,
  opts = {},
) {
  const urlSet = new Set(urls);
  const writeEmbedded = writesEmbedded() && !opts.skipEmbedded;
  const writeCollection = writesNewCollection();

  // Embedded — single read-modify-write across the whole array.
  if (writeEmbedded) {
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        const fresh = await prisma.siteAudit.findUnique({
          where: { id: auditId },
          select: { issues: true },
        });
        const existing = fresh?.issues || [];
        const survivors = existing.filter((i) => {
          if (!urlSet.has(i.url)) return true;       // untouched URL
          return !predicateForRemoval(i);             // keep if predicate doesn't match
        });
        const newEmbedded = [...survivors, ...replacements];
        await prisma.siteAudit.update({
          where: { id: auditId },
          data: { issues: newEmbedded },
        });
        break;
      } catch (e) {
        if (e.code === 'P2034' && attempt < 5) {
          await new Promise((r) => setTimeout(r, 400 * attempt));
          continue;
        }
        console.warn(`[issues-helper] replaceIssuesForUrls embedded failed: ${e.message}`);
        break;
      }
    }
  }

  if (writeCollection) {
    // Need to delete only the predicate-matching subset for these URLs.
    // Predicate is a JS function — can't push to MongoDB. Read matching docs
    // first, filter in JS, delete by id.
    const candidates = await prisma.auditIssueDoc.findMany({
      where: { auditId, url: { in: urls } },
      select: { id: true, type: true, severity: true, message: true, url: true, source: true, suggestion: true, details: true, detailedSources: true, device: true, boundingBox: true },
    });
    const idsToDelete = candidates
      .filter((c) => predicateForRemoval(c))
      .map((c) => c.id);
    if (idsToDelete.length > 0) {
      await prisma.auditIssueDoc.deleteMany({ where: { id: { in: idsToDelete } } });
    }
    if (replacements.length > 0) {
      await prisma.auditIssueDoc.createMany({
        data: replacements.map((i) => normalizeForInsert({ auditId, siteId, accountId }, i)),
      });
    }
  }
}

/**
 * Apply a transformer that takes the full issues array and returns a new
 * full issues array. Used by fix flows that flip severities.
 *
 * Diffs old vs. new by `id` (when sourced from collection — transformers
 * preserve fields via spread) so we can do targeted updates instead of
 * deleting + re-inserting everything.
 *
 * The transform contract is unchanged from legacy: it gets a full array and
 * returns a full array.
 */
export async function applyIssuesTransform({ auditId }, transform, opts = {}) {
  const writeEmbedded = writesEmbedded() && !opts.skipEmbedded;

  // Embedded path — full read-modify-write of the array.
  if (writeEmbedded) {
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        const fresh = await prisma.siteAudit.findUnique({
          where: { id: auditId },
          select: { issues: true },
        });
        const newArr = transform(fresh?.issues || []);
        if (!newArr) break;
        await prisma.siteAudit.update({
          where: { id: auditId },
          data: { issues: newArr },
        });
        break;
      } catch (e) {
        if (e.code === 'P2034' && attempt < 5) {
          await new Promise((r) => setTimeout(r, 200 * attempt));
          continue;
        }
        console.warn(`[issues-helper] applyIssuesTransform embedded failed: ${e.message}`);
        break;
      }
    }
  }

  // Collection path — read with id, transform, diff, update changed rows.
  if (writesNewCollection()) {
    const docs = await prisma.auditIssueDoc.findMany({ where: { auditId } });
    const before = docs.map(stripDocFields); // includes id
    const after = transform(before);
    if (!after) return;

    const beforeById = new Map(before.map((i) => [i.id, i]));
    const seenIds = new Set();
    const updates = [];
    const inserts = [];

    for (const newI of after) {
      if (newI.id) {
        seenIds.add(newI.id);
        const old = beforeById.get(newI.id);
        if (!old) {
          // Foreign id — treat as new
          inserts.push(newI);
        } else if (JSON.stringify(old) !== JSON.stringify(newI)) {
          updates.push(newI);
        }
      } else {
        inserts.push(newI);
      }
    }
    const deletes = before.filter((i) => i.id && !seenIds.has(i.id)).map((i) => i.id);

    if (deletes.length > 0) {
      await prisma.auditIssueDoc.deleteMany({ where: { id: { in: deletes } } }).catch((err) => {
        console.warn(`[issues-helper] applyIssuesTransform deleteMany failed: ${err.message}`);
      });
    }
    for (const upd of updates) {
      const { id: _id, ...data } = upd;
      await prisma.auditIssueDoc.update({ where: { id: upd.id }, data }).catch((err) => {
        console.warn(`[issues-helper] applyIssuesTransform update failed for ${upd.id}: ${err.message}`);
      });
    }
    if (inserts.length > 0) {
      // Need site/account scope for inserts — look it up once.
      const audit = await prisma.siteAudit.findUnique({
        where: { id: auditId },
        select: { siteId: true, site: { select: { accountId: true } } },
      });
      if (audit) {
        await prisma.auditIssueDoc.createMany({
          data: inserts.map((i) => normalizeForInsert(
            { auditId, siteId: audit.siteId, accountId: audit.site.accountId },
            i,
          )),
        }).catch((err) => {
          console.warn(`[issues-helper] applyIssuesTransform createMany failed: ${err.message}`);
        });
      }
    }
  }
}

/**
 * Replace the entire issue set for an audit. Used by finalize after dedup
 * (it computes the trimmed/deduped final set and writes it whole).
 */
export async function replaceAllIssues({ auditId, siteId, accountId }, issues, opts = {}) {
  const writeEmbedded = writesEmbedded() && !opts.skipEmbedded;

  if (writeEmbedded) {
    await prisma.siteAudit.update({
      where: { id: auditId },
      data: { issues },
    }).catch((err) => {
      console.warn(`[issues-helper] replaceAllIssues embedded failed: ${err.message}`);
    });
  }

  if (writesNewCollection()) {
    // Wholesale: delete all then insert all. For a few-hundred-issue audit
    // this is fine (one deleteMany + one createMany).
    await prisma.auditIssueDoc.deleteMany({ where: { auditId } });
    if (issues.length > 0) {
      await prisma.auditIssueDoc.createMany({
        data: issues.map((i) => normalizeForInsert({ auditId, siteId, accountId }, i)),
      });
    }
  }
}

// ════════════════════════════════════════════════════════════════════════
// Server-side aggregations (Phase 4)
// ════════════════════════════════════════════════════════════════════════

const SEVERITY_RANK = { error: 0, warning: 1, info: 2, notice: 2, passed: 3 };
const SOURCE_PRIORITY = {
  html: 0, playwright: 1, psi: 2, axe: 3, 'ai-vision': 4, system: 5, fetch: 6,
};

/**
 * Pick the worst severity from a set of values (lower rank = worse).
 */
function worstSeverity(set) {
  let worst = null;
  let worstRank = Infinity;
  for (const s of set) {
    const r = SEVERITY_RANK[s] ?? 4;
    if (r < worstRank) { worstRank = r; worst = s; }
  }
  return worst;
}

/**
 * Merge a set of device values into a single string. Same logic as the
 * client's aggregator: if mixed → 'both'.
 */
function mergeDevices(set) {
  const filtered = [...set].filter(Boolean);
  if (filtered.length === 0) return null;
  if (filtered.length === 1) return filtered[0];
  if (filtered.includes('both')) return 'both';
  // Mixed desktop+mobile → 'both'
  return 'both';
}

/**
 * Sort aggregated rows: errors → warnings → info → passed. Within a severity,
 * by source priority. Same order the client expected.
 */
function sortAggregated(rows) {
  rows.sort((a, b) => {
    const sevDiff = (SEVERITY_RANK[a.severity] ?? 4) - (SEVERITY_RANK[b.severity] ?? 4);
    if (sevDiff !== 0) return sevDiff;
    const srcA = SOURCE_PRIORITY[a.source] ?? 99;
    const srcB = SOURCE_PRIORITY[b.source] ?? 99;
    return srcA - srcB;
  });
  return rows;
}

/**
 * Build the rows the client UI expects from a list of issues. Used both as
 * the in-memory fallback (mode='off' or non-collection callers) and as the
 * post-processing pass on collection-aggregated raw groups.
 */
function aggregateInMemory(issues) {
  const groups = new Map();
  for (const issue of issues) {
    const key = issue.message || 'unknown';
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        message: issue.message,
        severity: issue.severity,
        type: issue.type,
        source: issue.source || null,
        suggestion: issue.suggestion || null,
        details: issue.details || null,
        device: issue.device || null,
        count: 0,
        urls: [],
      });
    }
    const group = groups.get(key);
    group.count++;
    if (issue.url && !group.urls.includes(issue.url)) {
      group.urls.push(issue.url);
    }
    const r = SEVERITY_RANK[issue.severity] ?? 4;
    const cur = SEVERITY_RANK[group.severity] ?? 4;
    if (r < cur) group.severity = issue.severity;
    if (issue.device) {
      if (!group.device) group.device = issue.device;
      else if (group.device !== issue.device && group.device !== 'both') group.device = 'both';
    }
  }
  return sortAggregated(Array.from(groups.values()));
}

/**
 * Aggregated issue rows for the client overview / per-tab UI.
 *
 * @param {string} auditId
 * @param {object} [opts]
 * @param {'technical'|'performance'|'visual'|'accessibility'} [opts.category]
 * @returns {Promise<Array>}  Rows in the same shape the client's aggregateIssuesByCategory used to return.
 */
export async function aggregateIssues(auditId, { category } = {}) {
  if (!auditId) return [];

  // Collection mode: server-side $group. Returns ~one row per unique message
  // (typically 20-50) instead of one per issue (5000+). The post-processing
  // for severity merge / sort is cheap and stays in JS.
  if (readsNewCollection()) {
    const matchClause = { auditId };
    if (category) matchClause.type = category;

    try {
      const result = await prisma.$runCommandRaw({
        aggregate: 'AuditIssue',
        pipeline: [
          { $match: matchClause },
          {
            $group: {
              _id: '$message',
              key: { $first: '$message' },
              message: { $first: '$message' },
              type: { $first: '$type' },
              source: { $first: '$source' },
              suggestion: { $first: '$suggestion' },
              details: { $first: '$details' },
              count: { $sum: 1 },
              urls: { $addToSet: '$url' },
              severities: { $addToSet: '$severity' },
              devices: { $addToSet: '$device' },
            },
          },
        ],
        cursor: { batchSize: 1000 },
      });

      const raw = result?.cursor?.firstBatch || [];
      if (raw.length > 0) {
        const rows = raw.map((g) => ({
          key: g.key,
          message: g.message,
          type: g.type,
          source: g.source || null,
          suggestion: g.suggestion || null,
          details: g.details || null,
          count: g.count,
          urls: (g.urls || []).filter(Boolean),
          severity: worstSeverity(g.severities || []),
          device: mergeDevices(g.devices || []),
        }));
        return sortAggregated(rows);
      }
      // Collection empty — fall through to embedded fallback in dual mode.
    } catch (err) {
      console.warn(`[issues-helper] aggregateIssues (collection) failed: ${err.message}`);
    }
  }

  // Embedded fallback (mode='off' OR collection empty in 'dual' mode).
  const all = await getAllIssues(auditId);
  const filtered = category ? all.filter((i) => i.type === category) : all;
  return aggregateInMemory(filtered);
}

/**
 * Issues for a specific message key. Used by the drill-down view to list the
 * individual occurrences once the user clicks an aggregated row.
 */
export async function getIssuesByMessage(auditId, message) {
  if (!auditId || !message) return [];

  if (readsNewCollection()) {
    const docs = await prisma.auditIssueDoc.findMany({
      where: { auditId, message },
    });
    if (docs.length > 0) return docs.map(stripDocFields);
    if (getMode() !== 'off') {
      const audit = await prisma.siteAudit.findUnique({
        where: { id: auditId },
        select: { issues: true },
      });
      return (audit?.issues || []).filter((i) => i.message === message);
    }
    return [];
  }

  const audit = await prisma.siteAudit.findUnique({
    where: { id: auditId },
    select: { issues: true },
  });
  return (audit?.issues || []).filter((i) => i.message === message);
}

/**
 * Issues for a specific category (type). Used by AccessibilityTab + the
 * AI-translation cache pre-fill path that need every issue in one category
 * but don't care about other tabs.
 */
export async function getIssuesByCategory(auditId, category) {
  if (!auditId || !category) return [];

  if (readsNewCollection()) {
    const docs = await prisma.auditIssueDoc.findMany({
      where: { auditId, type: category },
    });
    if (docs.length > 0) return docs.map(stripDocFields);
    if (getMode() !== 'off') {
      const audit = await prisma.siteAudit.findUnique({
        where: { id: auditId },
        select: { issues: true },
      });
      return (audit?.issues || []).filter((i) => i.type === category);
    }
    return [];
  }

  const audit = await prisma.siteAudit.findUnique({
    where: { id: auditId },
    select: { issues: true },
  });
  return (audit?.issues || []).filter((i) => i.type === category);
}

/**
 * Severity counts for the score widget without loading individual issues.
 * Cheap server-side aggregation — one row of counts.
 */
export async function getSeverityCounts(auditId) {
  if (!auditId) return { passed: 0, warnings: 0, errors: 0, info: 0 };

  if (readsNewCollection()) {
    try {
      const result = await prisma.$runCommandRaw({
        aggregate: 'AuditIssue',
        pipeline: [
          { $match: { auditId } },
          { $group: { _id: '$severity', count: { $sum: 1 } } },
        ],
        cursor: { batchSize: 100 },
      });
      const raw = result?.cursor?.firstBatch || [];
      if (raw.length > 0) {
        const counts = { passed: 0, warnings: 0, errors: 0, info: 0 };
        for (const r of raw) {
          if (r._id === 'passed') counts.passed = r.count;
          else if (r._id === 'warning') counts.warnings = r.count;
          else if (r._id === 'error') counts.errors = r.count;
          else if (r._id === 'info' || r._id === 'notice') counts.info += r.count;
        }
        return counts;
      }
    } catch (err) {
      console.warn(`[issues-helper] getSeverityCounts (collection) failed: ${err.message}`);
    }
  }

  const all = await getAllIssues(auditId);
  return {
    passed: all.filter((i) => i.severity === 'passed').length,
    warnings: all.filter((i) => i.severity === 'warning').length,
    errors: all.filter((i) => i.severity === 'error').length,
    info: all.filter((i) => i.severity === 'info' || i.severity === 'notice').length,
  };
}

/**
 * Find duplicate (title, url[]) pairs across pageResults. Used by the
 * cross-page analysis at finalize time. Returns a Map keyed by normalized
 * title → array of URLs sharing that title (only entries where length > 1).
 *
 * Server-side aggregation when in collection mode keeps memory bounded
 * regardless of audit size.
 */
export async function findDuplicateFields(auditId, field /* 'title' | 'metaDescription' */) {
  if (!auditId || (field !== 'title' && field !== 'metaDescription')) return new Map();

  // Always go through Prisma — pageResults can be embedded OR collection,
  // but the AGGREGATION here is independent of the issues helper. Use the
  // pageResults helper for the read.
  // (Imported lazily to avoid a circular dep with page-results-helper.)
  const { getAllPageResults } = await import('./page-results-helper.js');
  const pageResults = await getAllPageResults(auditId);

  const norm = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const map = new Map();
  for (const pr of pageResults) {
    const v = norm(pr[field]);
    if (!v) continue;
    if (!map.has(v)) map.set(v, []);
    map.get(v).push(pr.url);
  }
  for (const k of [...map.keys()]) {
    if (map.get(k).length < 2) map.delete(k);
  }
  return map;
}

// ─── helpers ─────────────────────────────────────────────────────────────

function normalizeForInsert({ auditId, siteId, accountId }, issue) {
  return {
    auditId,
    siteId,
    accountId,
    type: issue.type || 'technical',
    severity: issue.severity || 'warning',
    message: issue.message || '',
    url: issue.url || null,
    suggestion: issue.suggestion || null,
    source: issue.source || null,
    details: issue.details || null,
    detailedSources: issue.detailedSources || undefined,
    device: issue.device || null,
    boundingBox: issue.boundingBox || undefined,
  };
}
