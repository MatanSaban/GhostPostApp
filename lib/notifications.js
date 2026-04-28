import prisma from '@/lib/prisma';
import { sendPushToUsers } from '@/lib/push';
import { getDictionary } from '@/i18n/server';
import { defaultLocale } from '@/i18n/config';

/**
 * Resolve a dot-keyed translation against a dictionary, with `{name}` style
 * single-brace interpolation. Mirrors how notification copy is templated
 * client-side. Returns null if the key isn't in the dict.
 */
function resolveKey(dict, key, params = {}) {
  if (!dict || !key || typeof key !== 'string') return null;
  let value = dict;
  for (const part of key.split('.')) {
    if (value && typeof value === 'object' && part in value) {
      value = value[part];
    } else {
      return null;
    }
  }
  if (typeof value !== 'string') return null;
  return value.replace(/\{(\w+)\}/g, (_, name) =>
    params[name] !== undefined ? String(params[name]) : `{${name}}`,
  );
}

/**
 * Build a push payload from notification fields. Falls back to the raw key
 * if the dictionary lookup misses, so the user still gets *something*.
 *
 * Push uses the platform default locale (English) for v1 — per-user
 * locale resolution would mean N dictionary lookups for fan-out and
 * isn't worth the complexity yet.
 */
async function buildPushPayload({ title, message, link, data, type }) {
  const dict = await getDictionary(defaultLocale);
  const params = data || {};
  const resolvedTitle = resolveKey(dict, title, params) || title || 'GhostSEO';
  const resolvedBody = resolveKey(dict, message, params) || message || '';
  return {
    title: resolvedTitle,
    body: resolvedBody,
    link: link || '/dashboard/notifications',
    tag: type,
  };
}

/**
 * Create notifications for all active members of an account, and fan out
 * a web push to any of those members who have subscribed a device.
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

    console.log(`[Notifications] Created ${members.length} notification(s) - type=${type}`);

    // Fire-and-forget web push. Don't block on push success — in-app
    // notification is the source of truth, push is best-effort delivery.
    const userIds = members.map((m) => m.userId);
    const payload = await buildPushPayload({ type, title, message, link, data });
    sendPushToUsers(userIds, payload).catch((err) =>
      console.warn('[Notifications] push fan-out failed:', err?.message),
    );
  } catch (err) {
    console.warn('[Notifications] Failed to create notifications:', err.message);
  }
}

/**
 * Create a notification for a single user and send web push to their
 * subscribed devices. Used for per-user events (e.g. agent approval gate)
 * where fanning out to the whole account would be noisy.
 */
export async function notifyUser(userId, accountId, { type, title, message, link, data }) {
  try {
    await prisma.notification.create({
      data: {
        userId,
        accountId,
        type,
        title,
        message,
        link: link || null,
        data: data || null,
        read: false,
      },
    });

    const payload = await buildPushPayload({ type, title, message, link, data });
    sendPushToUsers([userId], payload).catch((err) =>
      console.warn('[Notifications] push send failed:', err?.message),
    );
  } catch (err) {
    console.warn('[Notifications] notifyUser failed:', err.message);
  }
}
