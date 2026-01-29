import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember, memberHasPermission } from '@/lib/auth-permissions';

// POST - Activate a suspended member
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

    // Can only activate suspended members
    if (targetMember.status !== 'SUSPENDED') {
      return NextResponse.json({ error: 'Can only activate suspended members' }, { status: 400 });
    }

    // Update status to active
    await prisma.accountMember.update({
      where: { id: memberId },
      data: { status: 'ACTIVE' },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error activating member:', error);
    return NextResponse.json({ error: 'Failed to activate member' }, { status: 500 });
  }
}
