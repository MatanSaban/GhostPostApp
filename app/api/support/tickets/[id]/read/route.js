import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember } from '@/lib/auth-permissions';
import { canViewAllAccountTickets } from '@/lib/support-tickets';

/**
 * POST /api/support/tickets/:id/read
 * Mark all admin/system messages on this ticket as read by the user.
 * Used when the user opens the thread view to clear unread badges.
 */
export async function POST(_request, context) {
  try {
    const { id } = await context.params;

    const auth = await getCurrentAccountMember();
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
    }
    if (auth.isSuperAdmin) {
      return NextResponse.json({ error: 'Not applicable to SuperAdmins' }, { status: 400 });
    }

    const member = auth.member;
    const ticket = await prisma.supportTicket.findUnique({
      where: { id },
      select: { id: true, accountId: true, createdById: true },
    });
    if (!ticket || ticket.accountId !== member.accountId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (!canViewAllAccountTickets(member) && ticket.createdById !== member.userId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const result = await prisma.supportMessage.updateMany({
      where: {
        ticketId: ticket.id,
        senderRole: { in: ['SUPERADMIN', 'SYSTEM'] },
        readByUser: false,
        isInternal: false,
      },
      data: { readByUser: true },
    });

    return NextResponse.json({ success: true, updated: result.count });
  } catch (error) {
    console.error('[API/support/tickets/:id/read] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
