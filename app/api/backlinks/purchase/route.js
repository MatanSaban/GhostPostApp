import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { getLimitFromPlan } from '@/lib/account-utils';

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
        isSuperAdmin: true,
        lastSelectedAccountId: true,
        accountMemberships: {
          select: { accountId: true, role: true },
        },
      },
    });
    return user;
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

// POST – Purchase a backlink
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      accountId,
      siteId,      // buyer's target site
      listingId,
      paymentMethod, // PLAN_ALLOCATION | DIRECT | AI_CREDITS
      targetUrl,
      anchorText,
    } = body;

    if (!accountId || !siteId || !listingId || !paymentMethod || !targetUrl) {
      return NextResponse.json(
        { error: 'accountId, siteId, listingId, paymentMethod, and targetUrl are required' },
        { status: 400 }
      );
    }

    // Verify user belongs to account
    const membership = user.accountMemberships.find(m => m.accountId === accountId);
    if (!membership && !user.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get the listing
    const listing = await prisma.backlinkListing.findUnique({
      where: { id: listingId },
    });

    if (!listing || !listing.isActive || listing.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Listing not available' }, { status: 404 });
    }

    // Check sold out
    if (listing.maxSlots && listing.soldCount >= listing.maxSlots) {
      return NextResponse.json({ error: 'Listing is sold out' }, { status: 400 });
    }

    // Prevent buying own listings
    if (listing.publisherAccountId === accountId) {
      return NextResponse.json({ error: 'Cannot purchase your own listing' }, { status: 400 });
    }

    let amountPaid = null;
    let creditsPaid = null;

    // Validate payment method
    if (paymentMethod === 'PLAN_ALLOCATION') {
      // Check plan has backlinks allocation
      const account = await prisma.account.findUnique({
        where: { id: accountId },
        include: {
          subscription: {
            include: { plan: true },
          },
        },
      });

      if (!account?.subscription?.plan) {
        return NextResponse.json({ error: 'No active subscription' }, { status: 400 });
      }

      const backlinkLimit = getLimitFromPlan(account.subscription.plan, 'backlinks');
      if (!backlinkLimit || backlinkLimit <= 0) {
        return NextResponse.json({ error: 'Plan does not include backlinks' }, { status: 400 });
      }

      // Count backlinks used this billing period
      const periodStart = account.subscription.currentPeriodStart;
      const usedThisPeriod = await prisma.backlinkPurchase.count({
        where: {
          buyerAccountId: accountId,
          paymentMethod: 'PLAN_ALLOCATION',
          createdAt: { gte: periodStart },
          status: { not: 'CANCELED' },
        },
      });

      if (usedThisPeriod >= backlinkLimit) {
        return NextResponse.json({ error: 'Monthly backlink allocation exhausted' }, { status: 400 });
      }

    } else if (paymentMethod === 'DIRECT') {
      if (!listing.price) {
        return NextResponse.json({ error: 'Direct purchase not available for this listing' }, { status: 400 });
      }
      amountPaid = listing.price;

    } else if (paymentMethod === 'AI_CREDITS') {
      if (!listing.aiCreditsPrice) {
        return NextResponse.json({ error: 'AI credits purchase not available for this listing' }, { status: 400 });
      }

      // Check buyer has enough credits
      const buyerAccount = await prisma.account.findUnique({
        where: { id: accountId },
        select: { aiCreditsBalance: true },
      });

      if (!buyerAccount || buyerAccount.aiCreditsBalance < listing.aiCreditsPrice) {
        return NextResponse.json({ error: 'Insufficient AI credits' }, { status: 400 });
      }

      creditsPaid = listing.aiCreditsPrice;

      // Debit buyer's credits
      await prisma.account.update({
        where: { id: accountId },
        data: {
          aiCreditsBalance: { decrement: listing.aiCreditsPrice },
          aiCreditsUsedTotal: { increment: listing.aiCreditsPrice },
        },
      });

      // Log buyer debit
      const updatedBuyer = await prisma.account.findUnique({
        where: { id: accountId },
        select: { aiCreditsBalance: true },
      });

      await prisma.aiCreditsLog.create({
        data: {
          accountId,
          userId: user.id,
          siteId,
          type: 'DEBIT',
          amount: listing.aiCreditsPrice,
          balance: updatedBuyer.aiCreditsBalance,
          source: 'backlink_purchase',
          sourceId: listingId,
          description: `Backlink purchase: ${listing.domain}`,
        },
      });

      // Credit seller's account (if user listing)
      if (listing.publisherAccountId) {
        await prisma.account.update({
          where: { id: listing.publisherAccountId },
          data: {
            aiCreditsBalance: { increment: listing.aiCreditsPrice },
          },
        });

        const updatedSeller = await prisma.account.findUnique({
          where: { id: listing.publisherAccountId },
          select: { aiCreditsBalance: true },
        });

        await prisma.aiCreditsLog.create({
          data: {
            accountId: listing.publisherAccountId,
            type: 'CREDIT',
            amount: listing.aiCreditsPrice,
            balance: updatedSeller.aiCreditsBalance,
            source: 'backlink_sale',
            sourceId: listingId,
            description: `Backlink sale: ${listing.domain} → ${targetUrl}`,
          },
        });
      }

    } else {
      return NextResponse.json({ error: 'Invalid payment method' }, { status: 400 });
    }

    // Create the purchase
    const purchase = await prisma.backlinkPurchase.create({
      data: {
        buyerAccountId: accountId,
        buyerSiteId: siteId,
        listingId,
        paymentMethod,
        amountPaid,
        currency: listing.currency,
        creditsPaid,
        targetUrl,
        anchorText,
        status: 'PENDING',
      },
    });

    // Increment sold count
    await prisma.backlinkListing.update({
      where: { id: listingId },
      data: {
        soldCount: { increment: 1 },
        // Auto mark as sold out if reached limit
        ...(listing.maxSlots && listing.soldCount + 1 >= listing.maxSlots
          ? { status: 'SOLD_OUT' }
          : {}),
      },
    });

    return NextResponse.json({ purchase }, { status: 201 });
  } catch (error) {
    console.error('Error purchasing backlink:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
