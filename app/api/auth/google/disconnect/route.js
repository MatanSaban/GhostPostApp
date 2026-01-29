import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

/**
 * DELETE /api/auth/google/disconnect
 * Disconnects Google account from user
 * Only allowed if user has a password set
 */
export async function DELETE(request) {
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
    
    // Get the user with their auth providers
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        authProviders: true,
      },
    });
    
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }
    
    // Check if user has a password set
    if (!user.password) {
      return NextResponse.json(
        { error: 'You must set a password before disconnecting Google. This ensures you can still log in to your account.' },
        { status: 400 }
      );
    }
    
    // Find Google auth provider
    const googleProvider = user.authProviders.find(p => p.provider === 'GOOGLE');
    
    if (!googleProvider) {
      return NextResponse.json(
        { error: 'No Google account connected' },
        { status: 400 }
      );
    }
    
    // Delete the Google auth provider
    await prisma.authProvider.delete({
      where: { id: googleProvider.id },
    });
    
    return NextResponse.json({
      success: true,
      message: 'Google account disconnected successfully',
    });
    
  } catch (error) {
    console.error('Disconnect Google error:', error);
    return NextResponse.json(
      { error: 'An error occurred while disconnecting Google' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/auth/google/disconnect
 * Check if user can disconnect Google
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
      include: {
        authProviders: {
          where: { provider: 'GOOGLE' },
        },
      },
    });
    
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }
    
    const hasGoogle = user.authProviders.length > 0;
    const hasPassword = !!user.password;
    const canDisconnect = hasGoogle && hasPassword;
    
    return NextResponse.json({
      hasGoogle,
      hasPassword,
      canDisconnect,
      googleEmail: hasGoogle ? user.email : null,
    });
    
  } catch (error) {
    console.error('Check Google status error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
