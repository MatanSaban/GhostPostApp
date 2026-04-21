import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifySuperAdmin } from '@/lib/superadmin-auth';

/**
 * GET /api/admin/support/unread-count
 * Returns the number of distinct tickets that contain at least one
 * non-internal user message that has not yet been marked read by an admin.
 *
 * Used for the admin sidebar badge.
 */
export async function GET() {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rows = await prisma.supportMessage.findMany({
      where: {
        senderRole: 'USER',
        readByAdmin: false,
        isInternal: false,
      },
      select: { ticketId: true },
      distinct: ['ticketId'],
    });

    return NextResponse.json({ count: rows.length });
  } catch (error) {
    console.error('[API/admin/support/unread-count] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
