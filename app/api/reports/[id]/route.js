import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember } from '@/lib/auth-permissions';
import { hasPermission, CAPABILITIES } from '@/lib/permissions';
import { v2 as cloudinary } from 'cloudinary';

// Statuses the user is allowed to set manually via PATCH. PENDING is owned
// by the generation pipeline, never by the user.
const USER_SETTABLE_STATUSES = new Set(['DRAFT', 'SENT', 'ERROR']);

// ─── Cloudinary Config ───────────────────────────────────────────────────────
function ensureCloudinaryConfig() {
  const cUrl = process.env.CLOUDINARY_URL;
  if (cUrl) {
    const match = cUrl.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/);
    if (match) {
      cloudinary.config({ cloud_name: match[3], api_key: match[1], api_secret: match[2], secure: true });
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

/**
 * GET /api/reports/[id]
 *
 * Returns a single report — used by the wizard's background polling to
 * watch a PENDING report flip to DRAFT/ERROR.
 */
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

    return NextResponse.json({ report });
  } catch (error) {
    console.error('[ReportGet] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch report' }, { status: 500 });
  }
}

/**
 * PATCH /api/reports/[id]
 *
 * Body: { aiSummary?: string, status?: 'DRAFT' | 'SENT' | 'ERROR', recipients?: string[] }
 *
 * Used for the in-platform preview (edit AI summary) and the manual status
 * change in the reports table. PENDING is reserved for the pipeline; trying
 * to set it via PATCH is rejected.
 */
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const { authorized, member } = await getCurrentAccountMember();
    if (!authorized || !member) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasPermission(member, 'REPORTS', CAPABILITIES.MANAGE)) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const update = {};

    if (typeof body.aiSummary === 'string') {
      update.aiSummary = body.aiSummary;
    }
    if (typeof body.status === 'string') {
      if (!USER_SETTABLE_STATUSES.has(body.status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      update.status = body.status;
      // SENT manually flipped should record sentAt; flipping back to DRAFT
      // clears it so future automated sends re-stamp.
      if (body.status === 'SENT') update.sentAt = new Date();
      if (body.status === 'DRAFT') update.sentAt = null;
    }
    if (Array.isArray(body.recipients)) {
      update.recipients = body.recipients.filter((r) => typeof r === 'string' && r.trim());
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const existing = await prisma.reportArchive.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    if (existing.accountId !== member.accountId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    if (existing.status === 'PENDING' && update.status) {
      return NextResponse.json({ error: 'Cannot change status while report is generating' }, { status: 409 });
    }

    const report = await prisma.reportArchive.update({
      where: { id },
      data: update,
    });
    return NextResponse.json({ report });
  } catch (error) {
    console.error('[ReportPatch] Error:', error);
    return NextResponse.json({ error: 'Failed to update report' }, { status: 500 });
  }
}

/**
 * DELETE /api/reports/[id]
 *
 * Deletes a report from the database and optionally from Cloudinary
 */
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;

    // ─── Auth ─────────────────────────────────────────────────────────────────
    const { authorized, member } = await getCurrentAccountMember();
    if (!authorized || !member) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    if (!hasPermission(member, 'REPORTS', CAPABILITIES.DELETE)) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // ─── Find Report ──────────────────────────────────────────────────────────
    const report = await prisma.reportArchive.findUnique({
      where: { id },
    });

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    // Verify account access
    if (report.accountId !== member.accountId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // ─── Delete from Cloudinary (optional) ────────────────────────────────────
    if (report.pdfUrl) {
      try {
        ensureCloudinaryConfig();
        // Extract public_id from URL
        // URL format: https://res.cloudinary.com/{cloud}/raw/upload/v{version}/{folder}/{public_id}.pdf
        const urlParts = report.pdfUrl.split('/');
        const filename = urlParts[urlParts.length - 1]; // e.g., "report-name.pdf"
        const folder = urlParts[urlParts.length - 2]; // e.g., account folder
        const publicId = `${folder}/${filename.replace('.pdf', '')}`;
        
        await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
      } catch (cloudinaryError) {
        // Log but don't fail if Cloudinary deletion fails
        console.warn('[ReportDelete] Failed to delete from Cloudinary:', cloudinaryError.message);
      }
    }

    // ─── Delete from Database ─────────────────────────────────────────────────
    await prisma.reportArchive.delete({
      where: { id },
    });

    console.log(`[ReportDelete] Deleted report ${id}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[ReportDelete] Error:', error);
    return NextResponse.json({ error: 'Failed to delete report' }, { status: 500 });
  }
}
