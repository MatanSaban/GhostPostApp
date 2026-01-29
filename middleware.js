import { NextResponse } from 'next/server';

const LOCALE_COOKIE = 'ghost-post-locale';

/**
 * Get default locale based on domain
 * app.ghostpost.co.il → Hebrew (he)
 * app.ghostpost.com → English (en)
 */
function getDefaultLocaleForDomain(host) {
  if (host?.includes('ghostpost.co.il')) {
    return 'he';
  }
  return 'en';
}

export function middleware(request) {
  const response = NextResponse.next();
  
  // Check if locale cookie exists
  const localeCookie = request.cookies.get(LOCALE_COOKIE);
  
  if (!localeCookie) {
    // No locale cookie - set default based on domain
    const host = request.headers.get('host') || '';
    const defaultLocale = getDefaultLocaleForDomain(host);
    
    response.cookies.set(LOCALE_COOKIE, defaultLocale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1 year
      sameSite: 'lax',
    });
  }
  
  return response;
}

export const config = {
  matcher: [
    // Only match paths that need middleware processing
    '/((?!_next|api|static|.*\\..*).*)',
  ],
};
