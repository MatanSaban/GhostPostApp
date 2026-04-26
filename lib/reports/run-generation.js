/**
 * Report generation pipeline.
 *
 * Centralizes the heavy work of producing a client report: querying audits +
 * agent insights, generating the AI summary, fetching per-section data,
 * rendering the PDF, uploading to Cloudinary, and finalizing the archive
 * row.
 *
 * This is intentionally callable from two places:
 *   1. POST /api/reports/generate — the user-initiated path. The route
 *      creates a PENDING archive synchronously and then calls runGeneration
 *      fire-and-forget so the HTTP response can return immediately.
 *   2. POST /api/reports/[id]/regenerate — the post-edit path. After the
 *      user tweaks the AI summary (or status), we re-render with the saved
 *      sectionsConfig + sectionData snapshot.
 *
 * We deliberately do NOT throw out of this function — failures are caught,
 * logged, and the archive is moved to ERROR status with the message stored
 * on `report.error`. The caller is fire-and-forget; bubbling exceptions
 * up would crash the process or trigger Next's unhandled-rejection logging
 * with no archive update for the user to see.
 */

import { v2 as cloudinary } from 'cloudinary';
import prisma from '@/lib/prisma';
import { generateReportPdf, getDefaultBranding } from '@/lib/reports/pdf-generator';
import { generateTextResponse } from '@/lib/ai/gemini';
import { notifyAccountMembers } from '@/lib/notifications';

// ───────────────────────────────────────────────────────────────────────────
// Cloudinary config — same shape as the route handler used to do inline.
// ───────────────────────────────────────────────────────────────────────────
function ensureCloudinaryConfig() {
  const cUrl = process.env.CLOUDINARY_URL;
  if (cUrl) {
    const match = cUrl.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/);
    if (match) {
      cloudinary.config({ cloud_name: match[3], api_key: match[1], api_secret: match[2], secure: true });
      return;
    }
  }
  if (!cloudinary.config().api_key) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }
}

async function fetchImageAsBase64(imageUrl) {
  if (!imageUrl) return null;
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || 'image/png';
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    return `data:${contentType};base64,${base64}`;
  } catch {
    return null;
  }
}

function uploadPdfToCloudinary(buffer, folder, publicId) {
  ensureCloudinaryConfig();
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: 'raw',
        type: 'upload',
        format: 'pdf',
        overwrite: true,
        access_mode: 'public',
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    );
    uploadStream.end(buffer);
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Period helpers (kept here so callers don't need to know the format).
// ───────────────────────────────────────────────────────────────────────────
export function monthKeyToRange(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}$/.test(key)) return null;
  const [y, m] = key.split('-').map(Number);
  if (m < 1 || m > 12) return null;
  const from = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const to = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0) - 1);
  return { from, to };
}

