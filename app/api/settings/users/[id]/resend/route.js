import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember, memberHasPermission } from '@/lib/auth-permissions';
import crypto from 'crypto';
import { sendEmail, emailTemplates } from '@/lib/mailer';

// POST - Resend invitation email
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
      include: {
        account: {
          select: {
            name: true,
            defaultLanguage: true,
          },
        },
        role: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!targetMember) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    // Can only resend to pending invites
    if (targetMember.status !== 'PENDING') {
      return NextResponse.json({ error: 'Can only resend invite to pending members' }, { status: 400 });
    }

    // Generate a new invite token
    const newToken = crypto.randomBytes(32).toString('hex');

    // Update the invite token and timestamp
    await prisma.accountMember.update({
      where: { id: memberId },
      data: {
        inviteToken: newToken,
        invitedAt: new Date(),
        invitedBy: member.userId,
      },
    });

    // Get inviter name for the email
    const inviter = await prisma.user.findUnique({
      where: { id: member.userId },
      select: { firstName: true, lastName: true, email: true },
    });
    const inviterName = inviter?.firstName && inviter?.lastName 
      ? `${inviter.firstName} ${inviter.lastName}` 
      : inviter?.email || 'A team member';

    // Use account's default language for the email
    const language = targetMember.account.defaultLanguage || 'EN';

    // Send invitation email
    const inviteUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/auth/accept-invite?token=${newToken}`;
    const { subject, html, text } = emailTemplates.invitation({
      accountName: targetMember.account.name,
      inviterName,
      inviteUrl,
      roleName: targetMember.role?.name || 'Member',
      language,
    });

    await sendEmail({
      to: targetMember.inviteEmail,
      subject,
      html,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error resending invite:', error);
    return NextResponse.json({ error: 'Failed to resend invite' }, { status: 500 });
  }
}
