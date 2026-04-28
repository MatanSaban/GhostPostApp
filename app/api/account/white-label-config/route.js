import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { getPlanLimits } from '@/lib/account-utils';

const SESSION_COOKIE = 'user_session';

// Helper to get user's current account with plan info and owner email
async function getUserAccount(userId) {
  const membership = await prisma.accountMember.findFirst({
    where: { userId, status: 'ACTIVE' },
    include: {
      account: {
        include: {
          subscription: {
            include: {
              plan: true,
            },
          },
          members: {
            where: { isOwner: true },
            include: {
              user: {
                select: { email: true },
              },
            },
            take: 1,
          },
        },
      },
    },
    orderBy: { joinedAt: 'desc' },
  });
  
  // Return account with plan attached at top level for getPlanLimits compatibility
  const account = membership?.account;
  if (account) {
    account.plan = account.subscription?.plan || null;
    account.ownerEmail = account.members?.[0]?.user?.email || null;
  }
  return account;
}

// GET - Get white-label configuration
export async function GET(request) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const account = await getUserAccount(userId);
    if (!account) {
      return NextResponse.json({ error: 'No account found' }, { status: 404 });
    }

    // Check if plan has white-label reports feature
    const planLimits = getPlanLimits(account.plan);
    const hasFeature = planLimits.whiteLabelReports === true;

    return NextResponse.json({
      hasFeature,
      config: account.whiteLabelConfig || null,
      ownerEmail: account.ownerEmail || null,
    });
  } catch (error) {
    console.error('Error fetching white-label config:', error);
    return NextResponse.json({ error: 'Failed to fetch configuration' }, { status: 500 });
  }
}

// PUT - Update white-label configuration
export async function PUT(request) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const account = await getUserAccount(userId);
    if (!account) {
      return NextResponse.json({ error: 'No account found' }, { status: 404 });
    }

    // Check if plan has white-label reports feature
    const planLimits = getPlanLimits(account.plan);
    if (!planLimits.whiteLabelReports) {
      return NextResponse.json({ error: 'Feature not available in your plan' }, { status: 403 });
    }

    // Verify user has permission to edit account
    const membership = await prisma.accountMember.findFirst({
      where: { userId, accountId: account.id },
      include: {
        role: {
          select: { permissions: true },
        },
      },
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isSuperAdmin: true },
    });

    const isSuperAdmin = user?.isSuperAdmin;
    const hasEditPermission = membership?.role?.permissions?.includes('ACCOUNT_EDIT') || 
                               membership?.role?.permissions?.includes('REPORTS_MANAGE');

    if (!isSuperAdmin && !hasEditPermission) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const body = await request.json();

    // Merge with existing config instead of replacing it. Previously we
    // rebuilt whiteLabelConfig from the request body alone, so a PUT that
    // sent only `{agencyLogo: url}` wiped agencyName / accentColor /
    // replyToEmail back to defaults - and vice-versa, the "Save" button
    // on the White-Label section (which sends only accentColor +
    // replyToEmail) silently erased the uploaded logo.
    const existing =
      account.whiteLabelConfig && typeof account.whiteLabelConfig === 'object'
        ? account.whiteLabelConfig
        : {};

    const nextConfig = {
      agencyName: existing.agencyName || '',
      agencyLogo: existing.agencyLogo || null,
      accentColor: existing.accentColor || '#6366f1',
      replyToEmail: existing.replyToEmail || '',
      ...existing,
    };

    if (Object.prototype.hasOwnProperty.call(body, 'agencyName')) {
      nextConfig.agencyName = body.agencyName || '';
    }
    if (Object.prototype.hasOwnProperty.call(body, 'agencyLogo')) {
      nextConfig.agencyLogo = body.agencyLogo || null;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'accentColor')) {
      nextConfig.accentColor = body.accentColor || '#6366f1';
    }
    if (Object.prototype.hasOwnProperty.call(body, 'replyToEmail')) {
      nextConfig.replyToEmail = body.replyToEmail || '';
    }
    // Contact info shown under the agency logo in PDF reports + the
    // in-platform preview. Empty strings are acceptable (the renderer
    // skips the line when the field is empty).
    if (Object.prototype.hasOwnProperty.call(body, 'website')) {
      nextConfig.website = body.website || '';
    }
    if (Object.prototype.hasOwnProperty.call(body, 'phone')) {
      nextConfig.phone = body.phone || '';
    }

    nextConfig.updatedAt = new Date().toISOString();

    const updatedAccount = await prisma.account.update({
      where: { id: account.id },
      data: { whiteLabelConfig: nextConfig },
    });

    return NextResponse.json({
      success: true,
      config: updatedAccount.whiteLabelConfig,
    });
  } catch (error) {
    console.error('Error updating white-label config:', error);
    return NextResponse.json({ error: 'Failed to update configuration' }, { status: 500 });
  }
}
