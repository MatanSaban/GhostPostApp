import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember, memberHasPermission } from '@/lib/auth-permissions';

/**
 * DELETE - Remove a member from the site
 */
export async function DELETE(request, { params }) {
  try {
    const result = await getCurrentAccountMember();
    if (!result.authorized) {
      return NextResponse.json({ error: result.error || 'Unauthorized' }, { status: 401 });
    }

    const member = result.member;
    const { id: siteId, memberId: siteMemberId } = await params;

    // Check permission - need SETTINGS_TEAM_EDIT to manage site team
    if (!member.isOwner && !memberHasPermission(member, 'SETTINGS_TEAM', 'EDIT')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Verify the site belongs to the account
    const site = await prisma.site.findFirst({
      where: {
        id: siteId,
        accountId: member.accountId,
      },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Find and verify the site member assignment
    const siteMember = await prisma.siteMember.findFirst({
      where: {
        id: siteMemberId,
        siteId,
      },
      include: {
        accountMember: {
          select: {
            accountId: true,
          },
        },
      },
    });

    if (!siteMember || siteMember.accountMember.accountId !== member.accountId) {
      return NextResponse.json({ error: 'Site member not found' }, { status: 404 });
    }

    // Delete the site member assignment
    await prisma.siteMember.delete({
      where: { id: siteMemberId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing site member:', error);
    return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 });
  }
}
