import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

// PATCH - Update user's last selected site for their current account
export async function PATCH(request) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { siteId } = await request.json();

    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
    }

    // Get user with their last selected account
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { lastSelectedAccountId: true },
    });

    if (!user?.lastSelectedAccountId) {
      return NextResponse.json({ error: 'No account selected' }, { status: 400 });
    }

    // Verify the site belongs to this account
    const site = await prisma.site.findFirst({
      where: {
        id: siteId,
        accountId: user.lastSelectedAccountId,
      },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found in this account' }, { status: 404 });
    }

    // Update the user's last selected site for this account
    await prisma.accountMember.updateMany({
      where: {
        userId,
        accountId: user.lastSelectedAccountId,
      },
      data: {
        lastSelectedSiteId: siteId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating selected site:', error);
    return NextResponse.json({ error: 'Failed to update selected site' }, { status: 500 });
  }
}
