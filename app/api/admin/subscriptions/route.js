import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

// Verify super admin access
async function verifySuperAdmin() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isSuperAdmin: true },
    });

    if (!user || !user.isSuperAdmin) {
      return null;
    }

    return user;
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

export async function GET(request) {
  try {
    // Verify super admin access
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Fetch all subscriptions with relations
    const subscriptions = await prisma.subscription.findMany({
      include: {
        account: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        plan: {
          select: {
            id: true,
            name: true,
            price: true,
            interval: true,
            translations: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Format the response
    const formattedSubscriptions = subscriptions.map((sub) => {
      // Format plan translations as object keyed by language
      const planTranslations = {};
      if (sub.plan.translations) {
        sub.plan.translations.forEach(t => {
          planTranslations[t.language] = {
            name: t.name,
            description: t.description,
            features: t.features,
          };
        });
      }
      
      return {
        id: sub.id,
        account: {
          name: sub.account.name,
          slug: sub.account.slug,
        },
        plan: {
          name: sub.plan.name,
          price: sub.plan.price,
          translations: planTranslations,
        },
        status: sub.status.toLowerCase(),
        billingCycle: sub.plan.interval.toLowerCase(),
        currentPeriodStart: sub.currentPeriodStart.toISOString(),
        currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        canceledAt: sub.canceledAt?.toISOString() || null,
        createdAt: sub.createdAt.toISOString(),
      };
    });

    // Calculate MRR and stats
    const activeSubscriptions = subscriptions.filter(
      (s) => s.status === 'ACTIVE' || s.status === 'TRIALING'
    );

    const mrr = activeSubscriptions.reduce((sum, s) => {
      if (s.plan.interval === 'YEARLY') {
        return sum + s.plan.price / 12;
      }
      return sum + s.plan.price;
    }, 0);

    const stats = {
      total: subscriptions.length,
      active: subscriptions.filter((s) => s.status === 'ACTIVE').length,
      trialing: subscriptions.filter((s) => s.status === 'TRIALING').length,
      canceled: subscriptions.filter((s) => s.status === 'CANCELED').length,
      pastDue: subscriptions.filter((s) => s.status === 'PAST_DUE').length,
      mrr,
      arr: mrr * 12,
    };

    return NextResponse.json({
      subscriptions: formattedSubscriptions,
      stats,
    });
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch subscriptions' },
      { status: 500 }
    );
  }
}
