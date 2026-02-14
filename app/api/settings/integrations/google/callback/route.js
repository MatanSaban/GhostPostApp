import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import {
  exchangeIntegrationCode,
  getGoogleEmail,
  parseIntegrationState,
} from '@/lib/google-integration';

const SESSION_COOKIE = 'user_session';

/**
 * GET /api/settings/integrations/google/callback
 * OAuth callback from Google for integration flow
 */
export async function GET(request) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const settingsUrl = `${baseUrl}/dashboard/settings?tab=integrations`;

  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const stateParam = searchParams.get('state');
    const error = searchParams.get('error');

    // User denied access
    if (error) {
      console.log('[Google Integration Callback] User denied:', error);
      return NextResponse.redirect(`${settingsUrl}&integrationError=access_denied`);
    }

    if (!code || !stateParam) {
      return NextResponse.redirect(`${settingsUrl}&integrationError=missing_params`);
    }

    // Verify user is logged in
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) {
      return NextResponse.redirect(`${baseUrl}/auth/login?error=login_required`);
    }

    // Parse and validate state
    let state;
    try {
      state = parseIntegrationState(stateParam);
    } catch {
      return NextResponse.redirect(`${settingsUrl}&integrationError=invalid_state`);
    }

    const { siteId } = state;
    if (!siteId) {
      return NextResponse.redirect(`${settingsUrl}&integrationError=missing_site`);
    }

    // Verify user has access to this site
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, accountMemberships: { select: { accountId: true } } },
    });

    const site = await prisma.site.findFirst({
      where: {
        id: siteId,
        accountId: { in: user.accountMemberships.map((m) => m.accountId) },
      },
    });

    if (!site) {
      return NextResponse.redirect(`${settingsUrl}&integrationError=site_not_found`);
    }

    // Exchange code for tokens
    const tokens = await exchangeIntegrationCode(code);
    console.log('[Google Integration Callback] Token exchange successful');

    // Get Google email
    const googleEmail = await getGoogleEmail(tokens.access_token);

    // Calculate token expiry
    const tokenExpiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;

    // Extract granted scopes
    const scopes = tokens.scope ? tokens.scope.split(' ') : [];

    // Upsert integration record
    await prisma.googleIntegration.upsert({
      where: { siteId },
      create: {
        siteId,
        connectedBy: userId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || null,
        tokenExpiresAt,
        googleEmail,
        scopes,
      },
      update: {
        connectedBy: userId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || undefined, // Keep old if not provided
        tokenExpiresAt,
        googleEmail,
        scopes,
      },
    });

    console.log('[Google Integration Callback] Integration saved for site:', siteId);
    return NextResponse.redirect(`${settingsUrl}&integrationSuccess=true`);
  } catch (err) {
    console.error('[Google Integration Callback] Error:', err);
    return NextResponse.redirect(`${settingsUrl}&integrationError=server_error`);
  }
}
