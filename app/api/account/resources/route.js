import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAuth } from '@/lib/auth';
import { getAccountResourceLimits } from '@/lib/account-utils';

/**
 * GET /api/account/resources
 * Get current account's resource limits and usage
 */
export async function GET(request) {
  try {
    const user = await verifyAuth();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's current account (using lastSelectedAccountId or first membership)
    let accountId = user.lastSelectedAccountId;

    if (!accountId) {
      const membership = await prisma.accountMember.findFirst({
        where: {
          userId: user.id,
          status: 'ACTIVE',
        },
        select: { accountId: true },
      });
      accountId = membership?.accountId;
    }

    if (!accountId) {
      return NextResponse.json(
        { error: 'No account found' },
        { status: 404 }
      );
    }

    const resources = await getAccountResourceLimits(accountId);

    if (!resources.hasSubscription) {
      return NextResponse.json({
        hasSubscription: false,
        message: 'No active subscription',
      });
    }

    return NextResponse.json({
      hasSubscription: true,
      limits: resources.limits,
      usage: resources.usage,
      // Calculate remaining
      remaining: {
        members: resources.limits.maxMembers - resources.usage.members,
        sites: resources.limits.maxSites - resources.usage.sites,
        aiCredits: resources.usage.aiCreditsBalance,
      },
      // Add-on capacity
      addOnCapacity: {
        seats: {
          used: resources.usage.seatAddOnsCount,
          max: resources.limits.maxAddOnSeats, // null = unlimited
          canPurchaseMore: resources.limits.maxAddOnSeats === null || 
            resources.usage.seatAddOnsCount < resources.limits.maxAddOnSeats,
        },
        sites: {
          used: resources.usage.siteAddOnsCount,
          max: resources.limits.maxAddOnSites, // null = unlimited
          canPurchaseMore: resources.limits.maxAddOnSites === null || 
            resources.usage.siteAddOnsCount < resources.limits.maxAddOnSites,
        },
        aiCredits: {
          canPurchaseMore: true, // AI credits are always unlimited
        },
      },
    });
  } catch (error) {
    console.error('Error fetching account resources:', error);
    return NextResponse.json(
      { error: 'Failed to fetch account resources' },
      { status: 500 }
    );
  }
}
