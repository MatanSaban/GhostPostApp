/**
 * GET /api/account/usage?resourceKey=siteAudits
 *
 * Lightweight endpoint to check usage vs. limits for a specific resource.
 * Used by SmartActionButton for real-time quota display.
 */

import { NextResponse } from 'next/server';
import { getCurrentAccountMember } from '@/lib/auth-permissions';
import { getAccountUsage } from '@/lib/account-limits';

export async function GET(request) {
  try {
    const { authorized, member, error, isSuperAdmin } = await getCurrentAccountMember();
    if (!authorized) {
      return NextResponse.json({ error: error || 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const resourceKey = searchParams.get('resourceKey');

    if (!resourceKey) {
      return NextResponse.json(
        { error: 'Missing resourceKey parameter' },
        { status: 400 }
      );
    }

    // SuperAdmins are not bound to an account and have no quota - return a
    // permissive payload so UI gates (SmartActionButton, chat popup, etc.)
    // render an unblocked state instead of triggering the global 401 logout.
    if (isSuperAdmin || !member?.accountId) {
      return NextResponse.json({
        resourceKey,
        used: 0,
        limit: null,
        remaining: null,
        isLimitReached: false,
      });
    }

    const usage = await getAccountUsage(member.accountId, resourceKey);

    return NextResponse.json(usage);
  } catch (error) {
    console.error('[API/account/usage] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
