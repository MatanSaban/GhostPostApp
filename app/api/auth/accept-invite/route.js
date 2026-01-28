import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';
const ACCOUNT_COOKIE = 'current_account';

// POST - Accept an invitation (create new user or verify existing user)
export async function POST(request) {
  try {
    const body = await request.json();
    const { token, firstName, lastName, password, existingUser } = body;

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    if (!password) {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 });
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
      return NextResponse.json({ error: 'Invalid invitation' }, { status: 404 });
    }

    // Check if already accepted
    if (member.status === 'ACTIVE') {
      return NextResponse.json({ error: 'Invitation already accepted' }, { status: 400 });
    }

    // Check if removed or suspended
    if (member.status === 'REMOVED' || member.status === 'SUSPENDED') {
      return NextResponse.json({ error: 'Invitation is no longer valid' }, { status: 400 });
    }

    // Check if expired (7 days)
    const invitedAt = member.invitedAt || member.createdAt;
    const expirationDate = new Date(invitedAt);
    expirationDate.setDate(expirationDate.getDate() + 7);
    
    if (new Date() > expirationDate) {
      return NextResponse.json({ error: 'Invitation has expired' }, { status: 400 });
    }

    let user;

    if (existingUser) {
      // Existing user - verify password
      user = await prisma.user.findUnique({
        where: { email: member.inviteEmail },
      });

      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      if (!user.password) {
        return NextResponse.json({ error: 'Please login using your original sign-in method' }, { status: 400 });
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
        return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
      }
    } else {
      // New user - create account
      if (!firstName || !lastName) {
        return NextResponse.json({ error: 'First name and last name are required' }, { status: 400 });
      }

      if (password.length < 8) {
        return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
      }

      // Check if user already exists
      const existingUserCheck = await prisma.user.findUnique({
        where: { email: member.inviteEmail },
      });

      if (existingUserCheck) {
        return NextResponse.json({ error: 'A user with this email already exists. Please sign in instead.' }, { status: 409 });
      }

      // Hash password and create user
      const hashedPassword = await bcrypt.hash(password, 12);

      user = await prisma.user.create({
        data: {
          email: member.inviteEmail,
          firstName,
          lastName,
          password: hashedPassword,
          isActive: true,
          registrationStep: 'COMPLETED', // Skip registration flow since they're joining via invite
        },
      });
    }

    // Update the member record
    await prisma.accountMember.update({
      where: { id: member.id },
      data: {
        userId: user.id,
        status: 'ACTIVE',
        // Don't set inviteToken to null - unique constraint issue with MongoDB
        // The token is already invalidated by status change to ACTIVE
        joinedAt: new Date(),
      },
    });

    // Update user's last login and set their selected account
    await prisma.user.update({
      where: { id: user.id },
      data: { 
        lastLoginAt: new Date(),
        lastSelectedAccountId: member.accountId,
      },
    });

    // Set session cookie
    const cookieStore = await cookies();
    
    cookieStore.set(SESSION_COOKIE, user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    // Set account cookie to the newly joined account
    cookieStore.set(ACCOUNT_COOKIE, member.accountId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      account: {
        id: member.account.id,
        name: member.account.name,
      },
      role: member.role.name,
    });
  } catch (error) {
    console.error('Error accepting invitation:', error);
    return NextResponse.json({ error: 'Failed to accept invitation' }, { status: 500 });
  }
}
