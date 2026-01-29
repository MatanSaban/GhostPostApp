import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { encryptCredential, clearSiteCredentials } from '@/lib/site-keys';

const SESSION_COOKIE = 'user_session';

/**
 * POST /api/sites/[id]/auto-install
 * Start auto-install process with temporary WP credentials
 * 
 * Body:
 *   wpAdminUrl: string (e.g., "https://example.com/wp-admin")
 *   username: string
 *   password: string
 */
export async function POST(request, { params }) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { wpAdminUrl, username, password } = body;

    if (!wpAdminUrl || !username || !password) {
      return NextResponse.json(
        { error: 'Missing required fields: wpAdminUrl, username, password' },
        { status: 400 }
      );
    }

    // Get user and verify access
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        accountMemberships: {
          select: { accountId: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get site
    const site = await prisma.site.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        url: true,
        siteKey: true,
        siteSecret: true,
        accountId: true,
        connectionStatus: true,
      },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Verify access
    const hasAccess = user.accountMemberships.some(m => m.accountId === site.accountId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Encrypt credentials and store temporarily (max 5 minutes)
    const encryptedUsername = encryptCredential(username);
    const encryptedPassword = encryptCredential(password);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await prisma.site.update({
      where: { id },
      data: {
        wpAdminUrl,
        wpAdminUsername: encryptedUsername,
        wpAdminPassword: encryptedPassword,
        autoInstallExpiresAt: expiresAt,
        connectionStatus: 'CONNECTING',
      },
    });

    // Attempt auto-install
    const installResult = await performAutoInstall(site, wpAdminUrl, username, password);

    // Clear credentials immediately after attempt
    await clearSiteCredentials(prisma, id);

    if (!installResult.success) {
      await prisma.site.update({
        where: { id },
        data: { connectionStatus: 'ERROR' },
      });
      
      return NextResponse.json({
        success: false,
        errorCode: installResult.errorCode,
        errorDetail: installResult.error,
        step: installResult.step,
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'Plugin installed successfully',
      connectionStatus: 'CONNECTED',
    });
  } catch (error) {
    console.error('Auto-install error:', error);
    return NextResponse.json(
      { error: 'Failed to auto-install plugin' },
      { status: 500 }
    );
  }
}

/**
 * Perform auto-installation of the plugin
 */
async function performAutoInstall(site, wpAdminUrl, username, password) {
  try {
    // Normalize URL
    const baseUrl = wpAdminUrl.replace(/\/wp-admin\/?$/, '');
    const restUrl = `${baseUrl}/wp-json`;

    // Step 1: Check if site is reachable and has REST API
    let checkResponse;
    try {
      checkResponse = await fetch(`${restUrl}/`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15000), // 15 second timeout
      });
    } catch (fetchError) {
      return { 
        success: false, 
        errorCode: 'REST_API_UNREACHABLE',
        error: fetchError.message,
        step: 'check_api'
      };
    }

    if (!checkResponse.ok) {
      return { 
        success: false, 
        errorCode: 'REST_API_ERROR',
        error: `HTTP ${checkResponse.status}`,
        step: 'check_api'
      };
    }

    // Step 2: Get application password or authenticate
    // Using Basic Auth with Application Password (WP 5.6+)
    const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

    // Step 3: Check authentication
    let authCheckResponse;
    try {
      authCheckResponse = await fetch(`${restUrl}/wp/v2/users/me`, {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(15000),
      });
    } catch (authError) {
      return { 
        success: false, 
        errorCode: 'AUTH_REQUEST_FAILED',
        error: authError.message,
        step: 'authenticate'
      };
    }

    if (!authCheckResponse.ok) {
      const authError = await authCheckResponse.json().catch(() => ({}));
      return { 
        success: false, 
        errorCode: 'AUTH_FAILED',
        error: authError.code || 'invalid_credentials',
        step: 'authenticate'
      };
    }

    const currentUser = await authCheckResponse.json();
    
    // Check if user has admin capabilities
    if (!currentUser.capabilities?.activate_plugins) {
      return {
        success: false,
        errorCode: 'INSUFFICIENT_PERMISSIONS',
        step: 'check_permissions'
      };
    }

    // Step 4: Check plugins endpoint
    const pluginsCheckResponse = await fetch(`${restUrl}/wp/v2/plugins`, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!pluginsCheckResponse.ok) {
      return {
        success: false,
        errorCode: 'PLUGINS_API_UNAVAILABLE',
        step: 'check_plugins_api'
      };
    }

    // Check if plugin is already installed
    const installedPlugins = await pluginsCheckResponse.json();
    const existingPlugin = installedPlugins.find(p => 
      p.textdomain === 'ghost-post-connector' || p.plugin?.includes('ghost-post-connector')
    );

    if (existingPlugin) {
      // Plugin already installed, just activate if needed
      if (existingPlugin.status !== 'active') {
        const activateResponse = await fetch(`${restUrl}/wp/v2/plugins/${encodeURIComponent(existingPlugin.plugin)}`, {
          method: 'PUT',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'active' }),
          signal: AbortSignal.timeout(15000),
        });

        if (!activateResponse.ok) {
          return {
            success: false,
            errorCode: 'ACTIVATION_FAILED',
            step: 'activate_plugin'
          };
        }
      }

      return { success: true };
    }

    // Plugin not installed - auto-install from URL is not supported by WP REST API
    // The plugin must be installed manually
    return {
      success: false,
      errorCode: 'MANUAL_INSTALL_REQUIRED',
      step: 'install_plugin',
    };
  } catch (error) {
    console.error('Auto-install error:', error);
    return {
      success: false,
      errorCode: 'UNKNOWN_ERROR',
      error: error.message,
      step: 'unknown'
    };
  }
}

/**
 * GET /api/sites/[id]/auto-install
 * Check auto-install status
 */
export async function GET(request, { params }) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const site = await prisma.site.findUnique({
      where: { id },
      select: {
        connectionStatus: true,
        lastPingAt: true,
        pluginVersion: true,
      },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    return NextResponse.json({
      connectionStatus: site.connectionStatus,
      lastPingAt: site.lastPingAt,
      pluginVersion: site.pluginVersion,
    });
  } catch (error) {
    console.error('Check auto-install status error:', error);
    return NextResponse.json(
      { error: 'Failed to check status' },
      { status: 500 }
    );
  }
}
