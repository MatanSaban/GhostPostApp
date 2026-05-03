import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

/** Returns the authenticated user (id, isSuperAdmin) or null. */
export async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!userId) return null;
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isSuperAdmin: true, email: true },
  });
}

/** True when the account's active plan is anything other than free. */
export function accountHasPaidPlan(account) {
  const plan = account?.subscription?.plan;
  if (!plan) return false;
  if (plan.isFreeFallback) return false;
  if (plan.slug === 'free') return false;
  if (typeof plan.price === 'number' && plan.price === 0) return false;
  return true;
}

/**
 * Resolve a site the user is allowed to act on, with the account's plan
 * loaded so callers can enforce the paid-plan gate without a second query.
 * Returns { site, account } or null.
 */
export async function loadAccessibleSite({ userId, isSuperAdmin, siteId }) {
  const where = isSuperAdmin
    ? { id: siteId }
    : { id: siteId, account: { members: { some: { userId } } } };

  const site = await prisma.site.findFirst({
    where,
    select: {
      id: true,
      url: true,
      name: true,
      accountId: true,
      account: {
        select: {
          id: true,
          subscription: { select: { plan: { select: { slug: true, price: true, isFreeFallback: true } } } },
        },
      },
    },
  });

  if (!site) return null;
  return { site, account: site.account };
}