export function formatMonthLabel(key, locale = 'en') {
  const range = monthKeyToRange(key);
  if (!range) return key;
  return range.from.toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// ───────────────────────────────────────────────────────────────────────────
// AI executive summary
// ───────────────────────────────────────────────────────────────────────────
async function generateAiSummary(siteName, currentScore, previousScore, executedActions, locale = 'en', { accountId, userId, siteId, currentPeriodLabel, previousPeriodLabel } = {}) {
  const delta = currentScore != null && previousScore != null ? currentScore - previousScore : null;
  const hasComparison = Boolean(currentPeriodLabel && previousPeriodLabel);

  const templates = {
    en: {
      deltaWithChange: hasComparison
        ? `Between ${previousPeriodLabel} and ${currentPeriodLabel}, the site's health score changed by ${delta > 0 ? '+' : ''}${delta} (from ${previousScore} to ${currentScore}).`
        : `The site's health score changed by ${delta > 0 ? '+' : ''}${delta} to ${currentScore}.`,
      deltaNoChange: hasComparison
        ? `For ${currentPeriodLabel}, the site's current health score is ${currentScore ?? 'not available'}.`
        : `The site's current health score is ${currentScore ?? 'not available'}.`,
      noActions: hasComparison
        ? `No automated actions were executed during ${currentPeriodLabel}.`
        : 'No automated actions were executed this month.',
      defaultAction: 'SEO optimization',
      prompt: `You are a senior SEO Account Manager for an agency. Write a concise, 4-sentence executive summary for the client about their website "${siteName}"${hasComparison ? `, comparing ${previousPeriodLabel} to ${currentPeriodLabel}` : ''}.

{deltaText}

We executed these automated actions: {actionsList}

Keep it professional, encouraging, and focused on ROI. Output plain text only, no markdown.`,
      system: 'You are a professional SEO account manager writing monthly reports for clients.',
    },
    he: {
      deltaWithChange: hasComparison
        ? `בין ${previousPeriodLabel} ל-${currentPeriodLabel}, ציון בריאות האתר השתנה ב-${delta > 0 ? '+' : ''}${delta} (מ-${previousScore} ל-${currentScore}).`
        : `ציון בריאות האתר השתנה ב-${delta > 0 ? '+' : ''}${delta} ל-${currentScore}.`,
      deltaNoChange: hasComparison
        ? `עבור ${currentPeriodLabel}, ציון בריאות האתר הוא ${currentScore ?? 'לא זמין'}.`
        : `ציון בריאות האתר הנוכחי הוא ${currentScore ?? 'לא זמין'}.`,
      noActions: hasComparison
        ? `לא בוצעו פעולות אוטומטיות במהלך ${currentPeriodLabel}.`
        : 'לא בוצעו פעולות אוטומטיות החודש.',
      defaultAction: 'אופטימיזציית SEO',
      prompt: `אתה מנהל חשבון SEO בכיר בסוכנות. כתוב סיכום מנהלים תמציתי בן 4 משפטים עבור הלקוח על האתר שלו "${siteName}"${hasComparison ? `, בהשוואה בין ${previousPeriodLabel} ל-${currentPeriodLabel}` : ''}.

{deltaText}

ביצענו את הפעולות האוטומטיות הבאות: {actionsList}

שמור על טון מקצועי ומעודד, עם דגש על ROI. פלט טקסט רגיל בלבד, ללא markdown. כתוב בעברית.`,
      system: 'אתה מנהל חשבון SEO מקצועי הכותב דוחות חודשיים ללקוחות. כתוב בעברית.',
    },
  };

  const t = templates[locale] || templates.en;
  const deltaText = delta != null ? t.deltaWithChange : t.deltaNoChange;
  const actionsList = executedActions?.length > 0
    ? executedActions.slice(0, 10).map((a) => a.data?.description || a.descriptionKey || t.defaultAction).join(', ')
    : t.noActions;
  const prompt = t.prompt.replace('{deltaText}', deltaText).replace('{actionsList}', actionsList);

  try {
    const summary = await generateTextResponse({
      system: t.system,
      prompt,
      maxTokens: 300,
      temperature: 0.7,
      operation: 'REPORT_SUMMARY',
      metadata: { siteName, currentScore, actionsCount: executedActions?.length || 0, locale },
      accountId,
      userId,
      siteId,
    });
    return summary.trim();
  } catch (error) {
    console.error('[ReportGen] AI summary generation failed:', error);
    return null;
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Build the per-section data snapshot. Persisted on the archive so the
// preview + regenerate steps don't need to re-query (and re-query would
// drift since live data changes between generation and edit).
// ───────────────────────────────────────────────────────────────────────────
async function fetchSectionData({ siteId, site, sectionsOrdered, currentAudit, previousAudit, executedActions, currentRange, previousRange, currentMonthKey, previousMonthKey }) {
  const sectionData = {};

  if (sectionsOrdered.includes('keywords')) {
    const keywords = await prisma.keyword.findMany({
      where: { siteId },
      orderBy: [{ position: 'asc' }, { updatedAt: 'desc' }],
      take: 25,
      select: { id: true, keyword: true, position: true, searchVolume: true, url: true, status: true, intents: true },
    });
    const totalKeywords = await prisma.keyword.count({ where: { siteId } });
    // Period-aware ranking columns. We expose:
    //   - currentMonthKey + previousMonthKey so the renderer knows
    //     which columns to show
    //   - a per-keyword `ranksByMonth` map (current period only for
    //     live data; the seed populates both periods)
    // For real reports without rank history we fall back to the
    // single `position` value already on the Keyword row.
    sectionData.keywords = {
      items: keywords.map((k) => ({
        ...k,
        ranksByMonth: currentMonthKey ? { [currentMonthKey]: k.position } : {},
      })),
      total: totalKeywords,
      currentMonthKey: currentMonthKey || null,
      previousMonthKey: previousMonthKey || null,
    };
  }

  if (sectionsOrdered.includes('competitors')) {
    const competitors = await prisma.competitor.findMany({
      where: { siteId, isActive: true },
      orderBy: { updatedAt: 'desc' },
      take: 15,
      select: { id: true, domain: true, name: true, url: true, favicon: true },
    });
    const totalCompetitors = await prisma.competitor.count({ where: { siteId, isActive: true } });
    sectionData.competitors = { items: competitors, total: totalCompetitors };
  }

  if (sectionsOrdered.includes('seo')) {
    // SEO section is *not* the audit score (that lives in healthScore).
    // It surfaces strategy/positioning signals from the site profile so
    // the section reads meaningfully even when seoStrategy/writingStyle
    // aren't filled in. We pull writing style + strategy first, then
    // fall back to businessCategory + businessAbout when those are
    // missing so the section always carries something useful.
    sectionData.seo = {
      writingStyle: site.writingStyle || null,
      seoStrategy: site.seoStrategy || null,
      businessCategory: site.businessCategory || null,
      businessAbout: site.businessAbout || null,
    };
  }

  if (sectionsOrdered.includes('geo')) {
    sectionData.geo = {
      targetLocations: site.targetLocations || [],
      contentLanguage: site.contentLanguage || null,
      wpLocale: site.wpLocale || null,
    };
  }

  if (sectionsOrdered.includes('overview')) {
    sectionData.overview = {
      keywordsCount: sectionData.keywords?.total ?? (await prisma.keyword.count({ where: { siteId } })),
      competitorsCount: sectionData.competitors?.total ?? (await prisma.competitor.count({ where: { siteId, isActive: true } })),
      contentCount: await prisma.content.count({ where: { siteId } }),
      currentScore: currentAudit?.score ?? null,
      previousScore: previousAudit?.score ?? null,
      executedActionsCount: executedActions.length,
    };
  }

  if (sectionsOrdered.includes('siteAudits')) {
    const auditWhere = { siteId };
    if (currentRange && previousRange) {
      const earliest = previousRange.from < currentRange.from ? previousRange.from : currentRange.from;
      const latest = previousRange.to > currentRange.to ? previousRange.to : currentRange.to;
      auditWhere.completedAt = { gte: earliest, lte: latest };
    } else if (currentRange) {
      auditWhere.completedAt = { gte: currentRange.from, lte: currentRange.to };
    }
    const historyAudits = await prisma.siteAudit.findMany({
      where: auditWhere,
      orderBy: { completedAt: 'desc' },
      take: 12,
      select: { id: true, score: true, status: true, completedAt: true, createdAt: true },
    });
    sectionData.siteAudits = { items: historyAudits, total: historyAudits.length };
  }

  return sectionData;
}

// ───────────────────────────────────────────────────────────────────────────
// Public entry: run the full generation pipeline for an existing PENDING
// archive. On success, the archive is updated to DRAFT with the rendered
// PDF + persisted snapshot. On failure, archive moves to ERROR.
// ───────────────────────────────────────────────────────────────────────────
export async function runReportGeneration(reportId, opts = {}) {
  const {
    siteId,
    accountId,
    userId,
    locale = 'en',
    sectionsRequested,
    currentMonthKey,
    previousMonthKey,
    forceMonth,
    // When provided (regenerate path) we skip re-fetching audits/actions and
    // re-running AI; we just re-render the PDF from the persisted snapshot.
    snapshot,
  } = opts;

  try {
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      include: { account: true },
    });
    if (!site) throw new Error(`Site ${siteId} not found`);

    const currentRange = monthKeyToRange(currentMonthKey);
    const previousRange = monthKeyToRange(previousMonthKey);
    const currentPeriodLabel = currentRange ? formatMonthLabel(currentMonthKey, locale) : null;
    const previousPeriodLabel = previousRange ? formatMonthLabel(previousMonthKey, locale) : null;
    const month = forceMonth
      || (currentRange ? formatMonthLabel(currentMonthKey, locale) : new Date().toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', { month: 'long', year: 'numeric' }));

    let currentAudit = null;
    let previousAudit = null;
    let executedActions = [];
    let aiSummary = null;
    let sectionsOrdered = [];
    let sectionData = {};

    if (snapshot) {
      // Regenerate path: trust the persisted snapshot, only re-render the PDF.
      sectionsOrdered = Array.isArray(snapshot.sectionsOrdered) ? snapshot.sectionsOrdered : [];
      sectionData = snapshot.sectionData || {};
      aiSummary = snapshot.aiSummary ?? null;
      currentAudit = snapshot.currentAudit ?? null;
      previousAudit = snapshot.previousAudit ?? null;
      executedActions = snapshot.executedActions || [];
    } else {
      // Pick the audit pair that matches the configured period(s).
      if (currentRange) {
        currentAudit = await prisma.siteAudit.findFirst({
          where: { siteId, status: 'COMPLETED', completedAt: { gte: currentRange.from, lte: currentRange.to } },
          orderBy: { completedAt: 'desc' },
        });
      }
      if (previousRange) {
        previousAudit = await prisma.siteAudit.findFirst({
          where: { siteId, status: 'COMPLETED', completedAt: { gte: previousRange.from, lte: previousRange.to } },
          orderBy: { completedAt: 'desc' },
        });
      }
      if (!currentRange && !previousRange) {
        const audits = await prisma.siteAudit.findMany({
          where: { siteId, status: 'COMPLETED' },
          orderBy: { completedAt: 'desc' },
          take: 2,
        });
        currentAudit = audits[0] || null;
        previousAudit = audits[1] || null;
      }

      let actionsFrom;
      let actionsTo;
      if (currentRange) {
        actionsFrom = currentRange.from;
        actionsTo = currentRange.to;
      } else {
        actionsFrom = new Date();
        actionsFrom.setDate(actionsFrom.getDate() - 30);
        actionsTo = new Date();
      }
      executedActions = await prisma.agentInsight.findMany({
        where: { siteId, status: 'EXECUTED', executedAt: { gte: actionsFrom, lte: actionsTo } },
        orderBy: { executedAt: 'desc' },
      });

      const DEFAULT_ORDER = ['overview', 'aiSummary', 'healthScore', 'aiActions', 'keywords', 'competitors', 'seo', 'geo', 'siteAudits'];
      const reportConfig = (site.toolSettings || {}).reportConfig || {};
      if (Array.isArray(sectionsRequested) && sectionsRequested.length) {
        sectionsOrdered = sectionsRequested.filter((id) => typeof id === 'string');
      } else if (Array.isArray(reportConfig.sections) && reportConfig.sections.length) {
        sectionsOrdered = reportConfig.sections.filter((s) => s?.enabled !== false && s?.id).map((s) => s.id);
      } else {
        sectionsOrdered = ['overview', 'aiSummary', 'healthScore', 'aiActions', 'siteAudits'];
      }
      const allowed = new Set(DEFAULT_ORDER);
      sectionsOrdered = [...new Set(sectionsOrdered)].filter((id) => allowed.has(id));

      if (sectionsOrdered.includes('aiSummary')) {
        aiSummary = await generateAiSummary(
          site.name,
          currentAudit?.score,
          previousAudit?.score,
          executedActions,
          locale,
          { accountId, userId, siteId, currentPeriodLabel, previousPeriodLabel }
        );
      }

      sectionData = await fetchSectionData({
        siteId,
        site,
        sectionsOrdered,
        currentAudit,
        previousAudit,
        executedActions,
        currentRange,
        previousRange,
        currentMonthKey,
        previousMonthKey,
      });
    }

    // Branding (re-fetched each run so logo/color updates take effect).
    const whiteLabelConfig = site.account?.whiteLabelConfig || {};
    const [agencyLogoBase64, siteLogoBase64] = await Promise.all([
      fetchImageAsBase64(whiteLabelConfig.agencyLogo),
      // Site's own logo (or favicon as fallback) — embedded in the
      // PDF alongside the agency's so the report carries both brands.
      fetchImageAsBase64(site.logo || site.favicon || null),
    ]);
    const branding = {
      ...getDefaultBranding(),
      logoUrl: agencyLogoBase64,
      agencyName: site.account?.name || '',
      primaryColor: whiteLabelConfig.accentColor || '#7b2cbf',
      replyToEmail: whiteLabelConfig.replyToEmail || '',
      // Contact lines shown under the agency logo in the PDF header.
      // Email/website fall back to account-level fields so an agency
      // doesn't have to duplicate them in the white-label config.
      contactEmail: whiteLabelConfig.replyToEmail || site.account?.generalEmail || null,
      contactWebsite: whiteLabelConfig.website || site.account?.website || null,
      contactPhone: whiteLabelConfig.phone || null,
    };

    // Render PDF.
    const pdfBuffer = await generateReportPdf({
      branding,
      siteName: site.name,
      siteUrl: site.url,
      siteLogo: siteLogoBase64,
      month,
      aiSummary,
      currentScore: currentAudit?.score,
      previousScore: previousAudit?.score,
      categoryScores: currentAudit?.categoryScores,
      previousCategoryScores: previousAudit?.categoryScores,
      executedActions: sectionsOrdered.includes('aiActions') ? executedActions : [],
      locale,
      sectionsOrdered,
      sectionData,
      currentPeriodLabel,
      previousPeriodLabel,
    });

    const timestamp = Date.now();
    const sanitizedSiteName = site.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    const publicId = `report-${sanitizedSiteName}-${month.replace(/\s/g, '-').toLowerCase()}-${timestamp}`;
    const pdfUrl = await uploadPdfToCloudinary(pdfBuffer, `reports/${site.accountId}`, publicId);

    // We persist a small snapshot (the data fed to the PDF) so the preview
    // page can render the same structure in HTML and so `regenerate` after
    // an aiSummary edit can re-render without re-querying.
    const persistedSnapshot = {
      sectionsOrdered,
      sectionData,
      // Audits are stored in their entirety so the regenerate path doesn't
      // need to re-pick them. We exclude executedActions data heavier than
      // a simple list of {id, executedAt, descriptionKey, data.description}
      // to keep the doc small.
      currentAudit: currentAudit
        ? { id: currentAudit.id, score: currentAudit.score, categoryScores: currentAudit.categoryScores, completedAt: currentAudit.completedAt }
        : null,
      previousAudit: previousAudit
        ? { id: previousAudit.id, score: previousAudit.score, categoryScores: previousAudit.categoryScores, completedAt: previousAudit.completedAt }
        : null,
      executedActions: (executedActions || []).slice(0, 30).map((a) => ({
        id: a.id,
        executedAt: a.executedAt,
        actionType: a.actionType,
        descriptionKey: a.descriptionKey,
        data: { description: a?.data?.description },
      })),
    };

    await prisma.reportArchive.update({
      where: { id: reportId },
      data: {
        pdfUrl,
        status: 'DRAFT',
        month,
        aiSummary,
        sectionsConfig: { sections: sectionsOrdered.map((id) => ({ id, enabled: true })) },
        sectionData: persistedSnapshot,
        locale,
        error: null,
        metadata: {
          score: currentAudit?.score,
          delta: currentAudit?.score != null && previousAudit?.score != null
            ? currentAudit.score - previousAudit.score
            : null,
          actionsCount: executedActions.length,
          currentMonth: currentMonthKey || null,
          previousMonth: previousMonthKey || null,
          currentPeriodLabel,
          previousPeriodLabel,
        },
      },
    });

    // Header-bell notification on completion. Uses translation keys so
    // the dashboard renders the message in each user's locale rather
    // than the report's. Best-effort — failures here don't roll back
    // the successful generation.
    try {
      await notifyAccountMembers(site.accountId, {
        type: 'report_complete',
        title: 'notifications.reportComplete.title',
        message: 'notifications.reportComplete.message',
        link: `/dashboard/settings?tab=client-reporting`,
        data: {
          reportId,
          siteId: site.id,
          siteName: site.name,
          month,
        },
      });
    } catch (notifyErr) {
      console.warn('[ReportGen] notifyAccountMembers failed:', notifyErr?.message || notifyErr);
    }

    return { ok: true };
  } catch (error) {
    console.error('[ReportGen] runReportGeneration error:', error);
    try {
      await prisma.reportArchive.update({
        where: { id: reportId },
        data: { status: 'ERROR', error: String(error?.message || error) },
      });
    } catch (updateErr) {
      console.error('[ReportGen] Failed to mark archive ERROR:', updateErr);
    }
    // Failure notification — surfaces the error in the bell so the
    // user knows something is wrong even if they navigated away from
    // the reports page.
    try {
      const site = await prisma.site.findUnique({ where: { id: opts?.siteId }, select: { id: true, name: true, accountId: true } });
      if (site?.accountId) {
        await notifyAccountMembers(site.accountId, {
          type: 'report_failed',
          title: 'notifications.reportFailed.title',
          message: 'notifications.reportFailed.message',
          link: `/dashboard/settings?tab=client-reporting`,
          data: {
            reportId,
            siteId: site.id,
            siteName: site.name,
            error: String(error?.message || error),
          },
        });
      }
    } catch {}
    return { ok: false, error: String(error?.message || error) };
  }
}
