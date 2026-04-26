/**
 * Report Preview API
 *
 * GET /api/reports/[id]/preview
 *
 * Returns the structured data + persisted snapshot used to render the
 * report PDF. The dashboard preview modal renders this as HTML so the
 * user can review the report (and edit the AI summary) without first
 * downloading the PDF.
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember } from '@/lib/auth-permissions';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const { authorized, member } = await getCurrentAccountMember();
    if (!authorized || !member) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const report = await prisma.reportArchive.findUnique({ where: { id } });
    if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    if (report.accountId !== member.accountId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // The preview modal also needs the agency branding (logo, color, name)
    // and the underlying site (name, url) to render the report header.
    const [account, site] = await Promise.all([
      prisma.account.findUnique({
        where: { id: report.accountId },
        select: { name: true, website: true, generalEmail: true, whiteLabelConfig: true },
      }),
      prisma.site.findUnique({
        where: { id: report.siteId },
        // Include the site's own logo + favicon so the preview can
        // render the client's branding alongside the agency's.
        select: { name: true, url: true, logo: true, favicon: true },
      }),
    ]);

    const wlc = account?.whiteLabelConfig || {};
    const branding = {
      agencyName: account?.name || '',
      logoUrl: wlc.agencyLogo || null,
      primaryColor: wlc.accentColor || '#7b2cbf',
      // Contact info shown under the agency logo in the report header.
      // Prefer white-label-config overrides (so an agency can use a
      // different reply-to address per report), fall back to the
      // account-level fields the user manages in settings.
      contactEmail: wlc.replyToEmail || account?.generalEmail || null,
      contactWebsite: wlc.website || account?.website || null,
      contactPhone: wlc.phone || null,
    };

    return NextResponse.json({
      report: {
        id: report.id,
        siteId: report.siteId,
        accountId: report.accountId,
        status: report.status,
        month: report.month,
        locale: report.locale || 'en',
        pdfUrl: report.pdfUrl,
        aiSummary: report.aiSummary,
        recipients: report.recipients,
        sectionsConfig: report.sectionsConfig,
        sectionData: report.sectionData,
        metadata: report.metadata,
        generatedAt: report.generatedAt,
        sentAt: report.sentAt,
        error: report.error,
      },
      branding,
      site,
    });
  } catch (error) {
    console.error('[ReportPreview] Error:', error);
    return NextResponse.json({ error: 'Failed to load report preview' }, { status: 500 });
  }
}
