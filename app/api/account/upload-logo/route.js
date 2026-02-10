import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

// POST - Upload account logo
export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const accountId = formData.get('accountId');

    if (!accountId) {
      return NextResponse.json({ error: 'Account ID is required' }, { status: 400 });
    }

    // Verify user has permission to edit this account
    const membership = await prisma.accountMember.findFirst({
      where: {
        userId,
        accountId,
      },
      include: {
        role: {
          select: {
            permissions: true,
          },
        },
      },
    });

    // Also check if user is superadmin
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isSuperAdmin: true },
    });

    const isSuperAdmin = user?.isSuperAdmin;
    const hasEditPermission = membership?.role?.permissions?.includes('ACCOUNT_EDIT');

    if (!isSuperAdmin && !hasEditPermission) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'No image file provided' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type. Use JPG, PNG, GIF, or WebP.' }, { status: 400 });
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Maximum size is 5MB.' }, { status: 400 });
    }

    // For now, convert the image to base64 and store as a data URL
    // In production, upload to Cloudinary/S3 and store the URL
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString('base64');
    const mimeType = file.type;
    const dataUrl = `data:${mimeType};base64,${base64}`;

    // Update account with logo
    await prisma.account.update({
      where: { id: accountId },
      data: { logo: dataUrl },
    });

    return NextResponse.json({ logoUrl: dataUrl });
  } catch (error) {
    console.error('Error uploading account logo:', error);
    return NextResponse.json({ error: 'Failed to upload logo' }, { status: 500 });
  }
}

// DELETE - Remove account logo
export async function DELETE(request) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json({ error: 'Account ID is required' }, { status: 400 });
    }

    // Verify user has permission to edit this account
    const membership = await prisma.accountMember.findFirst({
      where: {
        userId,
        accountId,
      },
      include: {
        role: {
          select: {
            permissions: true,
          },
        },
      },
    });

    // Also check if user is superadmin
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isSuperAdmin: true },
    });

    const isSuperAdmin = user?.isSuperAdmin;
    const hasEditPermission = membership?.role?.permissions?.includes('ACCOUNT_EDIT');

    if (!isSuperAdmin && !hasEditPermission) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    await prisma.account.update({
      where: { id: accountId },
      data: { logo: null },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing account logo:', error);
    return NextResponse.json({ error: 'Failed to remove logo' }, { status: 500 });
  }
}
