/**
 * AI Credits Usage Logs API
 * 
 * GET /api/credits/logs - Get usage logs for the current account
 * 
 * Query params:
 * - limit: Max number of logs to return (default: 50)
 * - offset: Offset for pagination (default: 0)
 * - type: Filter by type ('CREDIT' or 'DEBIT')
 * - siteId: Filter by site ID
 */

import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { getUsageLogs } from '@/lib/ai/credits-service';

const SESSION_COOKIE = 'user_session';

// Get authenticated user with account info
async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { 
        id: true, 
        email: true,
        lastSelectedAccountId: true,
        accountMemberships: {
          select: { accountId: true },
          take: 1,
        },
      },
    });

    return user;
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

export async function GET(request) {
  try {
    // Get authenticated user
    const user = await getAuthenticatedUser();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get accountId from user's membership or selected account
    const accountId = user.lastSelectedAccountId || 
                      user.accountMemberships?.[0]?.accountId || 
                      null;
    
    if (!accountId) {
      return Response.json({ error: 'No account found' }, { status: 400 });
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const type = searchParams.get('type') || null;
    const siteId = searchParams.get('siteId') || null;

    // Get usage logs
    const result = await getUsageLogs({
      accountId,
      limit,
      offset,
      type,
      siteId,
    });

    if (!result.success) {
      return Response.json({ error: result.error }, { status: 500 });
    }

    return Response.json({
      logs: result.logs,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      hasMore: result.hasMore,
    });
  } catch (error) {
    console.error('[API] Error fetching credits logs:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
