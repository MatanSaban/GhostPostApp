import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { getPlanLimits } from '@/lib/account-utils';

const SESSION_COOKIE = 'user_session';

// Helper to get authenticated user with permissions
async function getAuthenticatedUser(siteId) {
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE)?.value;

  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      isSuperAdmin: true,
      accountMemberships: {
        select: {
          accountId: true,
          isOwner: true,
          role: { select: { permissions: true } },
        },
      },
    },
  });

  return user;
}

// GET - Get site report configuration
export async function GET(request, { params }) {
  try {
    const { id: siteId } = await params;
    const user = await getAuthenticatedUser(siteId);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get site with account and plan
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      include: {
        account: {
          include: {
            subscription: {
              include: {
                plan: true,
              },
            },
          },
        },
      },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Check if user belongs to this account
    const membership = user.accountMemberships.find(m => m.accountId === site.accountId);
    if (!user.isSuperAdmin && !membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Check if plan has white-label reports feature
    const plan = site.account.subscription?.plan || null;
    const planLimits = getPlanLimits(plan);
    const hasFeature = planLimits.whiteLabelReports === true;

    // Get recent reports for this site
    let recentReports = [];
    try {
      recentReports = await prisma.reportArchive.findMany({
        where: { siteId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          month: true,
          status: true,
          pdfUrl: true,
          createdAt: true,
        },
      });
    } catch (e) {
      // ReportArchive model might not exist yet
      console.log('ReportArchive not available:', e.message);
    }

    return NextResponse.json({
      hasFeature,
      config: site.reportConfig || null,
      recentReports,
    });
  } catch (error) {
    console.error('Error fetching report config:', error);
    return NextResponse.json({ error: 'Failed to fetch configuration' }, { status: 500 });
  }
}

// PUT - Update site report configuration
export async function PUT(request, { params }) {
  try {
    const { id: siteId } = await params;
    const user = await getAuthenticatedUser(siteId);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get site with account and plan
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      include: {
        account: {
          include: {
            subscription: {
              include: {
                plan: true,
              },
            },
          },
        },
      },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Check permissions
    const membership = user.accountMemberships.find(m => m.accountId === site.accountId);
    if (!user.isSuperAdmin && !membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const hasEditPermission = user.isSuperAdmin || 
                               membership?.isOwner ||
                               membership?.role?.permissions?.includes('SITES_EDIT') ||
                               membership?.role?.permissions?.includes('REPORTS_MANAGE');

    if (!hasEditPermission) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Check if plan has white-label reports feature
    const plan = site.account.subscription?.plan || null;
    const planLimits = getPlanLimits(plan);
    if (!planLimits.whiteLabelReports) {
      return NextResponse.json({ error: 'Feature not available in your plan' }, { status: 403 });
    }

    const body = await request.json();
    const { enabled, recipients, deliveryMode, includeAiSummary, includeActions, includeHealthScore } = body;

    // Validate recipients (should be array of valid emails)
    const validRecipients = Array.isArray(recipients) 
      ? recipients.filter(email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      : [];

    // Update site report config
    const updatedSite = await prisma.site.update({
      where: { id: siteId },
      data: {
        reportConfig: {
          enabled: enabled === true,
          recipients: validRecipients,
          deliveryMode: deliveryMode || 'manual',
          includeAiSummary: includeAiSummary !== false,
          includeActions: includeActions !== false,
          includeHealthScore: includeHealthScore !== false,
          updatedAt: new Date().toISOString(),
        },
      },
    });

    return NextResponse.json({
      success: true,
      config: updatedSite.reportConfig,
    });
  } catch (error) {
    console.error('Error updating report config:', error);
    return NextResponse.json({ error: 'Failed to update configuration' }, { status: 500 });
  }
}
