import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember } from '@/lib/auth-permissions';
import { canViewAllAccountTickets } from '@/lib/support-tickets';

/**
 * Load a ticket and verify the current member can see it.
 * Returns { ticket, error, status } - ticket is null on error.
 *
 * Rules:
 *   - Ticket must belong to the member's selected account.
 *   - If the member lacks SUPPORT_VIEW (and isn't owner), they can only
 *     see tickets they personally created.
 */
async function loadVisibleTicket(ticketId, member) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: {
      createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      assignedAdmin: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  if (!ticket) {
    return { ticket: null, error: 'Not found', status: 404 };
  }
  if (ticket.accountId !== member.accountId) {
    return { ticket: null, error: 'Not found', status: 404 };
  }
  if (!canViewAllAccountTickets(member) && ticket.createdById !== member.userId) {
    return { ticket: null, error: 'Not found', status: 404 };
  }

  return { ticket, error: null, status: 200 };
}

/**
 * GET /api/support/tickets/:id
 * Returns the ticket, plus all non-internal messages (oldest → newest).
 */
export async function GET(_request, context) {
  try {
    const { id } = await context.params;

    const auth = await getCurrentAccountMember();
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
    }
    if (auth.isSuperAdmin) {
      return NextResponse.json(
        { error: 'SuperAdmins use /api/admin/support/tickets/:id' },
        { status: 400 },
      );
    }

    const { ticket, error, status } = await loadVisibleTicket(id, auth.member);
    if (error) return NextResponse.json({ error }, { status });

    const messages = await prisma.supportMessage.findMany({
      where: { ticketId: ticket.id, isInternal: false },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    return NextResponse.json({ ticket, messages });
  } catch (error) {
    console.error('[API/support/tickets/:id] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/support/tickets/:id
 * User actions on their own ticket. Body:
 *   { action: 'close' }   - close an active ticket (anything not CLOSED)
 *   { action: 'reopen' }  - reopen a RESOLVED ticket
 */
export async function PATCH(request, context) {
  try {
    const { id } = await context.params;

    const auth = await getCurrentAccountMember();
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
    }
    if (auth.isSuperAdmin) {
      return NextResponse.json(
        { error: 'SuperAdmins use /api/admin/support/tickets/:id' },
        { status: 400 },
      );
    }

    const member = auth.member;
    const { ticket, error, status } = await loadVisibleTicket(id, member);
    if (error) return NextResponse.json({ error }, { status });

    // Only the ticket creator (or owner) can change status from the user side.
    if (!member.isOwner && ticket.createdById !== member.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const action = body.action;

    if (action === 'close') {
      if (ticket.status === 'CLOSED') {
        return NextResponse.json({ ticket });
      }
      const updated = await prisma.supportTicket.update({
        where: { id: ticket.id },
        data: { status: 'CLOSED', closedAt: new Date() },
      });
      return NextResponse.json({ ticket: updated });
    }

    if (action === 'reopen') {
      if (ticket.status !== 'RESOLVED') {
        return NextResponse.json(
          { error: 'Only RESOLVED tickets can be reopened by the user' },
          { status: 400 },
        );
      }
      const updated = await prisma.supportTicket.update({
        where: { id: ticket.id },
        data: { status: 'PENDING_ADMIN', resolvedAt: null },
      });
      return NextResponse.json({ ticket: updated });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('[API/support/tickets/:id] PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
