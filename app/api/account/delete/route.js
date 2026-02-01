import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

/**
 * DELETE /api/account/delete
 * Permanently delete the user's account and all associated data
 * 
 * This will delete:
 * - All sites linked to the account
 * - All content, keywords, and other site data
 * - All team members (AccountMembers)
 * - All roles
 * - Subscription
 * - The account itself
 * - The user (if they own no other accounts)
 */
export async function DELETE(request) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the user with their account memberships
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        accountMemberships: {
          where: { isOwner: true },
          include: {
            account: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Find the account where this user is the owner
    const ownerMembership = user.accountMemberships.find(m => m.isOwner);
    
    if (!ownerMembership) {
      return NextResponse.json(
        { error: 'You must be the account owner to delete the account' },
        { status: 403 }
      );
    }

    const accountId = ownerMembership.accountId;

    console.log(`[Account Delete] Starting deletion for account: ${accountId}, user: ${userId}`);

    // Delete everything in a transaction
    await prisma.$transaction(async (tx) => {
      // 1. Delete all sites and their related data
      const sites = await tx.site.findMany({
        where: { accountId },
        select: { id: true },
      });

      for (const site of sites) {
        // Delete site-related data
        await tx.keyword.deleteMany({ where: { siteId: site.id } });
        await tx.content.deleteMany({ where: { siteId: site.id } });
        await tx.redirection.deleteMany({ where: { siteId: site.id } });
        await tx.siteAudit.deleteMany({ where: { siteId: site.id } });
        await tx.siteEntityType.deleteMany({ where: { siteId: site.id } });
        await tx.siteEntity.deleteMany({ where: { siteId: site.id } });
        await tx.siteMenu.deleteMany({ where: { siteId: site.id } });
        await tx.interview.deleteMany({ where: { siteId: site.id } });
        await tx.userSitePreference.deleteMany({ where: { siteId: site.id } });
      }

      // Delete all sites
      await tx.site.deleteMany({ where: { accountId } });
      console.log(`[Account Delete] Deleted ${sites.length} sites`);

      // 2. Delete AI credits logs
      await tx.aiCreditsLog.deleteMany({ where: { accountId } });

      // 3. Delete subscription
      await tx.subscription.deleteMany({ where: { accountId } });
      console.log('[Account Delete] Deleted subscription');

      // 4. Delete all account members
      await tx.accountMember.deleteMany({ where: { accountId } });
      console.log('[Account Delete] Deleted account members');

      // 5. Delete all roles for this account
      await tx.role.deleteMany({ where: { accountId } });
      console.log('[Account Delete] Deleted roles');

      // 6. Delete the account
      await tx.account.delete({ where: { id: accountId } });
      console.log('[Account Delete] Deleted account');

      // 7. Check if user has any other accounts
      const otherMemberships = await tx.accountMember.findMany({
        where: { userId },
      });

      if (otherMemberships.length === 0) {
        // Delete auth providers
        await tx.authProvider.deleteMany({ where: { userId } });
        
        // Delete the user
        await tx.user.delete({ where: { id: userId } });
        console.log('[Account Delete] Deleted user (no other accounts)');
      } else {
        // Update user's lastSelectedAccountId if it was the deleted account
        if (user.lastSelectedAccountId === accountId) {
          await tx.user.update({
            where: { id: userId },
            data: { lastSelectedAccountId: otherMemberships[0].accountId },
          });
        }
        console.log('[Account Delete] User has other accounts, not deleted');
      }
    });

    // Clear the session cookie
    cookieStore.delete(SESSION_COOKIE);

    console.log('[Account Delete] Deletion completed successfully');

    return NextResponse.json({
      success: true,
      message: 'Account deleted successfully',
    });
  } catch (error) {
    console.error('[Account Delete] Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete account' },
      { status: 500 }
    );
  }
}
