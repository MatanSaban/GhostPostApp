import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET - Verify an invite token and return invite details
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    // Find the member invitation
    const member = await prisma.accountMember.findUnique({
      where: { inviteToken: token },
      include: {
        account: {
          select: {
            id: true,
            name: true,
          },
        },
        role: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!member) {
      return NextResponse.json({ error: 'Invalid invitation', code: 'INVALID' }, { status: 404 });
    }

    // Check if already accepted
    if (member.status === 'ACTIVE') {
      return NextResponse.json({ error: 'Invitation already accepted', code: 'ALREADY_ACCEPTED' }, { status: 400 });
    }

    // Check if removed or suspended
    if (member.status === 'REMOVED' || member.status === 'SUSPENDED') {
      return NextResponse.json({ error: 'Invitation is no longer valid', code: 'INVALID' }, { status: 400 });
    }

    // Check if expired (7 days)
    const invitedAt = member.invitedAt || member.createdAt;
    const expirationDate = new Date(invitedAt);
    expirationDate.setDate(expirationDate.getDate() + 7);
    
    if (new Date() > expirationDate) {
      return NextResponse.json({ error: 'Invitation has expired', code: 'EXPIRED' }, { status: 400 });
    }

    // Check if user already exists
    const existingUser = member.inviteEmail 
      ? await prisma.user.findUnique({ where: { email: member.inviteEmail } })
      : null;

    // Get inviter info if available
    let inviterName = null;
    if (member.invitedBy) {
      const inviter = await prisma.user.findUnique({
        where: { id: member.invitedBy },
        select: { firstName: true, lastName: true, email: true },
      });
      inviterName = inviter?.firstName && inviter?.lastName
        ? `${inviter.firstName} ${inviter.lastName}`
        : inviter?.email || null;
    }

    return NextResponse.json({
      email: member.inviteEmail,
      accountId: member.account.id,
      accountName: member.account.name,
      roleId: member.role.id,
      roleName: member.role.name,
      inviterName,
      existingUser: !!existingUser,
      language: member.inviteLanguage || 'EN',
    });
  } catch (error) {
    console.error('Error verifying invite token:', error);
    return NextResponse.json({ error: 'Failed to verify invitation' }, { status: 500 });
  }
}
