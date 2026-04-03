import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

// POST - Upload account asset (logo, etc.)
export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get user's active account
    const membership = await prisma.accountMember.findFirst({
      where: { userId, status: 'ACTIVE' },
      include: {
        account: true,
        role: {
          select: { permissions: true },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    if (!membership?.account) {
      return NextResponse.json({ error: 'No account found' }, { status: 404 });
    }

    // Check permissions
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isSuperAdmin: true },
    });

    const isSuperAdmin = user?.isSuperAdmin;
    const hasEditPermission = membership.role?.permissions?.includes('ACCOUNT_EDIT') || 
                               membership.role?.permissions?.includes('REPORTS_MANAGE');

    if (!isSuperAdmin && !hasEditPermission) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const assetType = formData.get('type') || 'generic';

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type. Use JPG, PNG, GIF, WebP, or SVG.' }, { status: 400 });
    }

    // Validate file size (max 2MB for assets)
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Maximum size is 2MB.' }, { status: 400 });
    }

    // Convert to base64 data URL
    // In production, upload to Cloudinary/S3 instead
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString('base64');
    const mimeType = file.type;
    const dataUrl = `data:${mimeType};base64,${base64}`;

    return NextResponse.json({ 
      success: true,
      url: dataUrl,
      type: assetType,
    });
  } catch (error) {
    console.error('Error uploading asset:', error);
    return NextResponse.json({ error: 'Failed to upload asset' }, { status: 500 });
  }
}
