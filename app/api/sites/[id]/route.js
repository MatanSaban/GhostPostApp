import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

// Get authenticated user with their account memberships
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
        isSuperAdmin: true,
        lastSelectedAccountId: true,
        accountMemberships: {
          select: {
            accountId: true,
            isOwner: true,
            role: {
              select: {
                permissions: true,
              },
            },
          },
        },
      },
    });

    return user;
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

// DELETE - Permanently remove a site and all related data
export async function DELETE(request, { params }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Site ID is required' },
        { status: 400 }
      );
    }

    // SuperAdmin can delete any site
    let site;
    if (user.isSuperAdmin) {
      site = await prisma.site.findUnique({ where: { id } });
    } else {
      const accountIds = user.accountMemberships.map(m => m.accountId);
      site = await prisma.site.findFirst({
        where: {
          id,
          accountId: { in: accountIds },
        },
      });
    }

    if (!site) {
      return NextResponse.json(
        { error: 'Site not found or unauthorized' },
        { status: 404 }
      );
    }

    if (!user.isSuperAdmin) {
      // Check if user has SITES_DELETE permission or is owner
      const membership = user.accountMemberships.find(m => m.accountId === site.accountId);
      const hasDeletePermission =
        membership?.isOwner ||
        membership?.role?.permissions?.includes('*') ||
        membership?.role?.permissions?.includes('SITES_DELETE');

      if (!hasDeletePermission) {
        return NextResponse.json(
          { error: 'Insufficient permissions to delete this site' },
          { status: 403 }
        );
      }
    }

    // Clean up references that don't have onDelete: Cascade in the schema
    // (these are plain siteId fields without a Prisma relation to Site)

    // 1. Clean UserInterview records linked to this site
    const userInterviews = await prisma.userInterview.findMany({
      where: { siteId: id },
      select: { id: true },
    });
    if (userInterviews.length > 0) {
      const interviewIds = userInterviews.map(i => i.id);
      // Delete interview messages first
      await prisma.interviewMessage.deleteMany({
        where: { interviewId: { in: interviewIds } },
      });
      // Delete the user interviews
      await prisma.userInterview.deleteMany({
        where: { siteId: id },
      });
    }

    // 2. Null out siteId in AiCreditsLog (keep historical records)
    await prisma.aiCreditsLog.updateMany({
      where: { siteId: id },
      data: { siteId: null },
    });

    // 3. Clear lastSelectedSiteId from AccountMember records
    await prisma.accountMember.updateMany({
      where: { lastSelectedSiteId: id },
      data: { lastSelectedSiteId: null },
    });

    // 4. Delete SiteSitemaps manually (self-referencing parent-child breaks cascade)
    //    First null out parent references, then delete all
    await prisma.siteSitemap.updateMany({
      where: { siteId: id, parentId: { not: null } },
      data: { parentId: null },
    });
    await prisma.siteSitemap.deleteMany({
      where: { siteId: id },
    });

    // 5. Hard delete the site — Prisma onDelete: Cascade handles:
    //    Interview, GoogleIntegration, Competitor, UserSitePreference,
    //    SiteEntityType, SiteEntity, SiteMenu,
    //    Keyword, Content, Redirection, SiteAudit
    await prisma.site.delete({
      where: { id },
    });

    console.log(`Site ${id} (${site.url}) permanently deleted by user ${user.id}`);

    return NextResponse.json({ success: true, message: 'Site permanently deleted' });
  } catch (error) {
    console.error('Failed to delete site:', error);
    return NextResponse.json(
      { error: 'Failed to remove site' },
      { status: 500 }
    );
  }
}
