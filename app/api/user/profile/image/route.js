import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

// POST - Upload profile image
// Note: This is a placeholder. In production, you'd want to:
// 1. Use Cloudinary, S3, or similar for file storage
// 2. Process and resize the image
// 3. Store the URL in the database
export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('image');

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

    // For now, we'll convert the image to base64 and store as a data URL
    // In production, upload to Cloudinary/S3 and store the URL
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString('base64');
    const mimeType = file.type;
    const dataUrl = `data:${mimeType};base64,${base64}`;

    // Update user with image
    await prisma.user.update({
      where: { id: userId },
      data: { image: dataUrl },
    });

    return NextResponse.json({ imageUrl: dataUrl });
  } catch (error) {
    console.error('Error uploading profile image:', error);
    return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
  }
}

// DELETE - Remove profile image
export async function DELETE() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { image: null },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing profile image:', error);
    return NextResponse.json({ error: 'Failed to remove image' }, { status: 500 });
  }
}
