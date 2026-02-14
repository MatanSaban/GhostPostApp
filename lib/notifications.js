import prisma from '@/lib/prisma';

/**
 * Create notifications for all active members of an account.
 *
 * @param {string} accountId
 * @param {Object} opts
 * @param {string} opts.type       - "audit_complete" | "audit_failed" | ...
 * @param {string} opts.title      - translation key
 * @param {string} opts.message    - translation key
 * @param {string} [opts.link]     - dashboard path
 * @param {Object} [opts.data]     - extra JSON payload
 */
export async function notifyAccountMembers(accountId, { type, title, message, link, data }) {
  try {
    const members = await prisma.accountMember.findMany({
      where: { accountId, status: 'ACTIVE', userId: { not: null } },
      select: { userId: true },
    });

    if (members.length === 0) return;

    await prisma.notification.createMany({
      data: members.map((m) => ({
        userId: m.userId,
        accountId,
        type,
        title,
        message,
        link: link || null,
        data: data || null,
        read: false,
      })),
    });

    console.log(`[Notifications] Created ${members.length} notification(s) — type=${type}`);
  } catch (err) {
    console.warn('[Notifications] Failed to create notifications:', err.message);
  }
}
