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
 * POST /api/agent/execute
 * Body: { insightId: string }
 * 
 * Execute an approved agent action.
 * Currently read-only phase - only certain action types are supported.
 */
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { insightId } = body;

    if (!insightId) {
      return NextResponse.json({ error: 'insightId is required' }, { status: 400 });
    }

    const insight = await prisma.agentInsight.findUnique({ where: { id: insightId } });

    if (!insight) {
      return NextResponse.json({ error: 'Insight not found' }, { status: 404 });
    }

    // Verify access
    const site = await prisma.site.findUnique({
      where: { id: insight.siteId },
      select: { accountId: true },
    });

    const hasAccess = user.isSuperAdmin || user.accountMemberships.some(m => m.accountId === site?.accountId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (insight.status !== 'APPROVED') {
      return NextResponse.json({ error: 'Insight must be approved before execution' }, { status: 400 });
    }

    if (!insight.actionType) {
      return NextResponse.json({ error: 'This insight has no executable action' }, { status: 400 });
    }

    // Execute the action based on type
    try {
      const result = await executeAction(insight);

      await prisma.agentInsight.update({
        where: { id: insightId },
        data: {
          status: 'EXECUTED',
          executedAt: new Date(),
          executionResult: result,
        },
      });

      return NextResponse.json({ success: true, result });
    } catch (execError) {
      await prisma.agentInsight.update({
        where: { id: insightId },
        data: {
          status: 'FAILED',
          executionResult: { error: execError.message },
        },
      });

      return NextResponse.json({ error: 'Action execution failed', details: execError.message }, { status: 500 });
    }
  } catch (error) {
    console.error('[Agent API] Execute error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Execute an agent action based on its type.
 * Phase 1: Limited to read-only / non-destructive actions.
 */
async function executeAction(insight) {
  switch (insight.actionType) {
    case 'generate_meta':
      // TODO: Phase 2 - generate meta titles/descriptions using AI
      return { message: 'Meta generation is not yet implemented. Coming soon.' };

    case 'update_meta':
      // TODO: Phase 2 - push meta updates to WordPress
      return { message: 'Meta update push is not yet implemented. Coming soon.' };

    case 'add_internal_link':
      // TODO: Phase 2 - suggest internal links
      return { message: 'Internal link suggestions coming soon.' };

    case 'push_to_wp':
      // TODO: Phase 2 - push content changes to WordPress
      return { message: 'WordPress push is not yet implemented. Coming soon.' };

    default:
      return { message: `Action type "${insight.actionType}" is not yet supported.` };
  }
}
