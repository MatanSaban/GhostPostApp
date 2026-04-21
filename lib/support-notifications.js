import prisma from '@/lib/prisma';
import { queueEmail, emailTemplates } from '@/lib/mailer';

const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

/**
 * Resolve the admin recipients for a ticket-related email.
 * Prefers the assigned admin; falls back to all active SuperAdmins.
 */
async function resolveAdminRecipients(ticket) {
  if (ticket.assignedAdminId) {
    const assigned = await prisma.user.findUnique({
      where: { id: ticket.assignedAdminId },
      select: { email: true, isActive: true, isSuperAdmin: true },
    });
    if (assigned?.isActive && assigned.isSuperAdmin && assigned.email) {
      return [assigned.email];
    }
  }
  const admins = await prisma.user.findMany({
    where: { isSuperAdmin: true, isActive: true },
    select: { email: true },
  });
  return admins.map((a) => a.email).filter(Boolean);
}

function trimPreview(body, max = 280) {
  if (!body) return '';
  const trimmed = body.length > max ? `${body.slice(0, max)}…` : body;
  return trimmed;
}

/**
 * Notify all relevant SuperAdmins via email when a user creates a new ticket
 * or posts a reply. Fire-and-forget; errors are logged, never thrown.
 */
export async function notifyAdminsOfUserActivity({ ticket, message, action }) {
  try {
    const recipients = await resolveAdminRecipients(ticket);
    if (recipients.length === 0) return;

    const url = `${APP_URL}/admin/support/${ticket.id}`;
    const tpl = emailTemplates.supportAdminAlert({
      ticket,
      preview: trimPreview(message?.body),
      action,
      url,
    });

    for (const to of recipients) {
      queueEmail({ to, subject: tpl.subject, html: tpl.html, text: tpl.text });
    }
  } catch (err) {
    console.warn('[support-notifications] notifyAdminsOfUserActivity failed:', err.message);
  }
}

/**
 * Notify the ticket creator (in-app + email) when an admin posts a public reply
 * or marks the ticket resolved/closed. Internal admin notes do NOT call this.
 */
export async function notifyUserOfAdminActivity({ ticket, message, action }) {
  try {
    const creator = await prisma.user.findUnique({
      where: { id: ticket.createdById },
      select: { id: true, email: true, isActive: true },
    });
    if (!creator || !creator.isActive) return;

    // In-app notification (uses the existing Notification model).
    await prisma.notification.create({
      data: {
        userId: creator.id,
        accountId: ticket.accountId,
        type: 'support_reply',
        title: 'notifications.support.title',
        message: 'notifications.support.message',
        link: `/dashboard/support/${ticket.id}`,
        data: {
          ticketId: ticket.id,
          ticketNumber: ticket.ticketNumber,
          subject: ticket.subject,
          action: action || 'reply',
        },
        read: false,
      },
    }).catch((e) => console.warn('[support-notifications] notification failed:', e.message));

    // Email
    if (creator.email) {
      const url = `${APP_URL}/dashboard/support/${ticket.id}`;
      const tpl = emailTemplates.supportUserReply({
        ticket,
        preview: trimPreview(message?.body),
        action,
        url,
      });
      queueEmail({ to: creator.email, subject: tpl.subject, html: tpl.html, text: tpl.text });
    }
  } catch (err) {
    console.warn('[support-notifications] notifyUserOfAdminActivity failed:', err.message);
  }
}
