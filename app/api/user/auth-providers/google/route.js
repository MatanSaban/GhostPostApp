import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

// DELETE - Disconnect Google account
export async function DELETE() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get user to check if they have other auth methods
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        password: true,
        primaryAuthMethod: true,
        authProviders: {
          select: {
            id: true,
            provider: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Find Google provider
    const googleProvider = user.authProviders.find(p => p.provider === 'GOOGLE');
    if (!googleProvider) {
      return NextResponse.json({ error: 'Google account not connected' }, { status: 400 });
    }

    // Check if user has other ways to sign in
    const hasPassword = !!user.password;
    const hasOtherProviders = user.authProviders.length > 1;

    if (!hasPassword && !hasOtherProviders) {
      return NextResponse.json({ 
        error: 'Cannot disconnect Google. You need at least one way to sign in. Please set a password first.' 
      }, { status: 400 });
    }

    // Delete the Google auth provider
    await prisma.authProvider.delete({
      where: { id: googleProvider.id },
    });

    // If Google was the primary auth method, switch to EMAIL
    if (user.primaryAuthMethod === 'GOOGLE') {
      await prisma.user.update({
        where: { id: userId },
        data: { primaryAuthMethod: 'EMAIL' },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error disconnecting Google account:', error);
    return NextResponse.json({ error: 'Failed to disconnect Google account' }, { status: 500 });
  }
}
