/**
 * GET /api/account/addon-for-resource?resourceKey=siteAudits
 *
 * Returns all active AddOn products for a given resource key (RECURRING first,
 * then ONE_TIME). Also exposes the first one as `addOn` for backward compat.
 * Used by LimitReachedModal to display pricing.
 */

import { NextResponse } from 'next/server';
import { getCurrentAccountMember } from '@/lib/auth-permissions';
import { getAddOnsForResource } from '@/lib/account-limits';

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

    // Read locale from query param (lowercase 'en'/'he') → map to Prisma Language enum (uppercase 'EN'/'HE')
    const rawLocale = searchParams.get('locale') || 'en';
    const locale = rawLocale.toUpperCase();

    const addOns = await getAddOnsForResource(resourceKey, locale);

    return NextResponse.json({ addOns, addOn: addOns[0] || null });
  } catch (error) {
    console.error('[API/account/addon-for-resource] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
