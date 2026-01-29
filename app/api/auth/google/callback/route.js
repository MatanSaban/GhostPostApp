import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { exchangeCodeForTokens, getGoogleUserInfo, parseState } from '@/lib/google-oauth';

const TEMP_REG_COOKIE = 'temp_reg_id';
const SESSION_COOKIE = 'user_session';

// Map registration steps to redirect paths
const STEP_REDIRECTS = {
  VERIFY: '/auth/register?step=verify',
  ACCOUNT_SETUP: '/auth/register?step=account-setup',
  INTERVIEW: '/auth/register?step=interview',
  PLAN: '/auth/register?step=plan',
  PAYMENT: '/auth/register?step=payment',
  COMPLETED: '/dashboard',
};

/**
 * GET /api/auth/google/callback
 * Handles Google OAuth callback
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const stateParam = searchParams.get('state');
    
    // Handle OAuth errors
    if (error) {
      console.error('Google OAuth error:', error);
      return NextResponse.redirect(
        new URL(`/auth/login?error=${error}`, request.url)
      );
    }
    
    if (!code) {
      return NextResponse.redirect(
        new URL('/auth/login?error=no_code', request.url)
      );
    }
    
    // Get OAuth state from cookie
    const cookieStore = await cookies();
    const oauthStateCookie = cookieStore.get('google_oauth_state');
    
    if (!oauthStateCookie) {
      return NextResponse.redirect(
        new URL('/auth/login?error=invalid_state', request.url)
      );
    }
    
    let oauthState;
    try {
      oauthState = JSON.parse(oauthStateCookie.value);
    } catch {
      return NextResponse.redirect(
        new URL('/auth/login?error=invalid_state', request.url)
      );
    }
    
    const { mode, consent } = oauthState;
    
    console.log('[Google OAuth Callback] Starting token exchange...');
    
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);
    
    console.log('[Google OAuth Callback] Token exchange successful, getting user info...');
    
    // Get user info from Google
    const googleUser = await getGoogleUserInfo(tokens.access_token);
    
    console.log('[Google OAuth Callback] Got user info:', googleUser.email, 'Mode:', mode);
    
    // Handle the OAuth callback
    const response = await handleOAuthCallback({
      mode,
      consent,
      googleUser,
      tokens,
      request,
      cookieStore,
    });
    
    console.log('[Google OAuth Callback] Callback handled successfully');
    
    // Clear the OAuth state cookie
    response.cookies.delete('google_oauth_state');
    
    return response;
    
  } catch (error) {
    console.error('[Google OAuth Callback] Error:', error.message, error.stack);
    return NextResponse.redirect(
      new URL('/auth/login?error=oauth_failed', request.url)
    );
  }
}

/**
 * Handle OAuth callback based on mode
 */
async function handleOAuthCallback({ mode, consent, googleUser, tokens, request, cookieStore }) {
  const normalizedEmail = googleUser.email.toLowerCase();
  
  switch (mode) {
    case 'register':
      return handleGoogleRegister({ consent, googleUser, normalizedEmail, tokens, request, cookieStore });
    
    case 'connect':
      return handleGoogleConnect({ googleUser, normalizedEmail, tokens, request, cookieStore });
    
    case 'login':
    default:
      return handleGoogleLogin({ googleUser, normalizedEmail, tokens, request, cookieStore });
  }
}

/**
 * Handle Google login
 */
async function handleGoogleLogin({ googleUser, normalizedEmail, tokens, request, cookieStore }) {
  console.log('[Google OAuth Login] Checking for existing auth provider...');
  
  // Check if user exists with this Google account
  const authProvider = await prisma.authProvider.findUnique({
    where: {
      provider_providerAccountId: {
        provider: 'GOOGLE',
        providerAccountId: googleUser.id,
      },
    },
    include: { user: true },
  });
  
  console.log('[Google OAuth Login] Auth provider found:', !!authProvider);
  
  if (authProvider?.user) {
    // User exists with Google - log them in
    const user = authProvider.user;
    
    // Check if user is active
    if (!user.isActive) {
      return NextResponse.redirect(
        new URL('/auth/login?error=account_deactivated', request.url)
      );
    }
    
    // Update last login and tokens
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }),
      prisma.authProvider.update({
        where: { id: authProvider.id },
        data: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || authProvider.refreshToken,
          expiresAt: tokens.expires_in ? Math.floor(Date.now() / 1000) + tokens.expires_in : null,
        },
      }),
    ]);
    
    // Determine redirect based on registration step
    const redirectTo = STEP_REDIRECTS[user.registrationStep] || '/dashboard';
    const isRegistrationComplete = user.registrationStep === 'COMPLETED';
    
    // Set session cookie
    const response = NextResponse.redirect(new URL(redirectTo, request.url));
    
    if (isRegistrationComplete || user.isSuperAdmin) {
      response.cookies.set(SESSION_COOKIE, user.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: '/',
      });
    }
    
    return response;
  }
  
  // Check if user exists by email (registered with credentials)
  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });
  
  if (existingUser) {
    // User exists but hasn't connected Google yet
    // Since Google verified the email, we can auto-connect and log them in
    
    // Check if user is active
    if (!existingUser.isActive) {
      return NextResponse.redirect(
        new URL('/auth/login?error=account_deactivated', request.url)
      );
    }
    
    // Auto-connect Google to this account
    await prisma.authProvider.create({
      data: {
        userId: existingUser.id,
        provider: 'GOOGLE',
        providerAccountId: googleUser.id,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expires_in ? Math.floor(Date.now() / 1000) + tokens.expires_in : null,
        isPrimary: false, // User already has credentials as primary
      },
    });
    
    // Update user with Google profile image if not set
    await prisma.user.update({
      where: { id: existingUser.id },
      data: { 
        lastLoginAt: new Date(),
        image: existingUser.image || googleUser.picture,
      },
    });
    
    // Determine redirect based on registration step
    const redirectTo = STEP_REDIRECTS[existingUser.registrationStep] || '/dashboard';
    const isRegistrationComplete = existingUser.registrationStep === 'COMPLETED';
    
    // Set session cookie
    const response = NextResponse.redirect(new URL(redirectTo, request.url));
    
    if (isRegistrationComplete || existingUser.isSuperAdmin) {
      response.cookies.set(SESSION_COOKIE, existingUser.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: '/',
      });
    }
    
    return response;
  }
  
  // Check if there's a temp registration
  const tempReg = await prisma.tempRegistration.findUnique({
    where: { email: normalizedEmail },
  });
  
  if (tempReg && new Date() < tempReg.expiresAt) {
    // Temp registration exists - redirect to continue registration
    return NextResponse.redirect(
      new URL('/auth/login?error=complete_registration', request.url)
    );
  }
  
  // No user found - redirect to register
  return NextResponse.redirect(
    new URL('/auth/register?error=no_account', request.url)
  );
}

