import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember, memberHasPermission } from '@/lib/auth-permissions';

// PATCH - Update member (change role)
export async function PATCH(request, { params }) {
  try {
    const { id: memberId } = await params;

    const result = await getCurrentAccountMember();
    if (!result.authorized) {
      return NextResponse.json({ error: result.error || 'Unauthorized' }, { status: 401 });
    }

    const member = result.member;

    // Check permission
    if (!member.isOwner && !memberHasPermission(member, 'SETTINGS_USERS', 'EDIT')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Find the target member
    const targetMember = await prisma.accountMember.findFirst({
      where: {
        id: memberId,
        accountId: member.accountId,
      },
    });

    if (!targetMember) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    // Cannot modify owner
    if (targetMember.isOwner) {
      return NextResponse.json({ error: 'Cannot modify owner' }, { status: 400 });
    }

    // Cannot modify yourself (role change)
    if (targetMember.userId === member.userId) {
      return NextResponse.json({ error: 'Cannot change your own role' }, { status: 400 });
    }

    const body = await request.json();
    const { roleId } = body;

    if (!roleId) {
      return NextResponse.json({ error: 'Role ID is required' }, { status: 400 });
    }

    // Validate role exists and belongs to this account
    const role = await prisma.role.findFirst({
      where: {
        id: roleId,
        accountId: member.accountId,
      },
    });

    if (!role) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    // Prevent assigning Owner role
    if (role.name === 'Owner') {
      return NextResponse.json({ error: 'Cannot assign Owner role' }, { status: 400 });
    }

    // Update the member's role
    const updatedMember = await prisma.accountMember.update({
      where: { id: memberId },
      data: { roleId },
      include: {
        role: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      member: {
        id: updatedMember.id,
        roleId: updatedMember.roleId,
        role: updatedMember.role,
      },
    });
  } catch (error) {
    console.error('Error updating member:', error);
    return NextResponse.json({ error: 'Failed to update member' }, { status: 500 });
  }
}

// DELETE - Remove member from account
export async function DELETE(request, { params }) {
  try {
    const { id: memberId } = await params;

    const result = await getCurrentAccountMember();
    if (!result.authorized) {
      return NextResponse.json({ error: result.error || 'Unauthorized' }, { status: 401 });
    }

    const member = result.member;

    // Check permission
    if (!member.isOwner && !memberHasPermission(member, 'SETTINGS_USERS', 'EDIT')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Find the target member
    const targetMember = await prisma.accountMember.findFirst({
      where: {
        id: memberId,
        accountId: member.accountId,
      },
    });

    if (!targetMember) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    // Cannot remove owner
    if (targetMember.isOwner) {
      return NextResponse.json({ error: 'Cannot remove owner' }, { status: 400 });
    }

    // Cannot remove yourself
    if (targetMember.userId === member.userId) {
      return NextResponse.json({ error: 'Cannot remove yourself' }, { status: 400 });
    }

    // Mark as removed (soft delete)
    // Note: We don't clear inviteToken because the unique index includes null values
    // The REMOVED status is sufficient to prevent access
    await prisma.accountMember.update({
      where: { id: memberId },
      data: { status: 'REMOVED' },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing member:', error);
    return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 });
  }
}
