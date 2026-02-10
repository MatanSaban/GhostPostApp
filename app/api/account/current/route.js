import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember } from '@/lib/auth-permissions';

/**
 * GET - Get the current user's selected account details
 * This returns the full account data for the user's currently selected account
 */
export async function GET() {
  try {
    const { authorized, member, error, isSuperAdmin } = await getCurrentAccountMember();

    if (!authorized) {
      return NextResponse.json({ error }, { status: 401 });
    }

    // SuperAdmin can see any account, but we need a specific one
    if (isSuperAdmin && !member?.accountId) {
      // Get first account if superadmin has no selected account
      const firstAccount = await prisma.account.findFirst({
        select: {
          id: true,
          name: true,
          slug: true,
          logo: true,
          website: true,
          industry: true,
          timezone: true,
          defaultLanguage: true,
          billingEmail: true,
          generalEmail: true,
          isActive: true,
          aiCreditsBalance: true,
          createdAt: true,
        },
      });

      if (!firstAccount) {
        return NextResponse.json({ account: null, message: 'No accounts exist' });
      }

      return NextResponse.json({ account: firstAccount, isSuperAdmin: true });
    }

    const accountId = member?.accountId;

    if (!accountId) {
      return NextResponse.json({ error: 'No account selected' }, { status: 400 });
    }

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        name: true,
        slug: true,
        logo: true,
        website: true,
        industry: true,
        timezone: true,
        defaultLanguage: true,
        billingEmail: true,
        generalEmail: true,
        isActive: true,
        aiCreditsBalance: true,
        createdAt: true,
      },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    return NextResponse.json({ 
      account, 
      isSuperAdmin,
      isOwner: member?.isOwner || false,
    });
  } catch (error) {
    console.error('Error fetching current account:', error);
    return NextResponse.json({ error: 'Failed to fetch account' }, { status: 500 });
  }
}
