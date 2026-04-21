import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import {
  isWithinRestoreWindow,
  purgeArchivedAccount,
} from '@/lib/account-archive';

const SESSION_COOKIE = 'user_session';

/**
 * GET /api/account/archived-owned
 * List archived accounts the current user owns. Purges any whose restore
 * window has expired so the response reflects only restorable accounts.
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const memberships = await prisma.accountMember.findMany({
      where: { userId, isOwner: true },
      select: {
        account: {
          select: {
            id: true,
            name: true,
            slug: true,
            logo: true,
            archivedAt: true,
            archiveRestoreExpiresAt: true,
            _count: { select: { sites: true } },
          },
        },
      },
    });

    const now = new Date();
    const restorable = [];

    for (const { account } of memberships) {
      if (!account?.archivedAt) continue;
      if (isWithinRestoreWindow(account, now)) {
        restorable.push({
          id: account.id,
          name: account.name,
          slug: account.slug,
          logo: account.logo,
          archivedAt: account.archivedAt,
          restoreExpiresAt: account.archiveRestoreExpiresAt,
          siteCount: account._count.sites,
        });
      } else {
        // Expired - lazy-purge so it stops lingering.
        purgeArchivedAccount({ accountId: account.id }).catch((err) => {
          console.error('[archived-owned] Lazy purge failed:', err);
        });
      }
    }

    return NextResponse.json({ accounts: restorable });
  } catch (error) {
    console.error('[archived-owned] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch archived accounts' },
      { status: 500 }
    );
  }
}
