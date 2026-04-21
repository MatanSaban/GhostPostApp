import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) return null;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isSuperAdmin: true,
        lastSelectedAccountId: true,
        accountMemberships: {
          select: {
            accountId: true,
            role: true,
            lastSelectedSiteId: true,
          },
        },
      },
    });
    return user;
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

// GET – List available backlink listings (marketplace)
export async function GET(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter') || 'available'; // available | purchased | myListings
    const search = searchParams.get('search') || '';
    const sort = searchParams.get('sort') || 'newest';
    const category = searchParams.get('category') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const accountId = searchParams.get('accountId') || null;

    // Verify user belongs to account (superadmins can browse without accountId)
    if (accountId) {
      const membership = user.accountMemberships.find(m => m.accountId === accountId);
      if (!membership && !user.isSuperAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    } else if (!user.isSuperAdmin) {
      return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
    }

    let where = { status: 'ACTIVE', isActive: true };
    let orderBy = { createdAt: 'desc' };

    if (filter === 'available') {
      where = {
        status: 'ACTIVE',
        isActive: true,
        // Exclude own listings (if user has an account)
        ...(accountId ? { NOT: { publisherAccountId: accountId } } : {}),
      };
    } else if (filter === 'purchased') {
      if (!accountId) {
        return NextResponse.json({ listings: [], total: 0, page, totalPages: 0 });
      }
      // Fetch purchases by this account and return listings
      const purchases = await prisma.backlinkPurchase.findMany({
        where: { buyerAccountId: accountId },
        include: {
          listing: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      });

      const totalPurchases = await prisma.backlinkPurchase.count({
        where: { buyerAccountId: accountId },
      });

      return NextResponse.json({
        listings: purchases.map(p => ({
          ...p.listing,
          purchase: {
            id: p.id,
            status: p.status,
            paymentMethod: p.paymentMethod,
            targetUrl: p.targetUrl,
            anchorText: p.anchorText,
            publishedUrl: p.publishedUrl,
            createdAt: p.createdAt,
          },
        })),
        total: totalPurchases,
        page,
        totalPages: Math.ceil(totalPurchases / limit),
      });
    } else if (filter === 'myListings') {
      // Show listings from ALL of this user's accounts (not just selected)
      const userAccountIds = user.accountMemberships.map(m => m.accountId);
      if (user.isSuperAdmin && userAccountIds.length === 0) {
        // Superadmin with no accounts - show all user listings
        where = { publisherType: 'USER' };
      } else {
        where = {
          publisherAccountId: { in: userAccountIds },
          publisherType: 'USER',
        };
      }
    }

    // Apply search
    if (search) {
      where.OR = [
        { domain: { contains: search, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Apply category filter
    if (category) {
      where.category = category;
    }

    // Apply sorting
    switch (sort) {
      case 'priceAsc':
        orderBy = { price: 'asc' };
        break;
      case 'priceDesc':
        orderBy = { price: 'desc' };
        break;
      case 'daHighest':
        orderBy = { domainAuthority: 'desc' };
        break;
      case 'drHighest':
        orderBy = { domainRating: 'desc' };
        break;
      default:
        orderBy = { createdAt: 'desc' };
    }

    const [listings, total] = await Promise.all([
      prisma.backlinkListing.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.backlinkListing.count({ where }),
    ]);

    return NextResponse.json({
      listings,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error fetching backlinks:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST – Create a new backlink listing (by a user selling from their site)
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      accountId,
      siteId,
      domain,
      title,
      description,
      category,
      language,
      linkType,
      turnaroundDays,
      sampleUrl,
      contentRequirements,
      price,
      currency,
      aiCreditsPrice,
      domainAuthority,
      domainRating,
      monthlyTraffic,
      maxSlots,
      publishMode,
    } = body;

    if (!accountId || !siteId || !domain || !title) {
      return NextResponse.json(
        { error: 'accountId, siteId, domain, and title are required' },
        { status: 400 }
      );
    }

    // Verify user belongs to account
    const membership = user.accountMemberships.find(m => m.accountId === accountId);
    if (!membership && !user.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Verify site belongs to account and is connected
    const site = await prisma.site.findFirst({
      where: { id: siteId, accountId, isActive: true },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found or not active' }, { status: 404 });
    }

    const listing = await prisma.backlinkListing.create({
      data: {
        publisherType: 'USER',
        publisherAccountId: accountId,
        publisherSiteId: siteId,
        domain,
        title,
        description,
        category,
        language: language || 'en',
        linkType: linkType || 'DOFOLLOW',
        turnaroundDays: turnaroundDays || 7,
        sampleUrl,
        contentRequirements,
        price: price != null ? parseFloat(price) : null,
        currency: currency || 'USD',
        aiCreditsPrice: aiCreditsPrice != null ? parseInt(aiCreditsPrice, 10) : null,
        domainAuthority: domainAuthority != null ? parseInt(domainAuthority, 10) : null,
        domainRating: domainRating != null ? parseInt(domainRating, 10) : null,
        monthlyTraffic: monthlyTraffic != null ? parseInt(monthlyTraffic, 10) : null,
        maxSlots: maxSlots != null ? parseInt(maxSlots, 10) : null,
        publishMode: publishMode === 'auto' ? 'auto' : 'manual',
        status: 'ACTIVE',
      },
    });

    return NextResponse.json({ listing }, { status: 201 });
  } catch (error) {
    console.error('Error creating backlink listing:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
