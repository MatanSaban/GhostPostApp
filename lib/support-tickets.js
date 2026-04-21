import prisma from '@/lib/prisma';
import { canAccess } from '@/lib/permissions';

export const SUPPORT_CATEGORIES = ['BILLING', 'TECHNICAL', 'BUG', 'FEATURE_REQUEST', 'GENERAL'];
export const SUPPORT_STATUSES = ['OPEN', 'PENDING_USER', 'PENDING_ADMIN', 'RESOLVED', 'CLOSED'];
export const SUPPORT_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

// Statuses considered "still in progress" - used for unread badges and default filters.
export const SUPPORT_OPEN_STATUSES = ['OPEN', 'PENDING_USER', 'PENDING_ADMIN'];

// Hard limits - keep tickets and messages from being abused as a free file dump.
export const MAX_SUBJECT_LEN = 200;
export const MAX_BODY_LEN = 10_000;

/**
 * Atomically allocate the next human-readable ticket number.
 * Uses an upsert+increment so concurrent creates can't collide.
 */
export async function nextTicketNumber() {
  const counter = await prisma.supportCounter.upsert({
    where: { key: 'ticketNumber' },
    update: { value: { increment: 1 } },
    create: { key: 'ticketNumber', value: 1 },
  });
  return counter.value;
}

/**
 * Whether the given member is allowed to see *all* of an account's tickets,
 * vs. only the ones they personally created.
 *
 * Owners always see all. Otherwise the SUPPORT_VIEW permission is required.
 */
export function canViewAllAccountTickets(member) {
  if (!member) return false;
  if (member.isOwner) return true;
  return canAccess(member, 'SUPPORT', 'VIEW');
}

/**
 * Whether the member can create a ticket in their account.
 */
export function canCreateTicket(member) {
  if (!member) return false;
  if (member.isOwner) return true;
  return canAccess(member, 'SUPPORT', 'CREATE');
}

/**
 * Whether the member can post a reply on a ticket they have access to.
 * NOTE: this is *not* an access check for the ticket itself - caller must
 * verify the ticket belongs to the member's account first.
 */
export function canReplyToTicket(member) {
  if (!member) return false;
  if (member.isOwner) return true;
  return canAccess(member, 'SUPPORT', 'REPLY');
}
