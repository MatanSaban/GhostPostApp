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
        phoneNumber: true,
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
                archivedAt: true,
                archiveRestoreExpiresAt: true,
                subscription: {
                  select: {
                    id: true,
                    status: true,
                    billingInterval: true,
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

    // Get the current account (last selected or first available), preferring non-archived accounts.
    // An archived account should never be auto-selected - if lastSelectedAccountId points to one,
    // fall through to the first non-archived membership.
    const allMemberships = user.accountMemberships || [];
    const isArchived = (m) => !!m?.account?.archivedAt;
    const activeMemberships = allMemberships.filter((m) => !isArchived(m));

    let currentMembership = null;
    if (user.lastSelectedAccountId) {
      const selected = allMemberships.find(
        (m) => m.accountId === user.lastSelectedAccountId,
      );
      if (selected && !isArchived(selected)) currentMembership = selected;
    }
    if (!currentMembership) {
      currentMembership = activeMemberships[0] || null;
    }

    // Owned archived accounts that are still within their restore window.
    const now = new Date();
    const archivedOwnedAccounts = allMemberships
      .filter(
        (m) =>
          m.isOwner &&
          m.account?.archivedAt &&
          m.account?.archiveRestoreExpiresAt &&
          new Date(m.account.archiveRestoreExpiresAt) > now,
      )
      .map((m) => ({
        id: m.accountId,
        name: m.account.name,
        archivedAt: m.account.archivedAt,
        restoreExpiresAt: m.account.archiveRestoreExpiresAt,
      }));

    const currentAccount = currentMembership?.account || null;
    const subscription = currentAccount?.subscription || null;

    // Get usage stats for the current account
    let usageStats = {
      sitesCount: 0,
      membersCount: 0,
      siteAuditsCount: 0,
      keywordsCount: 0,
      competitorsCount: 0,
    };

    if (currentAccount) {
      // Count sites for this account
      const sitesCount = await prisma.site.count({
        where: { accountId: currentAccount.id },
      });

      // Count active members for this account
      const membersCount = await prisma.accountMember.count({
        where: {
          accountId: currentAccount.id,
          status: 'ACTIVE',
        },
      });

      // Count site audits for this account (this month)
      // Desktop + mobile run as a pair - only count non-mobile so each trigger counts as 1
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const siteAuditsCount = await prisma.siteAudit.count({
        where: {
          site: { accountId: currentAccount.id },
          createdAt: { gte: startOfMonth },
          deviceType: { not: 'mobile' },
        },
      });

      // Keywords span the whole account (maxKeywords is account-scoped).
      const keywordsCount = await prisma.keyword.count({
        where: { site: { accountId: currentAccount.id } },
      });

      // Competitors are per-site, but surface the total-across-sites here so
      // the Subscription tab can show a rollup. Per-site enforcement lives
      // in /api/competitors and the capacity helpers.
      const competitorsCount = await prisma.competitor.count({
        where: {
          site: { accountId: currentAccount.id },
          isActive: true,
        },
      });

      usageStats = {
        sitesCount,
        membersCount,
        siteAuditsCount,
        keywordsCount,
        competitorsCount,
      };
    }

    // Build response with account and subscription data
    const response = {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber || null,
        isSuperAdmin: user.isSuperAdmin,
        isActive: user.isActive,
        registrationStep: user.registrationStep,
        image: user.image,
        // Account data
        accountId: currentAccount?.id || null,
        accountName: currentAccount?.name || null,
        role: currentMembership?.role || null,
        isOwner: currentMembership?.isOwner || false,
        // Archive / restore awareness
        archivedOwnedAccounts,
        // Usage stats
        usageStats: usageStats,
        // Subscription data
        subscription: subscription
          ? {
              id: subscription.id,
              status: subscription.status,
              billingInterval: subscription.billingInterval,
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
