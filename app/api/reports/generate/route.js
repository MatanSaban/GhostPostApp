/**
 * White-Label Report Generation API
 *
 * POST /api/reports/generate
 *
 * Creates a PENDING ReportArchive immediately and returns its id, then
 * runs the heavy generation pipeline (AI summary + section data + PDF +
 * Cloudinary upload) as a fire-and-forget async block on the server. The
 * client polls /api/reports/[id] until the status flips off PENDING.
 *
 * GET /api/reports/generate?siteId=xxx
 *
 * Lists recent reports for a site (used by the dashboard list view).
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember } from '@/lib/auth-permissions';
import { hasPermission, CAPABILITIES } from '@/lib/permissions';
import { getPlanLimits } from '@/lib/account-utils';
import { runReportGeneration, monthKeyToRange, formatMonthLabel } from '@/lib/reports/run-generation';

function getReportMonth(locale = 'en') {
  return new Date().toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', { month: 'long', year: 'numeric' });
}

export async function POST(request) {
  try {
    const { authorized, member } = await getCurrentAccountMember();
    if (!authorized || !member) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(member, 'REPORTS', CAPABILITIES.VIEW)) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const body = await request.json();
    const {
      siteId,
      forceMonth,
      locale = 'en',
      sections: requestedSections,
      currentMonth: currentMonthKey,
      previousMonth: previousMonthKey,
      recipients: requestedRecipients,
      reportGroupId: requestedGroupId,
    } = body;

    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
    }

    // Validate format up-front so we 400 synchronously instead of failing
    // halfway through the background job.
    if (currentMonthKey && !monthKeyToRange(currentMonthKey)) {
      return NextResponse.json({ error: 'Invalid currentMonth format (expected YYYY-MM)' }, { status: 400 });
    }
    if (previousMonthKey && !monthKeyToRange(previousMonthKey)) {
      return NextResponse.json({ error: 'Invalid previousMonth format (expected YYYY-MM)' }, { status: 400 });
    }

    const site = await prisma.site.findUnique({
      where: { id: siteId },
      include: { account: { include: { subscription: { include: { plan: true } } } } },
    });
    if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    if (site.accountId !== member.accountId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const plan = site.account?.subscription?.plan;
    const limits = getPlanLimits(plan);
    if (!limits.whiteLabelReports) {
      return NextResponse.json({
        error: 'White-label reports are not available on your current plan',
        code: 'PLAN_LIMIT_EXCEEDED',
      }, { status: 403 });
    }

    // Recipients precedence: explicit body.recipients (the wizard's
    // step-3 input) wins over the saved reportConfig.recipients, since
    // the wizard's PUT to report-config is fire-and-forget and races
    // this POST. Without this preference the archive row would be
    // stamped with stale/empty recipients.
    const reportConfig = (site.toolSettings || {}).reportConfig || {};
    const recipients = Array.isArray(requestedRecipients)
      ? requestedRecipients.filter((r) => typeof r === 'string' && r.trim()).map((r) => r.trim())
      : Array.isArray(reportConfig.recipients) ? reportConfig.recipients : [];

    // Top-of-report month label is derived synchronously so the PENDING row
    // shows a meaningful "month" string in the list right away.
    const month = forceMonth
      || (currentMonthKey ? formatMonthLabel(currentMonthKey, locale) : getReportMonth(locale));

    // Build the report group id. The add-language flow passes an
    // existing group id so the new locale row joins the same group.
    // Otherwise we scan recent rows for one with the same comparison
    // (siteId + currentMonth + previousMonth) and reuse its group.
    //
    // We can't filter on `metadata` directly because the field is a
    // Json column in Mongo and Prisma's `is`/`equals` filters don't
    // accept arbitrary nested objects there - so we fetch a small
    // recent slice and match in JS instead.
    let reportGroupId = requestedGroupId || null;
    if (!reportGroupId) {
      const candidates = await prisma.reportArchive.findMany({
        where: {
          siteId,
          status: { not: 'PENDING' },
          reportGroupId: { not: null },
        },
        select: { reportGroupId: true, metadata: true },
        orderBy: { createdAt: 'desc' },
        take: 30,
      });
      const match = candidates.find((c) => {
        const md = c.metadata || {};
        return (md.currentMonth || null) === (currentMonthKey || null)
          && (md.previousMonth || null) === (previousMonthKey || null);
      });
      reportGroupId = match?.reportGroupId || null;
    }

    const archive = await prisma.reportArchive.create({
      data: {
        siteId,
        accountId: site.accountId,
        recipients,
        status: 'PENDING',
        month,
        locale,
        // null-default lets the DB auto-assign an ObjectId at insert
        // time (via @default(auto()) on a separate column would be
        // ideal, but here we set it explicitly when reusing a group).
        ...(reportGroupId ? { reportGroupId } : {}),
        metadata: {
          currentMonth: currentMonthKey || null,
          previousMonth: previousMonthKey || null,
        },
      },
    });

    // If we just created a fresh group (no sibling found), stamp the
    // new archive's own id as its group id so subsequent same-period
    // generations can join it. Done as a follow-up update so we don't
    // need to pre-mint an ObjectId.
    if (!reportGroupId) {
      await prisma.reportArchive.update({
        where: { id: archive.id },
        data: { reportGroupId: archive.id },
      });
      archive.reportGroupId = archive.id;
    }

    // Fire-and-forget: kick off the heavy pipeline. Errors inside are
    // caught and persisted to the archive's status/error fields by
    // runReportGeneration itself, so we don't need a top-level handler.
    runReportGeneration(archive.id, {
      siteId,
      accountId: member.accountId,
      userId: member.userId,
      locale,
      sectionsRequested: requestedSections,
      currentMonthKey,
      previousMonthKey,
      forceMonth,
    });

    return NextResponse.json({
      success: true,
      reportId: archive.id,
      reportGroupId: archive.reportGroupId,
      status: 'PENDING',
      month,
    });
  } catch (error) {
    console.error('[ReportGen] Error:', error);
    return NextResponse.json({
      error: 'Failed to start report generation',
      details: error.message,
    }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const { authorized, member } = await getCurrentAccountMember();
    if (!authorized || !member) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    if (!siteId) return NextResponse.json({ error: 'siteId is required' }, { status: 400 });

    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { accountId: true },
    });
    if (!site || site.accountId !== member.accountId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const reports = await prisma.reportArchive.findMany({
      where: { siteId },
      orderBy: { generatedAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({ reports });
  } catch (error) {
    console.error('[ReportGen] GET Error:', error);
    return NextResponse.json({ error: 'Failed to fetch reports' }, { status: 500 });
  }
}
