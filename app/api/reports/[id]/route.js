import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember } from '@/lib/auth-permissions';
import { hasPermission, CAPABILITIES } from '@/lib/permissions';
import { v2 as cloudinary } from 'cloudinary';

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
