import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifySuperAdmin } from '@/lib/superadmin-auth';
import {
  SUPPORT_STATUSES,
  SUPPORT_PRIORITIES,
  SUPPORT_CATEGORIES,
} from '@/lib/support-tickets';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

/**
 * GET /api/admin/support/tickets
 * Cross-account ticket list for SuperAdmins.
 *
 * Query params (all optional, AND'd together):
 *   status        - single SupportStatus
 *   priority      - single SupportPriority
 *   category      - single SupportCategory
 *   accountId     - filter to one account
 *   assignedToMe  - 'true' to limit to tickets assigned to the current admin
 *   q             - substring match on subject (case-insensitive)
 *   limit         - page size (default 25, max 100)
 *   cursor        - id of last ticket in previous page
 */
export async function GET(request) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || `${DEFAULT_LIMIT}`, 10), MAX_LIMIT);
    const cursor = searchParams.get('cursor');
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const category = searchParams.get('category');
    const accountId = searchParams.get('accountId');
    const assignedToMe = searchParams.get('assignedToMe') === 'true';
    const q = searchParams.get('q')?.trim();

    const where = {};
    if (status && SUPPORT_STATUSES.includes(status)) where.status = status;
    if (priority && SUPPORT_PRIORITIES.includes(priority)) where.priority = priority;
    if (category && SUPPORT_CATEGORIES.includes(category)) where.category = category;
    if (accountId) where.accountId = accountId;
    if (assignedToMe) where.assignedAdminId = admin.id;
    if (q) where.subject = { contains: q, mode: 'insensitive' };

    const findArgs = {
      where,
      orderBy: [
        // Pin URGENT/HIGH priority to the top within recently-active tickets.
        { lastMessageAt: 'desc' },
      ],
      take: limit + 1,
      include: {
        account: { select: { id: true, name: true, slug: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignedAdmin: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    };

    if (cursor) {
      findArgs.skip = 1;
      findArgs.cursor = { id: cursor };
    }

    const results = await prisma.supportTicket.findMany(findArgs);
    const hasMore = results.length > limit;
    const tickets = hasMore ? results.slice(0, limit) : results;
    const nextCursor = hasMore ? tickets[tickets.length - 1]?.id : null;

    return NextResponse.json({ tickets, hasMore, nextCursor });
  } catch (error) {
    console.error('[API/admin/support/tickets] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
