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

// PUT – Update a backlink listing
export async function PUT(request, { params }) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
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

    const listing = await prisma.backlinkListing.update({
      where: { id },
      data: {
        ...(domain !== undefined && { domain }),
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description: description || null }),
        ...(category !== undefined && { category: category || null }),
        ...(language !== undefined && { language: language || 'en' }),
        ...(linkType !== undefined && { linkType }),
        ...(domainAuthority !== undefined && { domainAuthority: domainAuthority != null ? parseInt(domainAuthority, 10) : null }),
        ...(domainRating !== undefined && { domainRating: domainRating != null ? parseInt(domainRating, 10) : null }),
        ...(monthlyTraffic !== undefined && { monthlyTraffic: monthlyTraffic != null ? parseInt(monthlyTraffic, 10) : null }),
        ...(price !== undefined && { price: price != null ? parseFloat(price) : null }),
        ...(aiCreditsPrice !== undefined && { aiCreditsPrice: aiCreditsPrice != null ? parseInt(aiCreditsPrice, 10) : null }),
        ...(maxSlots !== undefined && { maxSlots: maxSlots != null && maxSlots !== '' ? parseInt(maxSlots, 10) : null }),
        ...(turnaroundDays !== undefined && { turnaroundDays: turnaroundDays != null ? parseInt(turnaroundDays, 10) : 7 }),
        ...(sampleUrl !== undefined && { sampleUrl: sampleUrl || null }),
        ...(contentRequirements !== undefined && { contentRequirements: contentRequirements || null }),
        ...(publisherType !== undefined && { publisherType }),
        ...(status !== undefined && { status }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    return NextResponse.json({ listing });
  } catch (error) {
    console.error('Admin backlinks PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE – Delete a backlink listing
export async function DELETE(request, { params }) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Check for existing purchases
    const purchaseCount = await prisma.backlinkPurchase.count({
      where: { listingId: id },
    });

    if (purchaseCount > 0) {
      // Archive instead of deleting if there are purchases
      const listing = await prisma.backlinkListing.update({
        where: { id },
        data: { status: 'ARCHIVED', isActive: false },
      });
      return NextResponse.json({ listing, archived: true });
    }

    await prisma.backlinkListing.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Admin backlinks DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
