import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getGoogleAuthUrl } from '@/lib/google-oauth';

/**
 * GET /api/auth/google
 * Initiates Google OAuth flow
 * Query params:
 *   - mode: 'login' | 'register' | 'connect' (default: 'login')
 *   - consent: 'true' | 'false' - whether user has accepted terms (required for register)
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') || 'login';
    const consent = searchParams.get('consent') === 'true';
    
    // For registration, consent is required
    if (mode === 'register' && !consent) {
      return NextResponse.redirect(
        new URL('/auth/register?error=consent_required', request.url)
      );
    }
    
    // For connect mode, user must be logged in
    if (mode === 'connect') {
      const cookieStore = await cookies();
      const sessionCookie = cookieStore.get('user_session');
      
      if (!sessionCookie) {
        return NextResponse.redirect(
          new URL('/auth/login?error=login_required', request.url)
        );
      }
    }
    
    // Get locale from cookie or default to 'en'
    const cookieStore = await cookies();
    const localeCookie = cookieStore.get('ghost-post-locale');
    const locale = localeCookie?.value || 'en';
    
    // Store consent and mode in a cookie for callback to use
    const response = NextResponse.redirect(
      getGoogleAuthUrl({ mode, locale })
    );
    
    // Store OAuth state info in a secure cookie
    response.cookies.set('google_oauth_state', JSON.stringify({
      mode,
      consent,
      timestamp: Date.now(),
    }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 10, // 10 minutes
      path: '/',
    });
    
    return response;
    
  } catch (error) {
    console.error('Google OAuth initiation error:', error);
    return NextResponse.redirect(
      new URL('/auth/login?error=oauth_failed', request.url)
    );
  }
}
