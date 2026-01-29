import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember, memberHasPermission } from '@/lib/auth-permissions';

// POST - Suspend a member
export async function POST(request, { params }) {
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

    // Cannot suspend owner
    if (targetMember.isOwner) {
      return NextResponse.json({ error: 'Cannot suspend owner' }, { status: 400 });
    }

    // Cannot suspend yourself
    if (targetMember.userId === member.userId) {
      return NextResponse.json({ error: 'Cannot suspend yourself' }, { status: 400 });
    }

    // Can only suspend active members
    if (targetMember.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Can only suspend active members' }, { status: 400 });
    }

    // Update status to suspended
    await prisma.accountMember.update({
      where: { id: memberId },
      data: { status: 'SUSPENDED' },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error suspending member:', error);
    return NextResponse.json({ error: 'Failed to suspend member' }, { status: 500 });
  }
}
