import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember } from '@/lib/auth-permissions';
import {
  MAX_BODY_LEN,
  canViewAllAccountTickets,
  canReplyToTicket,
} from '@/lib/support-tickets';
import { notifyAdminsOfUserActivity } from '@/lib/support-notifications';

/**
 * Verify the ticket is visible to the current member.
 * Mirrors the logic in [id]/route.js so a single source of truth exists per file.
 */
async function loadVisibleTicket(ticketId, member) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      accountId: true,
      createdById: true,
      status: true,
    },
  });
  if (!ticket) return { ticket: null, error: 'Not found', status: 404 };
  if (ticket.accountId !== member.accountId) return { ticket: null, error: 'Not found', status: 404 };
  if (!canViewAllAccountTickets(member) && ticket.createdById !== member.userId) {
    return { ticket: null, error: 'Not found', status: 404 };
  }
  return { ticket, error: null, status: 200 };
}

/**
 * GET /api/support/tickets/:id/messages
 * Messages-only refresh endpoint for polling. Excludes internal admin notes.
 *
 * Query params:
 *   afterId - return messages with id strictly greater (Mongo ObjectId is monotonic),
 *             used for incremental fetches by the chat thread UI.
 */
export async function GET(request, context) {
  try {
    const { id } = await context.params;

    const auth = await getCurrentAccountMember();
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
    }
    if (auth.isSuperAdmin) {
      return NextResponse.json(
        { error: 'SuperAdmins use /api/admin/support/tickets/:id/messages' },
        { status: 400 },
      );
    }

    const { ticket, error, status } = await loadVisibleTicket(id, auth.member);
    if (error) return NextResponse.json({ error }, { status });

    const { searchParams } = new URL(request.url);
    const afterId = searchParams.get('afterId');

    const where = { ticketId: ticket.id, isInternal: false };
    if (afterId) where.id = { gt: afterId };

    const messages = await prisma.supportMessage.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    return NextResponse.json({ messages });
  } catch (error) {
    console.error('[API/support/tickets/:id/messages] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/support/tickets/:id/messages
 * Post a user reply to a ticket.
 *
 * Body: { body: string }
 *
 * Side-effects:
 *   - Creates a SupportMessage with senderRole=USER.
 *   - Bumps the ticket's lastMessageAt / lastMessageById.
 *   - Transitions status to PENDING_ADMIN (the ball is now in admin's court).
 *   - If ticket was CLOSED, rejects - user must reopen first via PATCH.
 *   - If ticket was RESOLVED, replying implicitly reopens it.
 */
export async function POST(request, context) {
  try {
    const { id } = await context.params;

    const auth = await getCurrentAccountMember();
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
    }
    if (auth.isSuperAdmin) {
      return NextResponse.json(
        { error: 'SuperAdmins use /api/admin/support/tickets/:id/messages' },
        { status: 400 },
      );
    }

    const member = auth.member;
    if (!canReplyToTicket(member)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { ticket, error, status } = await loadVisibleTicket(id, member);
    if (error) return NextResponse.json({ error }, { status });

    if (ticket.status === 'CLOSED') {
      return NextResponse.json(
        { error: 'Ticket is closed - open a new ticket instead' },
        { status: 400 },
      );
    }

    const payload = await request.json().catch(() => ({}));
    const text = typeof payload.body === 'string' ? payload.body.trim() : '';
    if (!text || text.length > MAX_BODY_LEN) {
      return NextResponse.json(
        { error: `Body is required and must be <= ${MAX_BODY_LEN} chars` },
        { status: 400 },
      );
    }

    const now = new Date();
    const newStatus = 'PENDING_ADMIN';
    const resolvedReset = ticket.status === 'RESOLVED' ? { resolvedAt: null } : {};

    const [message, updatedTicket] = await prisma.$transaction([
      prisma.supportMessage.create({
        data: {
          ticketId: ticket.id,
          senderId: member.userId,
          senderRole: 'USER',
          body: text,
          readByUser: true,
          readByAdmin: false,
        },
        include: {
          sender: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
      prisma.supportTicket.update({
        where: { id: ticket.id },
        data: {
          lastMessageAt: now,
          lastMessageById: member.userId,
          status: newStatus,
          ...resolvedReset,
        },
        select: {
          id: true,
          ticketNumber: true,
          subject: true,
          status: true,
          priority: true,
          category: true,
          accountId: true,
          createdById: true,
          assignedAdminId: true,
        },
      }),
    ]);

    notifyAdminsOfUserActivity({
      ticket: updatedTicket,
      message: { body: text },
      action: 'reply',
    });

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    console.error('[API/support/tickets/:id/messages] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
