import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { archiveAccount } from '@/lib/account-archive';

const SESSION_COOKIE = 'user_session';

/**
 * DELETE /api/account/delete
 * Soft-archive the owner's account. Owner-only.
 *
 * Sets archivedAt, archivedBy, archiveRestoreExpiresAt (now + 14d) and
 * flips isActive=false on the account and its sites. Data is retained and
 * can be restored from /dashboard/restore-account within the 14-day window.
 * After the window expires, a scheduled purge permanently deletes everything.
 *
 * The session is NOT cleared here — the client shows a 5-minute grace modal
 * before calling the logout endpoint. If the tab closes, the session simply
 * remains valid until normal expiry; subsequent logins get redirected to the
 * restore page.
 */
export async function DELETE() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        accountMemberships: {
          where: { isOwner: true },
          include: { account: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const ownerMembership = user.accountMemberships.find((m) => m.isOwner);
    if (!ownerMembership) {
      return NextResponse.json(
        { error: 'You must be the account owner to delete the account' },
        { status: 403 }
      );
    }

    if (ownerMembership.account?.archivedAt) {
      return NextResponse.json(
        { error: 'Account is already archived' },
        { status: 409 }
      );
    }

    const { archivedAt, restoreExpiresAt } = await archiveAccount({
      accountId: ownerMembership.accountId,
      userId,
    });

    console.log(
      `[Account Archive] Archived account ${ownerMembership.accountId} by user ${userId}; restore expires ${restoreExpiresAt.toISOString()}`
    );

    return NextResponse.json({
      success: true,
      archived: true,
      archivedAt: archivedAt.toISOString(),
      restoreExpiresAt: restoreExpiresAt.toISOString(),
    });
  } catch (error) {
    console.error('[Account Archive] Error:', error);
    return NextResponse.json(
      { error: 'Failed to archive account' },
      { status: 500 }
    );
  }
}
