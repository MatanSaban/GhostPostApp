import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/prisma";

const SESSION_COOKIE = "user_session";

// GET - Get current user's data including account and subscription
export async function GET() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isSuperAdmin: true,
        isActive: true,
        registrationStep: true,
        image: true,
        lastSelectedAccountId: true,
        accountMemberships: {
          where: { status: "ACTIVE" },
          select: {
            accountId: true,
            isOwner: true,
            role: true,
            account: {
              select: {
                id: true,
                name: true,
                aiCreditsBalance: true,
                subscription: {
                  select: {
                    id: true,
                    status: true,
                    currentPeriodStart: true,
                    currentPeriodEnd: true,
                    cancelAtPeriodEnd: true,
                    plan: {
                      select: {
                        id: true,
                        name: true,
                        slug: true,
                        price: true,
                        yearlyPrice: true,
                        currency: true,
                        interval: true,
                        features: true,
                        limitations: true,
                        translations: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      // Clear the invalid session cookie
      cookieStore.delete(SESSION_COOKIE);
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    if (!user.isActive) {
      // Clear the session cookie for inactive users
      cookieStore.delete(SESSION_COOKIE);
      return NextResponse.json(
        { error: "Account deactivated" },
        { status: 401 },
      );
    }

    // Get the current account (last selected or first available)
    const accountMemberships = user.accountMemberships || [];
    const currentMembership = user.lastSelectedAccountId
      ? accountMemberships.find(
          (m) => m.accountId === user.lastSelectedAccountId,
        )
      : accountMemberships[0];

    const currentAccount = currentMembership?.account || null;
    const subscription = currentAccount?.subscription || null;

    // Build response with account and subscription data
    const response = {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isSuperAdmin: user.isSuperAdmin,
        isActive: user.isActive,
        registrationStep: user.registrationStep,
        image: user.image,
        // Account data
        accountId: currentAccount?.id || null,
        accountName: currentAccount?.name || null,
        aiCreditsBalance: currentAccount?.aiCreditsBalance || 0,
        role: currentMembership?.role || null,
        isOwner: currentMembership?.isOwner || false,
        // Subscription data
        subscription: subscription
          ? {
              id: subscription.id,
              status: subscription.status,
              currentPeriodStart: subscription.currentPeriodStart,
              currentPeriodEnd: subscription.currentPeriodEnd,
              cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
              plan: subscription.plan
                ? {
                    id: subscription.plan.id,
                    name: subscription.plan.name,
                    slug: subscription.plan.slug,
                    price: subscription.plan.price,
                    yearlyPrice: subscription.plan.yearlyPrice,
                    currency: subscription.plan.currency,
                    interval: subscription.plan.interval,
                    features: subscription.plan.features,
                    limitations: subscription.plan.limitations,
                    translations: subscription.plan.translations,
                  }
                : null,
            }
          : null,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching current user:", error);
    return NextResponse.json(
      { error: "Failed to fetch user" },
      { status: 500 },
    );
  }
}
