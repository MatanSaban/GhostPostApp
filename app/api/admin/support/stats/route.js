import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifySuperAdmin } from '@/lib/superadmin-auth';
import { SUPPORT_OPEN_STATUSES } from '@/lib/support-tickets';

/**
 * GET /api/admin/support/stats
 * Aggregate counts for the admin dashboard cards.
 *
 * Returns:
 *   total, byStatus { OPEN, PENDING_USER, PENDING_ADMIN, RESOLVED, CLOSED },
 *   byPriority { LOW, NORMAL, HIGH, URGENT },
 *   open (sum of all open statuses),
 *   awaitingAdmin (PENDING_ADMIN + OPEN - needs admin attention),
 *   assignedToMe (open tickets currently assigned to the requesting admin)
 */
export async function GET() {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [byStatusRaw, byPriorityRaw, total, awaitingAdmin, assignedToMe] = await Promise.all([
      prisma.supportTicket.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.supportTicket.groupBy({ by: ['priority'], _count: { _all: true } }),
      prisma.supportTicket.count(),
      prisma.supportTicket.count({
        where: { status: { in: ['OPEN', 'PENDING_ADMIN'] } },
      }),
      prisma.supportTicket.count({
        where: {
          assignedAdminId: admin.id,
          status: { in: SUPPORT_OPEN_STATUSES },
        },
      }),
    ]);

    const byStatus = {
      OPEN: 0,
      PENDING_USER: 0,
      PENDING_ADMIN: 0,
      RESOLVED: 0,
      CLOSED: 0,
    };
    for (const row of byStatusRaw) byStatus[row.status] = row._count._all;

    const byPriority = { LOW: 0, NORMAL: 0, HIGH: 0, URGENT: 0 };
    for (const row of byPriorityRaw) byPriority[row.priority] = row._count._all;

    const open = byStatus.OPEN + byStatus.PENDING_USER + byStatus.PENDING_ADMIN;

    return NextResponse.json({
      total,
      open,
      awaitingAdmin,
      assignedToMe,
      byStatus,
      byPriority,
    });
  } catch (error) {
    console.error('[API/admin/support/stats] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
