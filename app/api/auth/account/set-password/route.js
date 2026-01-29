import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

/**
 * POST /api/auth/account/set-password
 * Sets or updates password for user account
 * Allows Google users to add password for credentials login
 */
export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE);
    
    if (!sessionCookie) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    
    const userId = sessionCookie.value;
    const body = await request.json();
    const { currentPassword, newPassword, confirmPassword } = body;
    
    // Validate new password
    if (!newPassword || newPassword.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters long' },
        { status: 400 }
      );
    }
    
    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { error: 'Passwords do not match' },
        { status: 400 }
      );
    }
    
    // Get the user
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });
    
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }
    
    // If user already has a password, verify current password
    if (user.password) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: 'Current password is required' },
          { status: 400 }
        );
      }
      
      const isCurrentValid = await bcrypt.compare(currentPassword, user.password);
      
      if (!isCurrentValid) {
        return NextResponse.json(
          { error: 'Current password is incorrect' },
          { status: 400 }
        );
      }
    }
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    
    // Update user password
    await prisma.user.update({
      where: { id: userId },
      data: { 
        password: hashedPassword,
        primaryAuthMethod: 'EMAIL', // Set primary auth method to EMAIL if adding password
      },
    });
    
    return NextResponse.json({
      success: true,
      message: user.password ? 'Password updated successfully' : 'Password set successfully',
      isNewPassword: !user.password,
    });
    
  } catch (error) {
    console.error('Set password error:', error);
    return NextResponse.json(
      { error: 'An error occurred while setting password' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/auth/account/set-password
 * Check if user has a password set
 */
export async function GET(request) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(SESSION_COOKIE);
    
    if (!sessionCookie) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    
    const userId = sessionCookie.value;
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        password: true,
        primaryAuthMethod: true,
      },
    });
    
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      hasPassword: !!user.password,
      primaryAuthMethod: user.primaryAuthMethod,
      email: user.email,
    });
    
  } catch (error) {
    console.error('Check password status error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
