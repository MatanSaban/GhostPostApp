import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { exchangeCodeForTokens, getGoogleUserInfo, parseState } from '@/lib/google-oauth';
import { createDraftUserAndAccount, purgeDraftUserByEmail } from '@/lib/draft-account';

const SESSION_COOKIE = 'user_session';
const REG_DONE_COOKIE = 'reg_done';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

// Map registration steps to redirect paths
const STEP_REDIRECTS = {
  VERIFY: '/auth/register?step=verify',
  ACCOUNT_SETUP: '/auth/register?step=account-setup',
  INTERVIEW: '/auth/register?step=interview',
  PLAN: '/auth/register?step=plan',
  PAYMENT: '/auth/register?step=payment',
  COMPLETED: '/dashboard',
};

function setSessionCookie(response, userId, { completed = false } = {}) {
  response.cookies.set(SESSION_COOKIE, userId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
  if (completed) {
    response.cookies.set(REG_DONE_COOKIE, '1', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });
  } else {
    response.cookies.delete(REG_DONE_COOKIE);
  }
}

/**
 * GET /api/auth/google/callback
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      console.error('Google OAuth error:', error);
      return NextResponse.redirect(new URL(`/auth/login?error=${error}`, request.url));
    }

    if (!code) {
      return NextResponse.redirect(new URL('/auth/login?error=no_code', request.url));
    }

    const cookieStore = await cookies();
    const oauthStateCookie = cookieStore.get('google_oauth_state');

    if (!oauthStateCookie) {
      return NextResponse.redirect(new URL('/auth/login?error=invalid_state', request.url));
    }

    let oauthState;
    try {
      oauthState = JSON.parse(oauthStateCookie.value);
    } catch {
      return NextResponse.redirect(new URL('/auth/login?error=invalid_state', request.url));
    }

    const { mode, consent } = oauthState;

    const tokens = await exchangeCodeForTokens(code);
    const googleUser = await getGoogleUserInfo(tokens.access_token);

    const response = await handleOAuthCallback({
      mode,
      consent,
      googleUser,
      tokens,
      request,
      cookieStore,
    });

    response.cookies.delete('google_oauth_state');

    return response;
  } catch (error) {
    console.error('[Google OAuth Callback] Error:', error.message, error.stack);
    return NextResponse.redirect(new URL('/auth/login?error=oauth_failed', request.url));
  }
}

async function handleOAuthCallback({ mode, consent, googleUser, tokens, request, cookieStore }) {
  const normalizedEmail = googleUser.email.toLowerCase();

  switch (mode) {
    case 'register':
      return handleGoogleRegister({ consent, googleUser, normalizedEmail, tokens, request });
    case 'connect':
      return handleGoogleConnect({ googleUser, normalizedEmail, tokens, request, cookieStore });
    case 'login':
    default:
      return handleGoogleLogin({ googleUser, normalizedEmail, tokens, request });
  }
}

/**
 * Existing user logs in via Google.
 */
async function handleGoogleLogin({ googleUser, normalizedEmail, tokens, request }) {
  const authProvider = await prisma.authProvider.findUnique({
    where: {
      provider_providerAccountId: {
        provider: 'GOOGLE',
        providerAccountId: googleUser.id,
      },
    },
    include: { user: true },
  });

  if (authProvider?.user) {
    const user = authProvider.user;

    if (!user.isActive) {
      return NextResponse.redirect(new URL('/auth/login?error=account_deactivated', request.url));
    }

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

    const redirectTo = user.isSuperAdmin
      ? '/dashboard'
      : (STEP_REDIRECTS[user.registrationStep] || '/dashboard');

    const response = NextResponse.redirect(new URL(redirectTo, request.url));
    // Always set session — drafts and completed users alike. Middleware enforces
    // that drafts can only traverse /auth/register paths.
    setSessionCookie(response, user.id, {
      completed: user.registrationStep === 'COMPLETED' || !!user.isSuperAdmin,
    });
    return response;
  }

  // Google account isn't linked yet but a user with this email may exist via credentials.
  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existingUser) {
    if (!existingUser.isActive) {
      return NextResponse.redirect(new URL('/auth/login?error=account_deactivated', request.url));
    }

    // Google verified the email, so auto-link to the existing user.
    await prisma.authProvider.create({
      data: {
        userId: existingUser.id,
        provider: 'GOOGLE',
        providerAccountId: googleUser.id,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expires_in ? Math.floor(Date.now() / 1000) + tokens.expires_in : null,
        isPrimary: !existingUser.password,
      },
    });

    await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        lastLoginAt: new Date(),
        image: existingUser.image || googleUser.picture,
        // If the user was a draft stuck in VERIFY, Google verifying them lets
        // them skip the OTP step.
        ...(existingUser.registrationStep === 'VERIFY'
          ? { emailVerified: new Date(), registrationStep: 'ACCOUNT_SETUP' }
          : {}),
      },
    });

    const freshUser = await prisma.user.findUnique({
      where: { id: existingUser.id },
      select: { registrationStep: true, isSuperAdmin: true },
    });

    const redirectTo = freshUser.isSuperAdmin
      ? '/dashboard'
      : (STEP_REDIRECTS[freshUser.registrationStep] || '/dashboard');

    const response = NextResponse.redirect(new URL(redirectTo, request.url));
    setSessionCookie(response, existingUser.id, {
      completed: freshUser.registrationStep === 'COMPLETED' || !!freshUser.isSuperAdmin,
    });
    return response;
  }

  // No user at all — auto-register with Google.
  return handleAutoGoogleRegister({ googleUser, normalizedEmail, tokens, request });
}

