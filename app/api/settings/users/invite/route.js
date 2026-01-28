import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember, memberHasPermission } from '@/lib/auth-permissions';
import { sendEmail, emailTemplates } from '@/lib/mailer';
import crypto from 'crypto';

// POST - Invite a new user to the account
export async function POST(request) {
  try {
    const result = await getCurrentAccountMember();
    if (!result.authorized) {
      return NextResponse.json({ error: result.error || 'Unauthorized' }, { status: 401 });
    }

    const member = result.member;

    // Check permission - need SETTINGS_USERS_EDIT to invite users
    if (!member.isOwner && !memberHasPermission(member, 'SETTINGS_USERS', 'EDIT')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { email, roleId, language = 'EN' } = body;

    // Validate email
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

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

    // Prevent assigning Owner role via invite
    if (role.name === 'Owner') {
      return NextResponse.json({ error: 'Cannot invite users as Owner' }, { status: 400 });
    }

    // Check if user already exists in the system
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Check if there's an existing member record (including removed ones)
    const existingMember = await prisma.accountMember.findFirst({
      where: {
        accountId: member.accountId,
        OR: [
          { inviteEmail: normalizedEmail },
          { user: { email: normalizedEmail } },
        ],
      },
    });

    if (existingMember) {
      if (existingMember.status === 'PENDING') {
        return NextResponse.json({ error: 'An invite has already been sent to this email' }, { status: 400 });
      }
      if (existingMember.status === 'ACTIVE') {
        return NextResponse.json({ error: 'This user is already a member of the account' }, { status: 400 });
      }
      if (existingMember.status === 'SUSPENDED') {
        return NextResponse.json({ error: 'This user is suspended. Use the activate action instead.' }, { status: 400 });
      }
      
      // REMOVED status - reactivate with new invite
      const inviteToken = crypto.randomBytes(32).toString('hex');
      
      const inviteLanguageCode = (body.language || 'EN').toUpperCase();
      
      const reactivatedMember = await prisma.accountMember.update({
        where: { id: existingMember.id },
        data: {
          roleId: roleId,
          invitedBy: member.userId,
          invitedAt: new Date(),
          inviteEmail: normalizedEmail,
          inviteToken: inviteToken,
          inviteLanguage: inviteLanguageCode,
          status: 'PENDING',
          userId: existingUser?.id || null,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          role: {
            select: {
              id: true,
              name: true,
            },
          },
          account: {
            select: {
              name: true,
            },
          },
        },
      });

      // Get inviter's name for the email
      const inviter = await prisma.user.findUnique({
        where: { id: member.userId },
        select: { firstName: true, lastName: true, email: true },
      });
      const inviterName = inviter?.firstName && inviter?.lastName 
        ? `${inviter.firstName} ${inviter.lastName}` 
        : inviter?.email || 'Someone';

      // Build invite URL
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
      const inviteUrl = `${baseUrl}/auth/accept-invite?token=${inviteToken}`;

      // Send invitation email
      const emailContent = emailTemplates.invitation({
        accountName: reactivatedMember.account.name || 'Ghost Post',
        inviterName,
        inviteUrl,
        roleName: reactivatedMember.role.name,
        language: (body.language || 'EN').toUpperCase(),
      });

      await sendEmail({
        to: normalizedEmail,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      });

      return NextResponse.json({
        success: true,
        member: {
          id: reactivatedMember.id,
          email: normalizedEmail,
          status: reactivatedMember.status,
          role: reactivatedMember.role,
          invitedAt: reactivatedMember.invitedAt?.toISOString(),
        },
      });
    }

    // Generate a unique invite token
    const inviteToken = crypto.randomBytes(32).toString('hex');
    const inviteLanguageCode = (language || 'EN').toUpperCase();

    // Create the pending member record
    const newMember = await prisma.accountMember.create({
      data: {
        accountId: member.accountId,
        userId: existingUser?.id || null,
        roleId: roleId,
        invitedBy: member.userId,
        invitedAt: new Date(),
        inviteEmail: normalizedEmail,
        inviteToken: inviteToken,
        inviteLanguage: inviteLanguageCode,
        status: 'PENDING',
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        role: {
          select: {
            id: true,
            name: true,
          },
        },
        account: {
          select: {
            name: true,
          },
        },
      },
    });

    // Get inviter's name for the email
    const inviter = await prisma.user.findUnique({
      where: { id: member.userId },
      select: { firstName: true, lastName: true, email: true },
    });
    const inviterName = inviter?.firstName && inviter?.lastName 
      ? `${inviter.firstName} ${inviter.lastName}` 
      : inviter?.email || 'Someone';

    // Build invite URL
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const inviteUrl = `${baseUrl}/auth/accept-invite?token=${inviteToken}`;

    // Send invitation email
    const emailContent = emailTemplates.invitation({
      accountName: newMember.account.name || 'Ghost Post',
      inviterName,
      inviteUrl,
      roleName: newMember.role.name,
      language: language.toUpperCase(),
    });

    await sendEmail({
      to: normalizedEmail,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });

    return NextResponse.json({
      success: true,
      member: {
        id: newMember.id,
        email: normalizedEmail,
        status: newMember.status,
        role: newMember.role,
        invitedAt: newMember.invitedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error inviting user:', error);
    return NextResponse.json({ error: 'Failed to invite user' }, { status: 500 });
  }
}
