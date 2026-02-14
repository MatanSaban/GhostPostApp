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

// DELETE - Remove a site (soft delete by setting isActive to false)
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

    // Soft delete - set isActive to false
    await prisma.site.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true, message: 'Site removed successfully' });
  } catch (error) {
    console.error('Failed to delete site:', error);
    return NextResponse.json(
      { error: 'Failed to remove site' },
      { status: 500 }
    );
  }
}
