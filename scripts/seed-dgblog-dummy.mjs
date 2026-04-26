/**
 * Seed dummy reporting data for dgblog.co.il (account: office@red-ghost.co.il).
 *
 * Backfills SiteAudit + AgentInsight + ReportArchive rows for every
 * month from 2025-01 through 2026-04, skipping any month that already
 * has data so re-running the script is safe.
 *
 * Usage:
 *   node scripts/seed-dgblog-dummy.mjs
 *
 * Notes:
 * - Audits get realistic-looking score progressions (drifts ±3-7 points
 *   per month around a baseline of 70).
 * - Agent insights are generated 5–15 per month with assorted action
 *   types pulled from a fixed pool.
 * - Each month gets ONE report archive (DRAFT) per locale (en + he)
 *   linked by `reportGroupId` so #8's multi-language column will work
 *   on the seeded data once that lands.
 * - For months before 2026-04-20 we fill EVERY day window. After that
 *   day we leave it alone (the user is creating real reports there).
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

const prisma = new PrismaClient();

const ACCOUNT_EMAIL = 'office@red-ghost.co.il';
const SITE_URL_HINT = 'dgblog.co.il';
const CUTOFF = new Date('2026-04-20T00:00:00.000Z');

const ACTION_TYPES = [
  'update_meta',
  'add_internal_link',
  'fix_broken_link',
  'optimize_image',
  'fix_heading_structure',
  'add_schema_markup',
  'improve_content',
  'fix_accessibility',
];

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomScore(base = 70) {
  return Math.max(40, Math.min(98, base + rand(-7, 7)));
}

function monthBounds(year, monthIndex) {
  // monthIndex is 0-based.
  const from = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
  const to = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0) - 1);
  return { from, to };
}

function monthKey(year, monthIndex) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

function monthLabel(year, monthIndex, locale) {
  const d = new Date(Date.UTC(year, monthIndex, 1));
  return d.toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

async function findContext() {
  // Resolve the account from the user's email -> AccountMember -> Account
  // chain. We accept any account that user is a member of and where a
  // matching site exists.
  const user = await prisma.user.findUnique({
    where: { email: ACCOUNT_EMAIL },
    select: { id: true, email: true },
  });
  if (!user) throw new Error(`User ${ACCOUNT_EMAIL} not found`);

  const memberships = await prisma.accountMember.findMany({
    where: { userId: user.id },
    select: { accountId: true },
  });
  if (memberships.length === 0) throw new Error(`User ${ACCOUNT_EMAIL} has no account memberships`);

  for (const m of memberships) {
    const site = await prisma.site.findFirst({
      where: {
        accountId: m.accountId,
        url: { contains: SITE_URL_HINT, mode: 'insensitive' },
      },
      select: { id: true, url: true, name: true, accountId: true },
    });
    if (site) return { user, accountId: m.accountId, site };
  }

  throw new Error(`No site matching "${SITE_URL_HINT}" found in any of ${ACCOUNT_EMAIL}'s accounts`);
}

async function seedAuditsForMonth(siteId, year, monthIndex, baselineScore) {
  const { from, to } = monthBounds(year, monthIndex);
  // Cap the upper bound at the cutoff so we don't seed past the user's
  // real data window.
  const upper = to > CUTOFF ? CUTOFF : to;
  if (from > CUTOFF) return null;

  const existing = await prisma.siteAudit.findFirst({
    where: { siteId, completedAt: { gte: from, lte: upper } },
    select: { id: true, score: true },
  });
  if (existing) return existing;

  const completedAt = new Date(Date.UTC(year, monthIndex, rand(2, 26), rand(8, 18), rand(0, 59)));
  const score = randomScore(baselineScore);
  const categoryScores = {
    technical: randomScore(score),
    performance: randomScore(score - 3),
    visual: randomScore(score + 2),
    accessibility: randomScore(score - 1),
  };
  const audit = await prisma.siteAudit.create({
    data: {
      siteId,
      status: 'COMPLETED',
      score,
      categoryScores,
      completedAt,
      createdAt: completedAt,
    },
  });
  return audit;
}

async function seedActionsForMonth(siteId, accountId, year, monthIndex) {
  const { from, to } = monthBounds(year, monthIndex);
  const upper = to > CUTOFF ? CUTOFF : to;
  if (from > CUTOFF) return [];

  const existingCount = await prisma.agentInsight.count({
    where: { siteId, executedAt: { gte: from, lte: upper } },
  });
  if (existingCount > 0) return [];

  const count = rand(5, 15);
  const inserts = [];
  for (let i = 0; i < count; i++) {
    const day = rand(1, Math.min(28, Math.floor((upper.getTime() - from.getTime()) / 86400000) + 1));
    const executedAt = new Date(Date.UTC(year, monthIndex, day, rand(8, 20), rand(0, 59)));
    if (executedAt > upper) continue;
    const actionType = ACTION_TYPES[rand(0, ACTION_TYPES.length - 1)];
    inserts.push({
      siteId,
      accountId,
      // AgentInsight requires category + type + title/description keys
      // even for ACTION-type entries; we tag everything as TECHNICAL
      // ACTION since it's seed data and won't be analyzed live.
      category: 'TECHNICAL',
      type: 'ACTION',
      titleKey: `agent.actions.${actionType}.title`,
      descriptionKey: `agent.actions.${actionType}.description`,
      status: 'EXECUTED',
      actionType,
      executedAt,
      createdAt: executedAt,
      data: { description: `Seeded action: ${actionType.replace(/_/g, ' ')}` },
    });
  }
  if (inserts.length > 0) {
    await prisma.agentInsight.createMany({ data: inserts });
  }
  return inserts;
}

// Realistic-feeling dummy keyword/competitor data so the preview's
// keywords + competitors sections aren't empty for seeded reports.
const DUMMY_KEYWORDS = [
  'digital marketing', 'seo strategy', 'content writing', 'link building', 'wordpress hosting',
  'site speed', 'mobile optimization', 'schema markup', 'meta description', 'keyword research',
  'serp analysis', 'backlink audit', 'core web vitals', 'image alt text', 'internal linking',
  'h1 tags', 'sitemap xml', 'robots txt', 'page experience', 'cls optimization',
];

const DUMMY_COMPETITORS = [
  { domain: 'competitor-a.co.il', name: 'Competitor A' },
  { domain: 'competitor-b.com', name: 'Competitor B' },
  { domain: 'rival-blog.co.il', name: 'Rival Blog' },
  { domain: 'industry-leader.com', name: 'Industry Leader' },
  { domain: 'fast-growing.co.il', name: 'Fast Growing' },
];

function makeKeywordsSnapshot(currentMonthKey, previousMonthKey) {
  const items = DUMMY_KEYWORDS.slice(0, rand(8, 16)).map((kw, i) => {
    const currentRank = rand(1, 50);
    // Synthesize a previous-month rank that drifts ±10 places from
    // the current rank. Lets the comparison columns show realistic
    // movement instead of static numbers.
    const previousRank = previousMonthKey
      ? Math.max(1, Math.min(99, currentRank + rand(-10, 10)))
      : null;
    const ranksByMonth = {};
    if (currentMonthKey) ranksByMonth[currentMonthKey] = currentRank;
    if (previousMonthKey) ranksByMonth[previousMonthKey] = previousRank;
    return {
      id: `seed-kw-${i}`,
      keyword: kw,
      position: currentRank,
      searchVolume: rand(100, 8000),
      url: '/',
      status: 'TRACKING',
      intents: [],
      ranksByMonth,
    };
  });
  return { items, total: rand(items.length, items.length + 30) };
}

function makeCompetitorsSnapshot() {
  const items = DUMMY_COMPETITORS.slice(0, rand(2, 5)).map((c, i) => ({
    id: `seed-comp-${i}`,
    ...c,
    url: `https://${c.domain}`,
    favicon: null,
  }));
  return { items, total: items.length };
}

async function seedReportForMonth({ siteId, accountId, year, monthIndex, currentAudit, prevAudit, actionsCount }) {
  const { from, to } = monthBounds(year, monthIndex);
  if (from > CUTOFF) return [];

  // Already-seeded check — skip if any DRAFT/SENT for this site/month exists.
  const monthString = monthLabel(year, monthIndex, 'en');
  const existing = await prisma.reportArchive.findFirst({
    where: { siteId, month: monthString },
    select: { id: true },
  });
  if (existing) return [];

  const reportGroupId = randomUUID(); // Pre-generate so EN + HE share it.
  const prevMonthIdx = monthIndex === 0 ? 11 : monthIndex - 1;
  const prevYear = monthIndex === 0 ? year - 1 : year;

  const currentMonthKey = monthKey(year, monthIndex);
  const previousMonthKey = monthKey(prevYear, prevMonthIdx);

  // Include every renderable section so the preview is fully populated
  // (matches the user's "all sections in all months" requirement).
  const sectionsOrdered = [
    'overview',
    'aiSummary',
    'healthScore',
    'aiActions',
    'keywords',
    'competitors',
    'seo',
    'geo',
    'siteAudits',
  ];

  // Pull this month's actual seeded actions back out so the snapshot's
  // aiActions block has real entries to render in the preview.
  const monthActions = await prisma.agentInsight.findMany({
    where: {
      siteId,
      executedAt: { gte: from, lte: to > CUTOFF ? CUTOFF : to },
    },
    orderBy: { executedAt: 'desc' },
    take: 20,
    select: {
      id: true,
      executedAt: true,
      actionType: true,
      descriptionKey: true,
      data: true,
    },
  });

  const monthAudits = await prisma.siteAudit.findMany({
    where: {
      siteId,
      completedAt: { gte: from, lte: to > CUTOFF ? CUTOFF : to },
    },
    orderBy: { completedAt: 'desc' },
    select: { id: true, score: true, status: true, completedAt: true, createdAt: true },
  });

  const keywordsSnapshot = makeKeywordsSnapshot(currentMonthKey, previousMonthKey);
  const competitorsSnapshot = makeCompetitorsSnapshot();

  // Stub snapshot — preview will work, even if not fully data-rich.
  const persistedSnapshot = {
    sectionsOrdered,
    sectionData: {
      overview: {
        keywordsCount: keywordsSnapshot.total,
        competitorsCount: competitorsSnapshot.total,
        contentCount: rand(10, 250),
        currentScore: currentAudit?.score ?? null,
        previousScore: prevAudit?.score ?? null,
        executedActionsCount: actionsCount,
      },
      keywords: keywordsSnapshot,
      competitors: competitorsSnapshot,
      seo: {
        // We deliberately omit score + categoryScores from the SEO
        // section now (those live in healthScore). Only writingStyle
        // and a tiny strategy summary are seeded.
        writingStyle: 'Conversational, focused on practical SEO tips for SMB blogs.',
        seoStrategy: {
          summary: 'Long-tail keyword targeting paired with technical SEO baseline maintenance.',
          focus: 'wordpress + content',
        },
      },
      geo: {
        targetLocations: ['Israel', 'Tel Aviv', 'Jerusalem'],
        contentLanguage: 'he-IL',
        wpLocale: 'he_IL',
      },
      siteAudits: {
        items: monthAudits,
        total: monthAudits.length,
      },
    },
    currentAudit: currentAudit
      ? { id: currentAudit.id, score: currentAudit.score, completedAt: currentAudit.completedAt, categoryScores: currentAudit.categoryScores }
      : null,
    previousAudit: prevAudit
      ? { id: prevAudit.id, score: prevAudit.score, completedAt: prevAudit.completedAt, categoryScores: prevAudit.categoryScores }
      : null,
    executedActions: monthActions,
  };

  const created = [];
  for (const locale of ['en', 'he']) {
    const aiSummary = locale === 'he'
      ? `סיכום אוטומטי לדמו עבור ${monthLabel(year, monthIndex, 'he')}. ציון בריאות האתר ${currentAudit?.score ?? '-'}, ${actionsCount} פעולות AI בוצעו בתקופה.`
      : `Demo summary for ${monthLabel(year, monthIndex, 'en')}. Site health score ${currentAudit?.score ?? '-'}, ${actionsCount} AI actions completed in the period.`;

    const archive = await prisma.reportArchive.create({
      data: {
        siteId,
        accountId,
        recipients: [],
        status: 'DRAFT',
        month: monthLabel(year, monthIndex, locale),
        locale,
        aiSummary,
        sectionsConfig: { sections: sectionsOrdered.map((id) => ({ id, enabled: true })) },
        sectionData: persistedSnapshot,
        // Cloudinary URL is intentionally null for seeded rows so the
        // download button shows disabled — the in-platform preview
        // works fine off the snapshot alone.
        pdfUrl: null,
        // Stamp generatedAt back-dated so the table sort works as if
        // these reports were really created in their respective months.
        generatedAt: monthBounds(year, monthIndex).to,
        createdAt: monthBounds(year, monthIndex).to,
        metadata: {
          score: currentAudit?.score ?? null,
          delta: currentAudit?.score != null && prevAudit?.score != null
            ? currentAudit.score - prevAudit.score
            : null,
          actionsCount,
          currentMonth: currentMonthKey,
          previousMonth: previousMonthKey,
          currentPeriodLabel: monthLabel(year, monthIndex, locale),
          previousPeriodLabel: monthLabel(prevYear, prevMonthIdx, locale),
          seeded: true,
          reportGroupId, // stash here for now; #8 will move to a column.
        },
      },
    });
    created.push(archive);
  }
  return created;
}

async function wipePreviouslySeededReports(siteId) {
  // Pull every report row for this site, then delete the ones whose
  // metadata.seeded flag is set. We can't filter on Json metadata
  // directly via Prisma+Mongo, so we fetch + filter in JS.
  const all = await prisma.reportArchive.findMany({
    where: { siteId },
    select: { id: true, metadata: true },
  });
  const seededIds = all.filter((r) => r.metadata?.seeded === true).map((r) => r.id);
  if (seededIds.length > 0) {
    await prisma.reportArchive.deleteMany({ where: { id: { in: seededIds } } });
    console.log(`[seed-dgblog] Wiped ${seededIds.length} previously-seeded report rows.`);
  }
}

async function main() {
  console.log(`[seed-dgblog] Resolving site for ${ACCOUNT_EMAIL} → contains "${SITE_URL_HINT}"...`);
  const { user, accountId, site } = await findContext();
  console.log(`[seed-dgblog] Site: ${site.name} (${site.url}) → account ${accountId}`);

  // Always wipe existing seeded reports so re-runs reflect the latest
  // snapshot shape. Audits and agent insights stay (they don't have
  // the seeded flag and re-running creates them only when missing).
  await wipePreviouslySeededReports(site.id);

  const monthsToSeed = [];
  for (const year of [2025, 2026]) {
    for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
      const { from } = monthBounds(year, monthIndex);
      if (from > CUTOFF) continue;
      monthsToSeed.push({ year, monthIndex });
    }
  }

  let baselineScore = 65;
  const audits = []; // ordered for delta linking

  for (const m of monthsToSeed) {
    const audit = await seedAuditsForMonth(site.id, m.year, m.monthIndex, baselineScore);
    audits.push(audit);
    if (audit?.score) baselineScore = audit.score; // drift baseline forward
    const newActions = await seedActionsForMonth(site.id, accountId, m.year, m.monthIndex);
    const actionsCount = newActions.length;

    const prevAudit = audits[audits.length - 2] || null;
    const reports = await seedReportForMonth({
      siteId: site.id,
      accountId,
      year: m.year,
      monthIndex: m.monthIndex,
      currentAudit: audit,
      prevAudit,
      actionsCount,
    });

    console.log(
      `[seed-dgblog] ${monthKey(m.year, m.monthIndex)}: audit=${audit ? audit.score : 'skip'}` +
      ` actions=${actionsCount} reports=${reports.length}`
    );
  }

  console.log('[seed-dgblog] Done.');
}

main()
  .catch((err) => {
    console.error('[seed-dgblog] Error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