/**
 * Login with a Google account that has no matching user yet. Registers them
 * with consent implied.
 */
async function handleAutoGoogleRegister({ googleUser, normalizedEmail, tokens, request }) {
  await purgeDraftUserByEmail(normalizedEmail);

  const { user } = await createDraftUserAndAccount({
    email: normalizedEmail,
    firstName: googleUser.firstName || '',
    lastName: googleUser.lastName || '',
    password: null,
    image: googleUser.picture || null,
    authMethod: 'GOOGLE',
    googleId: googleUser.id,
    googleTokens: tokens,
    emailVerified: googleUser.emailVerified ? new Date() : null,
    consentGiven: true,
    consentDate: new Date(),
    registrationStep: 'ACCOUNT_SETUP',
  });

  const response = NextResponse.redirect(
    new URL(STEP_REDIRECTS.ACCOUNT_SETUP, request.url)
  );
  setSessionCookie(response, user.id);
  return response;
}

/**
 * Explicit "register with Google" button. Requires consent.
 */
async function handleGoogleRegister({ consent, googleUser, normalizedEmail, tokens, request }) {
  if (!consent) {
    return NextResponse.redirect(new URL('/auth/register?error=consent_required', request.url));
  }

  // If the Google account is already linked to a user, log them in instead.
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
    return handleGoogleLogin({ googleUser, normalizedEmail, tokens, request });
  }

  // Check for a completed user on this email.
  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existingUser && existingUser.registrationStep === 'COMPLETED') {
    return NextResponse.redirect(new URL('/auth/login?error=email_exists', request.url));
  }

  // Wipe any stale draft on this email before creating a fresh one.
  await purgeDraftUserByEmail(normalizedEmail);

  const { user } = await createDraftUserAndAccount({
    email: normalizedEmail,
    firstName: googleUser.firstName || '',
    lastName: googleUser.lastName || '',
    password: null,
    image: googleUser.picture || null,
    authMethod: 'GOOGLE',
    googleId: googleUser.id,
    googleTokens: tokens,
    emailVerified: googleUser.emailVerified ? new Date() : null,
    consentGiven: true,
    consentDate: new Date(),
    registrationStep: 'ACCOUNT_SETUP',
  });

  const response = NextResponse.redirect(
    new URL(STEP_REDIRECTS.ACCOUNT_SETUP, request.url)
  );
  setSessionCookie(response, user.id);
  return response;
}

/**
 * Connect a Google account to a logged-in user's account.
 */
async function handleGoogleConnect({ googleUser, normalizedEmail, tokens, request, cookieStore }) {
  const sessionCookie = cookieStore.get(SESSION_COOKIE);

  if (!sessionCookie) {
    return NextResponse.redirect(new URL('/auth/login?error=login_required', request.url));
  }

  const userId = sessionCookie.value;

  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    return NextResponse.redirect(new URL('/auth/login?error=invalid_session', request.url));
  }

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

  const userGoogleProvider = await prisma.authProvider.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: 'GOOGLE',
      },
    },
  });

  if (userGoogleProvider) {
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
    await prisma.authProvider.create({
      data: {
        userId,
        provider: 'GOOGLE',
        providerAccountId: googleUser.id,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expires_in ? Math.floor(Date.now() / 1000) + tokens.expires_in : null,
        isPrimary: !user.password,
      },
    });

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
