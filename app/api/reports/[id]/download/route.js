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
 * Extract public_id from Cloudinary URL
 */
function extractPublicId(url) {
  // URL format: https://res.cloudinary.com/{cloud}/raw/upload/v{version}/{folder}/{filename}.pdf
  const match = url.match(/\/raw\/upload\/v\d+\/(.+)$/);
  if (match) {
    // Remove .pdf extension and decode URI components (for Hebrew chars etc)
    const publicId = decodeURIComponent(match[1].replace(/\.pdf$/, ''));
    return publicId;
  }
  return null;
}

/**
 * GET /api/reports/[id]/download
 * 
 * Proxy download endpoint - generates signed URL and fetches PDF from Cloudinary
 */
export async function GET(request, { params }) {
  try {
    const { id } = await params;

    // ─── Auth ─────────────────────────────────────────────────────────────────
    const { authorized, member } = await getCurrentAccountMember();
    if (!authorized || !member) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    if (!hasPermission(member, 'REPORTS', CAPABILITIES.VIEW)) {
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

    if (!report.pdfUrl) {
      return NextResponse.json({ error: 'PDF not available' }, { status: 404 });
    }

    // ─── Generate Signed URL and Fetch PDF ────────────────────────────────────
    ensureCloudinaryConfig();
    
    const publicId = extractPublicId(report.pdfUrl);
    if (!publicId) {
      console.error('[ReportDownload] Could not extract public_id from URL:', report.pdfUrl);
      return NextResponse.json({ error: 'Invalid PDF URL' }, { status: 500 });
    }

    console.log('[ReportDownload] Public ID:', publicId);
    console.log('[ReportDownload] Original URL:', report.pdfUrl);

    // Try multiple approaches to fetch the PDF
    let pdfResponse;
    const config = cloudinary.config();

    // Approach 1: Signed URL using cloudinary.url
    const signedUrl = cloudinary.url(publicId, {
      resource_type: 'raw',
      type: 'upload',
      format: 'pdf',
      sign_url: true,
      secure: true,
    });

    console.log('[ReportDownload] Trying signed URL:', signedUrl);
    pdfResponse = await fetch(signedUrl);
    console.log('[ReportDownload] Signed URL response:', pdfResponse.status);

    // Approach 2: Try with attachment flag
    if (!pdfResponse.ok) {
      const attachmentUrl = cloudinary.url(publicId, {
        resource_type: 'raw',
        type: 'upload', 
        format: 'pdf',
        sign_url: true,
        secure: true,
        flags: 'attachment',
      });
      console.log('[ReportDownload] Trying attachment URL:', attachmentUrl);
      pdfResponse = await fetch(attachmentUrl);
      console.log('[ReportDownload] Attachment URL response:', pdfResponse.status);
    }

    // Approach 3: Direct URL (in case restrictions were removed or file is public)
    if (!pdfResponse.ok) {
      console.log('[ReportDownload] Trying direct URL...');
      pdfResponse = await fetch(report.pdfUrl);
      console.log('[ReportDownload] Direct URL response:', pdfResponse.status);
    }

    if (!pdfResponse.ok) {
      console.error(`[ReportDownload] All fetch attempts failed. Last status: ${pdfResponse.status}`);
      // Provide more helpful error message
      return NextResponse.json({ 
        error: 'Failed to fetch PDF. Please check Cloudinary security settings or regenerate the report.',
        hint: 'Ensure "Require signed URLs for public resources" is disabled for raw files in Cloudinary dashboard.',
      }, { status: 502 });
    }

    const pdfBuffer = await pdfResponse.arrayBuffer();

    // Generate filename - use ASCII-safe version for header, with UTF-8 encoded version as fallback
    const dateStr = new Date(report.createdAt).toISOString().slice(0, 7); // YYYY-MM format
    const asciiFilename = `report-${dateStr}.pdf`;
    const utf8Filename = `report-${report.month.replace(/\s/g, '-')}.pdf`;
    const encodedFilename = encodeURIComponent(utf8Filename);

    // ─── Return PDF ───────────────────────────────────────────────────────────
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`,
        'Content-Length': pdfBuffer.byteLength.toString(),
      },
    });
  } catch (error) {
    console.error('[ReportDownload] Error:', error);
    return NextResponse.json({ error: 'Failed to download report' }, { status: 500 });
  }
}
