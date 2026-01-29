import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember, memberHasPermission } from '@/lib/auth-permissions';

// GET - Fetch all users/members for the account
export async function GET(request) {
  try {
    const result = await getCurrentAccountMember();
    if (!result.authorized) {
      return NextResponse.json({ error: result.error || 'Unauthorized' }, { status: 401 });
    }

    const member = result.member;

    // Check permission - use SETTINGS_USERS for viewing users settings
    if (!member.isOwner && !memberHasPermission(member, 'SETTINGS_USERS', 'VIEW')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const members = await prisma.accountMember.findMany({
      where: { 
        accountId: member.accountId,
        status: { not: 'REMOVED' }, // Don't show removed members
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            image: true,
          },
        },
        role: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [
        { isOwner: 'desc' },
        { joinedAt: 'asc' },
      ],
    });

    const formattedMembers = members.map(m => ({
      id: m.id,
      userId: m.userId,
      roleId: m.roleId,
      isOwner: m.isOwner,
      status: m.status,
      invitedAt: m.invitedAt?.toISOString() || null,
      joinedAt: m.joinedAt?.toISOString() || null,
      inviteEmail: m.inviteEmail || null,
      user: m.user ? {
        id: m.user.id,
        email: m.user.email,
        firstName: m.user.firstName,
        lastName: m.user.lastName,
        image: m.user.image,
      } : null,
      role: m.role ? {
        id: m.role.id,
        name: m.role.name,
      } : null,
      isCurrentUser: m.userId === member.userId,
    }));

    return NextResponse.json({ members: formattedMembers });
  } catch (error) {
    console.error('Error fetching members:', error);
    return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 });
  }
}
