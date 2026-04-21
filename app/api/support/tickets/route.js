import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember } from '@/lib/auth-permissions';
import {
  SUPPORT_CATEGORIES,
  SUPPORT_STATUSES,
  MAX_SUBJECT_LEN,
  MAX_BODY_LEN,
  nextTicketNumber,
  canViewAllAccountTickets,
  canCreateTicket,
} from '@/lib/support-tickets';
import { notifyAdminsOfUserActivity } from '@/lib/support-notifications';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * GET /api/support/tickets
 * List support tickets visible to the current user in their selected account.
 *
 * Query params:
 *   limit       - page size (default 20, max 100)
 *   cursor      - ticket id to paginate after
 *   status      - filter by SupportStatus (single)
 *   q           - substring match on subject (case-insensitive)
 */
export async function GET(request) {
  try {
    const auth = await getCurrentAccountMember();
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
    }
    if (auth.isSuperAdmin) {
      return NextResponse.json(
        { error: 'SuperAdmins use /api/admin/support/tickets' },
        { status: 400 },
      );
    }

    const member = auth.member;
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || `${DEFAULT_LIMIT}`, 10), MAX_LIMIT);
    const cursor = searchParams.get('cursor');
    const status = searchParams.get('status');
    const q = searchParams.get('q')?.trim();

    const where = { accountId: member.accountId };
    if (!canViewAllAccountTickets(member)) {
      where.createdById = member.userId;
    }
    if (status && SUPPORT_STATUSES.includes(status)) {
      where.status = status;
    }
    if (q) {
      where.subject = { contains: q, mode: 'insensitive' };
    }

    const findArgs = {
      where,
      orderBy: { lastMessageAt: 'desc' },
      take: limit + 1,
      select: {
        id: true,
        ticketNumber: true,
        subject: true,
        category: true,
        priority: true,
        status: true,
        createdById: true,
        assignedAdminId: true,
        lastMessageAt: true,
        lastMessageById: true,
        createdAt: true,
        updatedAt: true,
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
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
    console.error('[API/support/tickets] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/support/tickets
 * Open a new support ticket in the current account.
 *
 * Body: {
 *   subject       (required, <= 200 chars)
 *   body          (required, <= 10_000 chars)  - first message
 *   category      ('BILLING'|'TECHNICAL'|'BUG'|'FEATURE_REQUEST'|'GENERAL', default GENERAL)
 *   contextSiteId (optional)
 *   contextUrl    (optional)
 *   contextMeta   (optional JSON)
 * }
 */
export async function POST(request) {
  try {
    const auth = await getCurrentAccountMember();
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
    }
    if (auth.isSuperAdmin) {
      return NextResponse.json(
        { error: 'SuperAdmins cannot open user tickets via this endpoint' },
        { status: 400 },
      );
    }

    const member = auth.member;
    if (!canCreateTicket(member)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
    const messageBody = typeof body.body === 'string' ? body.body.trim() : '';
    const category = SUPPORT_CATEGORIES.includes(body.category) ? body.category : 'GENERAL';

    if (!subject || subject.length > MAX_SUBJECT_LEN) {
      return NextResponse.json(
        { error: `Subject is required and must be <= ${MAX_SUBJECT_LEN} chars` },
        { status: 400 },
      );
    }
    if (!messageBody || messageBody.length > MAX_BODY_LEN) {
      return NextResponse.json(
        { error: `Body is required and must be <= ${MAX_BODY_LEN} chars` },
        { status: 400 },
      );
    }

    // Look up the user's preferred language for the ticket record so
    // future SuperAdmin replies can render in the user's locale.
    const user = await prisma.user.findUnique({
      where: { id: member.userId },
      select: { selectedLanguage: true },
    });
    const language = user?.selectedLanguage || 'EN';

    const ticketNumber = await nextTicketNumber();

    const ticket = await prisma.supportTicket.create({
      data: {
        ticketNumber,
        subject,
        category,
        status: 'PENDING_ADMIN', // brand-new ticket awaits admin response
        language,
        accountId: member.accountId,
        createdById: member.userId,
        contextSiteId: body.contextSiteId || null,
        contextUrl: typeof body.contextUrl === 'string' ? body.contextUrl.slice(0, 500) : null,
        contextMeta: body.contextMeta && typeof body.contextMeta === 'object' ? body.contextMeta : null,
        lastMessageAt: new Date(),
        lastMessageById: member.userId,
        messages: {
          create: {
            senderId: member.userId,
            senderRole: 'USER',
            body: messageBody,
            readByUser: true,
            readByAdmin: false,
          },
        },
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
        createdAt: true,
      },
    });

    notifyAdminsOfUserActivity({
      ticket,
      message: { body: messageBody },
      action: 'created',
    });

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error) {
    console.error('[API/support/tickets] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
