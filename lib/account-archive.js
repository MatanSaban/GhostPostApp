import prisma from '@/lib/prisma';

// 14-day restore window after archive before permanent purge.
export const ARCHIVE_RESTORE_WINDOW_DAYS = 14;

export function getRestoreExpiryFromNow(now = new Date()) {
  const d = new Date(now);
  d.setDate(d.getDate() + ARCHIVE_RESTORE_WINDOW_DAYS);
  return d;
}

export function isWithinRestoreWindow(account, now = new Date()) {
  if (!account?.archivedAt || !account?.archiveRestoreExpiresAt) return false;
  return account.archiveRestoreExpiresAt > now;
}

/**
 * Soft-archive an account. Owner-gate must be enforced by the caller.
 * Sets archive fields on the account, flips isActive=false, and cascades
 * isActive=false to all sites under the account.
 */
export async function archiveAccount({ accountId, userId, now = new Date() }) {
  const restoreExpiresAt = getRestoreExpiryFromNow(now);

  await prisma.$transaction(async (tx) => {
    await tx.account.update({
      where: { id: accountId },
      data: {
        archivedAt: now,
        archivedBy: userId,
        archiveRestoreExpiresAt: restoreExpiresAt,
        isActive: false,
      },
    });

    await tx.site.updateMany({
      where: { accountId },
      data: { isActive: false },
    });
  });

  return { archivedAt: now, restoreExpiresAt };
}

/**
 * Restore a previously archived account. Caller must enforce owner-gate and
 * check the restore window is still open.
 */
export async function restoreAccount({ accountId }) {
  await prisma.$transaction(async (tx) => {
    await tx.account.update({
      where: { id: accountId },
      data: {
        archivedAt: null,
        archivedBy: null,
        archiveRestoreExpiresAt: null,
        isActive: true,
      },
    });

    await tx.site.updateMany({
      where: { accountId },
      data: { isActive: true },
    });
  });
}

/**
 * Permanently delete an archived account and everything under it.
 * Mirrors the original destructive delete. Caller must verify the account
 * is archived and (for the scheduled purge) past its restore window.
 *
 * Also deletes the owner user if they own no other accounts, matching the
 * prior behavior.
 */
export async function purgeArchivedAccount({ accountId }) {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      archivedBy: true,
      members: { where: { isOwner: true }, select: { userId: true } },
    },
  });

  if (!account) return { purged: false, reason: 'not_found' };

  const ownerUserId = account.archivedBy || account.members[0]?.userId || null;

  await prisma.$transaction(async (tx) => {
    const sites = await tx.site.findMany({
      where: { accountId },
      select: { id: true },
    });

    for (const site of sites) {
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

    await tx.site.deleteMany({ where: { accountId } });
    await tx.aiCreditsLog.deleteMany({ where: { accountId } });
    await tx.subscription.deleteMany({ where: { accountId } });
    await tx.accountMember.deleteMany({ where: { accountId } });
    await tx.role.deleteMany({ where: { accountId } });
    await tx.account.delete({ where: { id: accountId } });

    if (ownerUserId) {
      const otherMemberships = await tx.accountMember.findMany({
        where: { userId: ownerUserId },
      });
      if (otherMemberships.length === 0) {
        await tx.authProvider.deleteMany({ where: { userId: ownerUserId } });
        await tx.user.delete({ where: { id: ownerUserId } });
      } else {
        const user = await tx.user.findUnique({
          where: { id: ownerUserId },
          select: { lastSelectedAccountId: true },
        });
        if (user?.lastSelectedAccountId === accountId) {
          await tx.user.update({
            where: { id: ownerUserId },
            data: { lastSelectedAccountId: otherMemberships[0].accountId },
          });
        }
      }
    }
  });

  return { purged: true };
}

/**
 * Purge all accounts whose restore window has expired. Used by the scheduled
 * cron endpoint. Returns the list of purged account IDs.
 */
export async function purgeExpiredArchivedAccounts({ now = new Date() } = {}) {
  const expired = await prisma.account.findMany({
    where: {
      archivedAt: { not: null },
      archiveRestoreExpiresAt: { lt: now },
    },
    select: { id: true },
  });

  const purgedIds = [];
  for (const { id } of expired) {
    try {
      const result = await purgeArchivedAccount({ accountId: id });
      if (result.purged) purgedIds.push(id);
    } catch (err) {
      console.error(`[purgeExpiredArchivedAccounts] Failed to purge ${id}:`, err);
    }
  }
  return purgedIds;
}
