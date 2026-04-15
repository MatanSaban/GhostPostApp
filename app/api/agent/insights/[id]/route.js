import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) return null;
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        isSuperAdmin: true,
        lastSelectedAccountId: true,
        accountMemberships: { select: { accountId: true } },
      },
    });
  } catch {
    return null;
  }
}

/**
 * PATCH /api/agent/insights/[id]
 * Body: { action: "approve" | "reject" | "dismiss" }
 */
export async function PATCH(request, { params }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const insight = await prisma.agentInsight.findUnique({
      where: { id },
      include: { site: { select: { accountId: true } } },
    });

    if (!insight) {
      return NextResponse.json({ error: 'Insight not found' }, { status: 404 });
    }

    // Prisma doesn't support nested include on non-relation, so check manually
    const site = await prisma.site.findUnique({
      where: { id: insight.siteId },
      select: { accountId: true },
    });

    const hasAccess = user.isSuperAdmin || user.accountMemberships.some(m => m.accountId === site?.accountId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { action } = body;

    if (!['approve', 'reject', 'dismiss'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action. Must be: approve, reject, or dismiss' }, { status: 400 });
    }

    let updateData = {};

    switch (action) {
      case 'approve':
        if (insight.status !== 'PENDING') {
          return NextResponse.json({ error: 'Insight is not pending' }, { status: 400 });
        }
        updateData = { status: 'APPROVED', approvedAt: new Date(), approvedBy: user.id };
        break;
      case 'reject':
        if (insight.status !== 'PENDING') {
          return NextResponse.json({ error: 'Insight is not pending' }, { status: 400 });
        }
        updateData = { status: 'REJECTED', rejectedAt: new Date() };
        break;
      case 'dismiss':
        updateData = { dismissedAt: new Date() };
        break;
    }

    const updated = await prisma.agentInsight.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('[Agent API] PATCH insight error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
