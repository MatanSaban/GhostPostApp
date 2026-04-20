import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import {
  isWithinRestoreWindow,
  restoreAccount,
  purgeArchivedAccount,
} from '@/lib/account-archive';

const SESSION_COOKIE = 'user_session';

/**
 * POST /api/account/[id]/restore
 * Restore an archived account. Owner-only. Must be within the 14-day window.
 * If the window expired, lazily purge and return 410 Gone.
 */
export async function POST(_request, { params }) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: accountId } = await params;

    const membership = await prisma.accountMember.findFirst({
      where: { userId, accountId },
      select: { isOwner: true },
    });

    if (!membership || !membership.isOwner) {
      return NextResponse.json(
        { error: 'Only the account owner can restore' },
        { status: 403 }
      );
    }

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        archivedAt: true,
        archiveRestoreExpiresAt: true,
      },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    if (!account.archivedAt) {
      return NextResponse.json(
        { error: 'Account is not archived' },
        { status: 409 }
      );
    }

    if (!isWithinRestoreWindow(account)) {
      // Restore window has passed — purge now so we don't leave dangling archived rows.
      await purgeArchivedAccount({ accountId }).catch((err) => {
        console.error('[Account Restore] Lazy purge failed:', err);
      });
      return NextResponse.json(
        { error: 'Restore window has expired' },
        { status: 410 }
      );
    }

    await restoreAccount({ accountId });

    // Point the user's next session at the restored account.
    await prisma.user.update({
      where: { id: userId },
      data: { lastSelectedAccountId: accountId },
    });

    console.log(`[Account Restore] Restored account ${accountId} by user ${userId}`);

    return NextResponse.json({ success: true, accountId });
  } catch (error) {
    console.error('[Account Restore] Error:', error);
    return NextResponse.json(
      { error: 'Failed to restore account' },
      { status: 500 }
    );
  }
}
