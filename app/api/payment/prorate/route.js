import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import {
  calculateNewSubscriptionProration,
  calculatePlanChangeProration,
} from '@/lib/proration';

const SESSION_COOKIE = 'user_session';

async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) return null;
    return await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
  } catch {
    return null;
  }
}

/**
 * POST /api/payment/prorate
 * 
 * Calculate prorated amount for a plan change.
 * 
 * Body:
 *  - newPlanId: string (required)
 */
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { newPlanId, lang } = body;
    const language = (lang || 'en').toUpperCase();

    if (!newPlanId) {
      return NextResponse.json({ error: 'New plan ID is required' }, { status: 400 });
    }

    // Helper: resolve translated plan name
    const getTranslatedName = (plan) => {
      const t = plan.translations?.find(t => t.language === language)
        || plan.translations?.find(t => t.language === 'HE')
        || null;
      return t?.name || plan.name;
    };

    // Get the new plan with translations
    const newPlan = await prisma.plan.findUnique({
      where: { id: newPlanId },
      include: { translations: true },
    });
    if (!newPlan || !newPlan.isActive) {
      return NextResponse.json({ error: 'Plan not found or inactive' }, { status: 404 });
    }

    // Get user's current account & subscription
    const membership = await prisma.accountMember.findFirst({
      where: { userId: user.id, status: 'ACTIVE' },
      include: {
        account: {
          include: {
            subscription: {
              include: {
                plan: {
                  include: { translations: true },
                },
              },
            },
          },
        },
      },
    });

    if (!membership?.account) {
      return NextResponse.json({ error: 'No active account' }, { status: 400 });
    }

    const subscription = membership.account.subscription;
    const now = new Date();

    // CASE 1: No existing subscription (new subscription)
    if (!subscription || !subscription.plan) {
      const proration = calculateNewSubscriptionProration(newPlan.price, now);
      return NextResponse.json({
        type: 'new',
        ...proration,
        newPlanName: getTranslatedName(newPlan),
        newPlanSlug: newPlan.slug,
        currency: newPlan.currency,
      });
    }

    // CASE 2: Existing subscription - plan change (upgrade or downgrade)
    const currentPlan = subscription.plan;

    if (currentPlan.id === newPlan.id) {
      return NextResponse.json({ error: 'Already on this plan' }, { status: 400 });
    }

    const proration = calculatePlanChangeProration(
      currentPlan.price,
      newPlan.price,
      now
    );

    return NextResponse.json({
      type: proration.isUpgrade ? 'upgrade' : 'downgrade',
      ...proration,
      currentPlanName: getTranslatedName(currentPlan),
      currentPlanSlug: currentPlan.slug,
      newPlanName: getTranslatedName(newPlan),
      newPlanSlug: newPlan.slug,
      currency: newPlan.currency,
    });
  } catch (error) {
    console.error('Proration calculation error:', error);
    return NextResponse.json(
      { error: 'Failed to calculate proration' },
      { status: 500 }
    );
  }
}
