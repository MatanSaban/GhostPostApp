// Web Push fan-out helper.
//
// Reads VAPID keys from env (see .env: NEXT_PUBLIC_VAPID_PUBLIC_KEY,
// VAPID_PRIVATE_KEY, VAPID_SUBJECT) and sends a JSON payload to every
// stored subscription for the given user IDs.
//
// Subscriptions that the push service rejects as gone (HTTP 404 / 410) are
// deleted automatically — that's how the spec says you reap stale endpoints.

import webpush from 'web-push';
import prisma from '@/lib/prisma';

let vapidConfigured = false;

function ensureVapid() {
  if (vapidConfigured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:noreply@ghostpost.com';
  if (!publicKey || !privateKey) {
    console.warn('[push] VAPID keys not configured — skipping push send');
    return false;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

/**
 * Send a push notification to every device subscribed by the listed users.
 *
 * @param {string[]} userIds
 * @param {{ title: string, body: string, link?: string, tag?: string }} payload
 * @returns {Promise<{ sent: number, removed: number, failed: number }>}
 */
export async function sendPushToUsers(userIds, payload) {
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return { sent: 0, removed: 0, failed: 0 };
  }
  if (!ensureVapid()) return { sent: 0, removed: 0, failed: 0 };

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: { in: userIds } },
  });
  if (subscriptions.length === 0) return { sent: 0, removed: 0, failed: 0 };

  const json = JSON.stringify(payload);
  let sent = 0;
  let removed = 0;
  let failed = 0;
  const staleEndpoints = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          json,
        );
        sent += 1;
      } catch (err) {
        // 404 / 410 mean the subscription is dead — clean it up.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          staleEndpoints.push(sub.endpoint);
          removed += 1;
        } else {
          failed += 1;
          console.warn('[push] sendNotification failed:', err?.statusCode, err?.message);
        }
      }
    }),
  );

  if (staleEndpoints.length > 0) {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint: { in: staleEndpoints } },
    });
  }

  return { sent, removed, failed };
}
