import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifySuperAdmin } from '@/lib/superadmin-auth';
import {
  SUPPORT_STATUSES,
  SUPPORT_PRIORITIES,
  SUPPORT_CATEGORIES,
} from '@/lib/support-tickets';
import { notifyUserOfAdminActivity } from '@/lib/support-notifications';

const TICKET_INCLUDE = {
  account: { select: { id: true, name: true, slug: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
  assignedAdmin: { select: { id: true, firstName: true, lastName: true, email: true } },
};

/**
 * GET /api/admin/support/tickets/:id
 * Returns the full ticket plus *all* messages, including internal admin notes.
 */
export async function GET(_request, context) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    const ticket = await prisma.supportTicket.findUnique({
      where: { id },
      include: TICKET_INCLUDE,
    });
    if (!ticket) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const messages = await prisma.supportMessage.findMany({
      where: { ticketId: ticket.id },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    return NextResponse.json({ ticket, messages });
  } catch (error) {
    console.error('[API/admin/support/tickets/:id] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/support/tickets/:id
 * Admin-only mutations. Body may include any subset of:
 *   status            - SupportStatus
 *   priority          - SupportPriority
 *   category          - SupportCategory
 *   assignedAdminId   - user id (must be a SuperAdmin), or null to unassign
 *   action            - 'resolve' | 'close' | 'reopen'  (convenience over status)
 *
 * Status side-effects:
 *   - RESOLVED → sets resolvedAt; clears closedAt.
 *   - CLOSED   → sets closedAt; preserves resolvedAt.
 *   - any other status → clears resolvedAt + closedAt.
 */
export async function PATCH(request, context) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    const ticket = await prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const payload = await request.json().catch(() => ({}));
    const data = {};

    // Convenience action → status
    if (payload.action === 'resolve') data.status = 'RESOLVED';
    else if (payload.action === 'close') data.status = 'CLOSED';
    else if (payload.action === 'reopen') data.status = 'PENDING_ADMIN';

    if (payload.status && SUPPORT_STATUSES.includes(payload.status)) {
      data.status = payload.status;
    }
    if (payload.priority && SUPPORT_PRIORITIES.includes(payload.priority)) {
      data.priority = payload.priority;
    }
    if (payload.category && SUPPORT_CATEGORIES.includes(payload.category)) {
      data.category = payload.category;
    }

    if ('assignedAdminId' in payload) {
      if (payload.assignedAdminId === null) {
        data.assignedAdminId = null;
      } else if (typeof payload.assignedAdminId === 'string') {
        const target = await prisma.user.findUnique({
          where: { id: payload.assignedAdminId },
          select: { id: true, isSuperAdmin: true, isActive: true },
        });
        if (!target || !target.isSuperAdmin || !target.isActive) {
          return NextResponse.json(
            { error: 'assignedAdminId must reference an active SuperAdmin' },
            { status: 400 },
          );
        }
        data.assignedAdminId = target.id;
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No changes provided' }, { status: 400 });
    }

    // Status timestamps
    if ('status' in data) {
      const now = new Date();
      if (data.status === 'RESOLVED') {
        data.resolvedAt = now;
        data.closedAt = null;
      } else if (data.status === 'CLOSED') {
        data.closedAt = now;
        // Keep resolvedAt as-is so we know it was resolved before closing.
      } else {
        data.resolvedAt = null;
        data.closedAt = null;
      }
    }

    const updated = await prisma.supportTicket.update({
      where: { id: ticket.id },
      data,
      include: TICKET_INCLUDE,
    });

    // Notify the user only on transitions to RESOLVED or CLOSED that the admin made.
    if ('status' in data && data.status !== ticket.status) {
      if (data.status === 'RESOLVED') {
        notifyUserOfAdminActivity({ ticket: updated, action: 'resolved' });
      } else if (data.status === 'CLOSED') {
        notifyUserOfAdminActivity({ ticket: updated, action: 'closed' });
      }
    }

    return NextResponse.json({ ticket: updated });
  } catch (error) {
    console.error('[API/admin/support/tickets/:id] PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
