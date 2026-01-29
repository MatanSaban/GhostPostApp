import { NextResponse } from 'next/server';

export function middleware(request) {
  // Simple middleware - no locale URL prefixing
  // Locale is handled via cookies/context, not URL paths
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Only match paths that need middleware processing
    '/((?!_next|api|static|.*\\..*).*)',
  ],
};
