/**
 * Report Regenerate API
 *
 * POST /api/reports/[id]/regenerate
 *
 * Re-renders the PDF for an existing report using the persisted snapshot
 * (sectionsConfig + sectionData + audit details) plus the most recent
 * aiSummary on the archive. This is what the preview modal calls after
 * the user edits the AI summary so the downloadable PDF stays in sync
 * with what the user saw in the in-platform preview.
 *
 * The archive is moved to PENDING while the regenerate runs, then back to
 * DRAFT (or ERROR) by runReportGeneration.
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember } from '@/lib/auth-permissions';
import { hasPermission, CAPABILITIES } from '@/lib/permissions';
import { runReportGeneration } from '@/lib/reports/run-generation';

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const { authorized, member } = await getCurrentAccountMember();
    if (!authorized || !member) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasPermission(member, 'REPORTS', CAPABILITIES.MANAGE)) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const existing = await prisma.reportArchive.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    if (existing.accountId !== member.accountId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    if (existing.status === 'PENDING') {
      return NextResponse.json({ error: 'Report is already regenerating' }, { status: 409 });
    }
    if (!existing.sectionData) {
      return NextResponse.json({ error: 'This report has no snapshot to regenerate from' }, { status: 400 });
    }

    // Move to PENDING and kick off the regenerate fire-and-forget.
    await prisma.reportArchive.update({
      where: { id },
      data: { status: 'PENDING', error: null },
    });

    runReportGeneration(id, {
      siteId: existing.siteId,
      accountId: existing.accountId,
      userId: member.userId,
      locale: existing.locale || 'en',
      currentMonthKey: existing.metadata?.currentMonth || null,
      previousMonthKey: existing.metadata?.previousMonth || null,
      forceMonth: existing.month,
      // Reuse the persisted snapshot - only the PDF render layer runs again.
      // Pulling the latest aiSummary from the archive captures any user
      // edits made since the last render.
      snapshot: {
        sectionsOrdered: Array.isArray(existing.sectionsConfig?.sections)
          ? existing.sectionsConfig.sections.map((s) => s.id).filter(Boolean)
          : [],
        sectionData: existing.sectionData?.sectionData || existing.sectionData,
        aiSummary: existing.aiSummary,
        currentAudit: existing.sectionData?.currentAudit ?? null,
        previousAudit: existing.sectionData?.previousAudit ?? null,
        executedActions: existing.sectionData?.executedActions || [],
      },
    });

    return NextResponse.json({ success: true, status: 'PENDING' });
  } catch (error) {
    console.error('[ReportRegenerate] Error:', error);
    return NextResponse.json({ error: 'Failed to regenerate report' }, { status: 500 });
  }
}
