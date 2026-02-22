import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

async function verifySuperAdmin() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) return null;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isSuperAdmin: true },
    });

    if (!user || !user.isSuperAdmin) return null;
    return user;
  } catch {
    return null;
  }
}

// GET – List all purchases
export async function GET(request) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'all';
    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '25', 10);

    const where = {};
    if (status !== 'all') {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { targetUrl: { contains: search, mode: 'insensitive' } },
        { anchorText: { contains: search, mode: 'insensitive' } },
        { listing: { domain: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [purchases, total] = await Promise.all([
      prisma.backlinkPurchase.findMany({
        where,
        include: {
          listing: {
            select: { domain: true, title: true, linkType: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.backlinkPurchase.count({ where }),
    ]);

    return NextResponse.json({
      purchases,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Admin backlink purchases GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT – Update purchase status
export async function PUT(request) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { purchaseId, status, publishedUrl, rejectedReason } = body;

    if (!purchaseId || !status) {
      return NextResponse.json({ error: 'purchaseId and status are required' }, { status: 400 });
    }

    const data = { status };
    if (status === 'PUBLISHED' && publishedUrl) {
      data.publishedUrl = publishedUrl;
      data.publishedAt = new Date();
    }
    if (status === 'REJECTED' && rejectedReason) {
      data.rejectedReason = rejectedReason;
    }

    const purchase = await prisma.backlinkPurchase.update({
      where: { id: purchaseId },
      data,
    });

    return NextResponse.json({ purchase });
  } catch (error) {
    console.error('Admin backlink purchases PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
