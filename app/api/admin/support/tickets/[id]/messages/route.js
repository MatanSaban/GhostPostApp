import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifySuperAdmin } from '@/lib/superadmin-auth';
import { MAX_BODY_LEN } from '@/lib/support-tickets';
import { notifyUserOfAdminActivity } from '@/lib/support-notifications';

/**
 * GET /api/admin/support/tickets/:id/messages
 * Returns all messages on the ticket, including internal admin notes.
 *
 * Query params:
 *   afterId - return messages with id strictly greater (Mongo ObjectId is monotonic),
 *             used for incremental fetches by the admin chat UI.
 */
export async function GET(request, context) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    const ticket = await prisma.supportTicket.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!ticket) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const afterId = searchParams.get('afterId');

    const where = { ticketId: ticket.id };
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
    console.error('[API/admin/support/tickets/:id/messages] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/admin/support/tickets/:id/messages
 * Admin reply or internal note.
 *
 * Body: { body: string, isInternal?: boolean }
 *
 * Side-effects:
 *   - Creates a SupportMessage with senderRole=SUPERADMIN.
 *   - Internal notes do NOT change ticket status and are hidden from the user.
 *   - Public replies bump lastMessageAt and flip status to PENDING_USER.
 *   - Replying to a CLOSED ticket reopens it back to PENDING_USER (admin can always re-engage).
 *   - First admin reply auto-assigns the ticket to the responding admin if unassigned.
 */
export async function POST(request, context) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    const ticket = await prisma.supportTicket.findUnique({
      where: { id },
      select: { id: true, status: true, assignedAdminId: true },
    });
    if (!ticket) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const payload = await request.json().catch(() => ({}));
    const text = typeof payload.body === 'string' ? payload.body.trim() : '';
    const isInternal = payload.isInternal === true;

    if (!text || text.length > MAX_BODY_LEN) {
      return NextResponse.json(
        { error: `Body is required and must be <= ${MAX_BODY_LEN} chars` },
        { status: 400 },
      );
    }

    const now = new Date();

    const messageData = {
      ticketId: ticket.id,
      senderId: admin.id,
      senderRole: 'SUPERADMIN',
      body: text,
      isInternal,
      // Internal notes don't notify the user, so they're already "read by user" from
      // the user's perspective (they can't see them). Public replies start unread.
      readByUser: isInternal ? true : false,
      readByAdmin: true,
    };

    const ops = [
      prisma.supportMessage.create({
        data: messageData,
        include: {
          sender: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
    ];

    if (!isInternal) {
      const ticketUpdate = {
        lastMessageAt: now,
        lastMessageById: admin.id,
        status: 'PENDING_USER',
      };
      // Coming out of CLOSED/RESOLVED, clear those terminal timestamps.
      if (ticket.status === 'CLOSED') ticketUpdate.closedAt = null;
      if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
        ticketUpdate.resolvedAt = null;
      }
      // Auto-assign on first admin response if nobody owns it yet.
      if (!ticket.assignedAdminId) ticketUpdate.assignedAdminId = admin.id;

      ops.push(
        prisma.supportTicket.update({
          where: { id: ticket.id },
          data: ticketUpdate,
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
      );
    }

    const txResult = await prisma.$transaction(ops);
    const message = txResult[0];
    const updatedTicket = txResult[1] || null;

    if (!isInternal && updatedTicket) {
      notifyUserOfAdminActivity({
        ticket: updatedTicket,
        message: { body: text },
        action: 'reply',
      });
    }

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    console.error('[API/admin/support/tickets/:id/messages] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