/**
 * Handle Google registration
 */
async function handleGoogleRegister({ consent, googleUser, normalizedEmail, tokens, request, cookieStore }) {
  // Consent is required for registration
  if (!consent) {
    return NextResponse.redirect(
      new URL('/auth/register?error=consent_required', request.url)
    );
  }
  
  // Check if user already exists with this Google account
  const existingAuthProvider = await prisma.authProvider.findUnique({
    where: {
      provider_providerAccountId: {
        provider: 'GOOGLE',
        providerAccountId: googleUser.id,
      },
    },
    include: { user: true },
  });
  
  if (existingAuthProvider?.user) {
    // User already has an account with Google - log them in instead
    return handleGoogleLogin({ googleUser, normalizedEmail, tokens, request, cookieStore });
  }
  
  // Check if email is already registered
  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });
  
  if (existingUser) {
    return NextResponse.redirect(
      new URL('/auth/login?error=email_exists', request.url)
    );
  }
  
  // Delete any existing temp registration for this email
  await prisma.tempRegistration.deleteMany({
    where: { email: normalizedEmail },
  });
  
  // Create temp registration with Google data
  // For Google registration, we skip OTP verification since email is already verified by Google
  const tempReg = await prisma.tempRegistration.create({
    data: {
      email: normalizedEmail,
      firstName: googleUser.firstName || '',
      lastName: googleUser.lastName || '',
      password: null, // No password for Google registration
      authMethod: 'GOOGLE',
      googleId: googleUser.id,
      image: googleUser.picture,
      consentGiven: true,
      consentDate: new Date(),
      emailVerified: googleUser.emailVerified ? new Date() : null,
      currentStep: 'ACCOUNT_SETUP', // Skip verification for Google users
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  });
  
  // Set temp registration cookie
  const response = NextResponse.redirect(
    new URL('/auth/register?step=account-setup', request.url)
  );
  
  response.cookies.set(TEMP_REG_COOKIE, tempReg.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  });
  
  return response;
}

/**
 * Handle connecting Google to existing account
 */
async function handleGoogleConnect({ googleUser, normalizedEmail, tokens, request, cookieStore }) {
  // User must be logged in
  const sessionCookie = cookieStore.get(SESSION_COOKIE);
  
  if (!sessionCookie) {
    return NextResponse.redirect(
      new URL('/auth/login?error=login_required', request.url)
    );
  }
  
  const userId = sessionCookie.value;
  
  // Get the logged-in user
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });
  
  if (!user) {
    return NextResponse.redirect(
      new URL('/auth/login?error=invalid_session', request.url)
    );
  }
  
  // Check if this Google account is already connected to another user
  const existingProvider = await prisma.authProvider.findUnique({
    where: {
      provider_providerAccountId: {
        provider: 'GOOGLE',
        providerAccountId: googleUser.id,
      },
    },
  });
  
  if (existingProvider && existingProvider.userId !== userId) {
    return NextResponse.redirect(
      new URL('/dashboard/settings?error=google_already_connected', request.url)
    );
  }
  
  // Check if user already has Google connected
  const userGoogleProvider = await prisma.authProvider.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: 'GOOGLE',
      },
    },
  });
  
  if (userGoogleProvider) {
    // Update existing provider
    await prisma.authProvider.update({
      where: { id: userGoogleProvider.id },
      data: {
        providerAccountId: googleUser.id,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expires_in ? Math.floor(Date.now() / 1000) + tokens.expires_in : null,
      },
    });
  } else {
    // Create new provider connection
    await prisma.authProvider.create({
      data: {
        userId,
        provider: 'GOOGLE',
        providerAccountId: googleUser.id,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expires_in ? Math.floor(Date.now() / 1000) + tokens.expires_in : null,
        isPrimary: !user.password, // Make primary if no password
      },
    });
    
    // Update user image if not set
    if (!user.image && googleUser.picture) {
      await prisma.user.update({
        where: { id: userId },
        data: { image: googleUser.picture },
      });
    }
  }
  
  return NextResponse.redirect(
    new URL('/dashboard/settings?success=google_connected', request.url)
  );
}
