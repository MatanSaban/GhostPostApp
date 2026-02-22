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

// GET – List all backlink listings with stats
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

    // Build filter
    const where = {};
    if (status !== 'all') {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { domain: { contains: search, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [listings, total] = await Promise.all([
      prisma.backlinkListing.findMany({
        where,
        include: {
          purchases: {
            select: { id: true, status: true, paymentMethod: true, amountPaid: true, creditsPaid: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.backlinkListing.count({ where }),
    ]);

    // Stats
    const [totalListings, activeListings, totalPurchases, pendingPurchases] = await Promise.all([
      prisma.backlinkListing.count(),
      prisma.backlinkListing.count({ where: { status: 'ACTIVE', isActive: true } }),
      prisma.backlinkPurchase.count(),
      prisma.backlinkPurchase.count({ where: { status: 'PENDING' } }),
    ]);

    // Calculate total revenue from direct purchases
    const directPurchases = await prisma.backlinkPurchase.findMany({
      where: { paymentMethod: 'DIRECT', status: { in: ['APPROVED', 'PUBLISHED'] } },
      select: { amountPaid: true },
    });
    const totalRevenue = directPurchases.reduce((sum, p) => sum + (p.amountPaid || 0), 0);

    return NextResponse.json({
      listings,
      total,
      totalPages: Math.ceil(total / limit),
      stats: {
        totalListings,
        activeListings,
        totalPurchases,
        pendingPurchases,
        totalRevenue,
      },
    });
  } catch (error) {
    console.error('Admin backlinks GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST – Create a new backlink listing
export async function POST(request) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      domain,
      title,
      description,
      category,
      language,
      linkType,
      domainAuthority,
      domainRating,
      monthlyTraffic,
      price,
      aiCreditsPrice,
      maxSlots,
      turnaroundDays,
      sampleUrl,
      contentRequirements,
      publisherType,
      status,
      isActive,
    } = body;

    if (!domain || !title) {
      return NextResponse.json({ error: 'Domain and title are required' }, { status: 400 });
    }

    const listing = await prisma.backlinkListing.create({
      data: {
        domain,
        title,
        description: description || null,
        category: category || null,
        language: language || 'en',
        linkType: linkType || 'DOFOLLOW',
        domainAuthority: domainAuthority != null ? parseInt(domainAuthority, 10) : null,
        domainRating: domainRating != null ? parseInt(domainRating, 10) : null,
        monthlyTraffic: monthlyTraffic != null ? parseInt(monthlyTraffic, 10) : null,
        price: price != null ? parseFloat(price) : null,
        aiCreditsPrice: aiCreditsPrice != null ? parseInt(aiCreditsPrice, 10) : null,
        maxSlots: maxSlots != null && maxSlots !== '' ? parseInt(maxSlots, 10) : null,
        turnaroundDays: turnaroundDays != null ? parseInt(turnaroundDays, 10) : 7,
        sampleUrl: sampleUrl || null,
        contentRequirements: contentRequirements || null,
        publisherType: publisherType || 'PLATFORM',
        status: status || 'ACTIVE',
        isActive: isActive !== false,
      },
    });

    return NextResponse.json({ listing }, { status: 201 });
  } catch (error) {
    console.error('Admin backlinks POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
