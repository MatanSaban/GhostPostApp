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
    const { authorized, member, error } = await getCurrentAccountMember();
    if (!authorized || !member?.accountId) {
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
