import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import {
  getIntegrationAuthUrl,
  exchangeIntegrationCode,
  getGoogleEmail,
  listGAProperties,
  listGSCSites,
  parseIntegrationState,
  refreshAccessToken,
} from '@/lib/google-integration';

const SESSION_COOKIE = 'user_session';

async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) return null;
    return prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, accountMemberships: { select: { accountId: true } } },
    });
  } catch {
    return null;
  }
}

/**
 * GET /api/settings/integrations/google
 * Returns the current integration status for the selected site
 * Query: ?siteId=xxx
 */
export async function GET(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 });

    // Verify user has access to this site
    const site = await prisma.site.findFirst({
      where: {
        id: siteId,
        accountId: { in: user.accountMemberships.map((m) => m.accountId) },
      },
      select: { id: true, url: true },
    });
    if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 });

    let integration = await prisma.googleIntegration.findUnique({
      where: { siteId },
      select: {
        id: true,
        gaConnected: true,
        gaPropertyId: true,
        gaPropertyName: true,
        gscConnected: true,
        gscSiteUrl: true,
        googleEmail: true,
        scopes: true,
        refreshToken: true,
        tokenExpiresAt: true,
        updatedAt: true,
      },
    });

    // Validate token: if the integration has a refresh token, try refreshing it.
    // If the token was revoked (user removed app permissions from Google),
    // reset the integration so the UI shows the correct disconnected state.
    if (integration?.refreshToken) {
      try {
        const refreshed = await refreshAccessToken(integration.refreshToken);
        // Token is valid — update it in DB
        await prisma.googleIntegration.update({
          where: { id: integration.id },
          data: {
            accessToken: refreshed.access_token,
            tokenExpiresAt: new Date(Date.now() + (refreshed.expires_in || 3600) * 1000),
          },
        });
      } catch (err) {
        const isRevoked = /invalid_grant|revoked|unauthorized/i.test(err.message);
        console.warn('[API/integrations/google] Token refresh failed:', err.message, isRevoked ? '(revoked)' : '(transient)');
        if (isRevoked) {
          // Token revoked: clear auth tokens but PRESERVE GA/GSC property selections
          // so user can reconnect without reconfiguring
          await prisma.googleIntegration.update({
            where: { id: integration.id },
            data: {
              accessToken: '',
              refreshToken: null,
              tokenExpiresAt: null,
            },
          });
          // Re-read integration so the response reflects cleared tokens
          integration = await prisma.googleIntegration.findUnique({
            where: { siteId },
            select: {
              id: true,
              gaConnected: true,
              gaPropertyId: true,
              gaPropertyName: true,
              gscConnected: true,
              gscSiteUrl: true,
              googleEmail: true,
              scopes: true,
              refreshToken: true,
              tokenExpiresAt: true,
              updatedAt: true,
            },
          });
        }
        // For transient errors: just proceed with the existing integration data
      }
    }

    // Auto-connect: if no integration exists but user logged in with Google,
    // bootstrap the GoogleIntegration from the AuthProvider tokens
    if (!integration) {
      const authProvider = await prisma.authProvider.findUnique({
        where: { userId_provider: { userId: user.id, provider: 'GOOGLE' } },
      });

      if (authProvider?.refreshToken) {
        try {
          // Refresh to get a current access token
          let accessToken = authProvider.accessToken;
          const isExpired = authProvider.expiresAt && (authProvider.expiresAt * 1000) < Date.now();
          if (isExpired || !accessToken) {
            const refreshed = await refreshAccessToken(authProvider.refreshToken);
            accessToken = refreshed.access_token;
          }

          // Get Google email
          const googleEmail = await getGoogleEmail(accessToken);

          // Create the GoogleIntegration record
          const created = await prisma.googleIntegration.create({
            data: {
              siteId,
              connectedBy: user.id,
              accessToken,
              refreshToken: authProvider.refreshToken,
              tokenExpiresAt: authProvider.expiresAt
                ? new Date(authProvider.expiresAt * 1000)
                : null,
              googleEmail,
              scopes: authProvider.scope ? authProvider.scope.split(' ') : [],
            },
          });

          integration = {
            id: created.id,
            gaConnected: false,
            gaPropertyId: null,
            gaPropertyName: null,
            gscConnected: false,
            gscSiteUrl: null,
            googleEmail,
            scopes: created.scopes,
            updatedAt: created.updatedAt,
          };

          console.log('[API/integrations/google] Auto-connected Google from auth provider for site:', siteId);
        } catch (err) {
          console.error('[API/integrations/google] Auto-connect failed:', err.message);
          // Not fatal — user can still manually connect
        }
      }
    }

    // Check if integration has GA/GSC scopes
    const hasGAScope = integration?.scopes?.some(s => s.includes('analytics'));
    const hasGSCScope = integration?.scopes?.some(s => s.includes('webmasters'));

    // Strip sensitive fields before sending to client
    const safeIntegration = integration ? {
      id: integration.id,
      gaConnected: integration.gaConnected,
      gaPropertyId: integration.gaPropertyId,
      gaPropertyName: integration.gaPropertyName,
      gscConnected: integration.gscConnected,
      gscSiteUrl: integration.gscSiteUrl,
      googleEmail: integration.googleEmail,
      scopes: integration.scopes,
      updatedAt: integration.updatedAt,
    } : null;

    return NextResponse.json({
      connected: !!integration,
      integration: safeIntegration,
      siteUrl: site.url,
      needsScopes: integration ? (!hasGAScope || !hasGSCScope) : false,
      needsGAScope: integration ? !hasGAScope : false,
      needsGSCScope: integration ? !hasGSCScope : false,
    });
  } catch (error) {
    console.error('[API/integrations/google] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/settings/integrations/google
 * Actions: connect, disconnect, save-ga, save-gsc, list-properties, list-sites
 */
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { action, siteId } = body;

    if (!siteId) return NextResponse.json({ error: 'siteId required' }, { status: 400 });

    // Verify access
    const site = await prisma.site.findFirst({
      where: {
        id: siteId,
        accountId: { in: user.accountMemberships.map((m) => m.accountId) },
      },
    });
    if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 });

    switch (action) {
      case 'connect': {
        // Get locale and Google email hint for smoother UX
        const cookieStore = await cookies();
        const locale = cookieStore.get('ghost-post-locale')?.value || 'en';
        const existingInteg = await prisma.googleIntegration.findUnique({
          where: { siteId },
          select: { googleEmail: true },
        });
        const authUrl = getIntegrationAuthUrl({
          siteId,
          locale,
          loginHint: existingInteg?.googleEmail || undefined,
        });
        return NextResponse.json({ authUrl });
      }

      case 'disconnect': {
        await prisma.googleIntegration.deleteMany({ where: { siteId } });
        return NextResponse.json({ success: true });
      }

      case 'list-properties': {
        const integration = await prisma.googleIntegration.findUnique({
          where: { siteId },
        });
        if (!integration) {
          return NextResponse.json({ error: 'Not connected' }, { status: 400 });
        }

        let accessToken = integration.accessToken;
        // Refresh token if expired
        if (integration.tokenExpiresAt && new Date(integration.tokenExpiresAt) < new Date()) {
          if (!integration.refreshToken) {
            return NextResponse.json({ error: 'Token expired, reconnect required' }, { status: 401 });
          }
          const tokens = await refreshAccessToken(integration.refreshToken);
          accessToken = tokens.access_token;
          await prisma.googleIntegration.update({
            where: { siteId },
            data: {
              accessToken: tokens.access_token,
              tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
            },
          });
        }

        try {
          const properties = await listGAProperties(accessToken);
          return NextResponse.json({ properties });
        } catch (err) {
          // If scope is insufficient, tell the client to re-auth with GA scopes
          console.error('[API/integrations/google] list-properties failed:', err.message);
          return NextResponse.json({ properties: [], needsScopes: true });
        }
      }

      case 'list-sites': {
        const integration = await prisma.googleIntegration.findUnique({
          where: { siteId },
        });
        if (!integration) {
          return NextResponse.json({ error: 'Not connected' }, { status: 400 });
        }

        let accessToken = integration.accessToken;
        if (integration.tokenExpiresAt && new Date(integration.tokenExpiresAt) < new Date()) {
          if (!integration.refreshToken) {
            return NextResponse.json({ error: 'Token expired, reconnect required' }, { status: 401 });
          }
          const tokens = await refreshAccessToken(integration.refreshToken);
          accessToken = tokens.access_token;
          await prisma.googleIntegration.update({
            where: { siteId },
            data: {
              accessToken: tokens.access_token,
              tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
            },
          });
        }

        try {
          const sites = await listGSCSites(accessToken);
          return NextResponse.json({ sites });
        } catch (err) {
          console.error('[API/integrations/google] list-sites failed:', err.message);
          return NextResponse.json({ sites: [], needsScopes: true });
        }
      }

      case 'save-ga': {
        const { propertyId, propertyName } = body;
        if (!propertyId) {
          return NextResponse.json({ error: 'propertyId required' }, { status: 400 });
        }
        await prisma.googleIntegration.update({
          where: { siteId },
          data: {
            gaConnected: true,
            gaPropertyId: propertyId,
            gaPropertyName: propertyName || propertyId,
          },
        });
        return NextResponse.json({ success: true });
      }

      case 'save-gsc': {
        const { gscSiteUrl } = body;
        if (!gscSiteUrl) {
          return NextResponse.json({ error: 'gscSiteUrl required' }, { status: 400 });
        }
        await prisma.googleIntegration.update({
          where: { siteId },
          data: {
            gscConnected: true,
            gscSiteUrl,
          },
        });
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('[API/integrations/google] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
