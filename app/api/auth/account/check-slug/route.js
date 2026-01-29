import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request) {
  try {
    const body = await request.json();
    const { slug } = body;

    if (!slug) {
      return NextResponse.json(
        { error: 'Slug is required' },
        { status: 400 }
      );
    }

    // Validate slug format (lowercase letters, numbers, hyphens only)
    const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    if (!slugRegex.test(slug)) {
      return NextResponse.json({
        available: false,
        error: 'Slug must contain only lowercase letters, numbers, and hyphens',
      });
    }

    // Check minimum length
    if (slug.length < 3) {
      return NextResponse.json({
        available: false,
        error: 'Slug must be at least 3 characters long',
      });
    }

    // Check maximum length
    if (slug.length > 50) {
      return NextResponse.json({
        available: false,
        error: 'Slug must be at most 50 characters long',
      });
    }

    // Check if slug is already taken
    const existingAccount = await prisma.account.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (existingAccount) {
      return NextResponse.json({
        available: false,
        error: 'This slug is already taken',
      });
    }

    return NextResponse.json({
      available: true,
    });
  } catch (error) {
    console.error('Check slug error:', error);
    return NextResponse.json(
      { error: 'Failed to check slug availability' },
      { status: 500 }
    );
  }
}
