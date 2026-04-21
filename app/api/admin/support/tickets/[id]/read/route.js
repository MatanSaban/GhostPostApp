import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifySuperAdmin } from '@/lib/superadmin-auth';

/**
 * POST /api/admin/support/tickets/:id/read
 * Marks all USER messages on the ticket as read by admin. Best-effort, idempotent.
 */
export async function POST(_request, context) {
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

    const result = await prisma.supportMessage.updateMany({
      where: {
        ticketId: ticket.id,
        senderRole: 'USER',
        readByAdmin: false,
      },
      data: { readByAdmin: true },
    });

    return NextResponse.json({ updated: result.count });
  } catch (error) {
    console.error('[API/admin/support/tickets/:id/read] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
