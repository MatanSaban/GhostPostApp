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
        error: installResult.error,
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
    const checkResponse = await fetch(`${restUrl}/`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!checkResponse.ok) {
      return { 
        success: false, 
        error: 'Could not reach WordPress REST API. Make sure the site is accessible and REST API is enabled.',
        step: 'check_api'
      };
    }

    // Step 2: Get application password or authenticate
    // Using Basic Auth with Application Password (WP 5.6+)
    const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

    // Step 3: Check authentication
    const authCheckResponse = await fetch(`${restUrl}/wp/v2/users/me`, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
      },
    });

    if (!authCheckResponse.ok) {
      const authError = await authCheckResponse.json().catch(() => ({}));
      return { 
        success: false, 
        error: authError.message || 'Authentication failed. Check your username and password.',
        step: 'authenticate'
      };
    }

    const currentUser = await authCheckResponse.json();
    
    // Check if user has admin capabilities
    if (!currentUser.capabilities?.activate_plugins) {
      return {
        success: false,
        error: 'User does not have permission to install plugins. Admin access required.',
        step: 'check_permissions'
      };
    }

    // Step 4: Download plugin ZIP
    const pluginZipUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/api/sites/${site.id}/download-plugin`;
    
    // Step 5: Upload and install plugin via WP REST API
    // Note: The standard WP REST API doesn't support plugin installation directly
    // We need to use the /wp-json/wp/v2/plugins endpoint (WP 5.5+)
    
    // First, check if plugins endpoint exists
    const pluginsCheckResponse = await fetch(`${restUrl}/wp/v2/plugins`, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
      },
    });

    if (!pluginsCheckResponse.ok) {
      // Fallback: Provide manual installation instructions
      return {
        success: false,
        error: 'Automatic plugin installation not supported on this site. Please install the plugin manually.',
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
        });

        if (!activateResponse.ok) {
          return {
            success: false,
            error: 'Plugin is installed but could not be activated.',
            step: 'activate_plugin'
          };
        }
      }

      return { success: true };
    }

    // Install plugin from URL
    // This requires the plugin to be hosted on WP.org or a custom URL
    // For security, we'll use the sideload method
    
    const installResponse = await fetch(`${restUrl}/wp/v2/plugins`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        slug: 'ghost-post-connector',
        status: 'active',
      }),
    });

    // If plugin isn't on WP.org, this will fail
    // In that case, we need manual installation
    if (!installResponse.ok) {
      // Return instructions for manual installation
      return {
        success: false,
        error: 'Automatic installation failed. Please download and install the plugin manually from your Ghost Post dashboard.',
        step: 'install_plugin',
        manualRequired: true,
      };
    }

    return { success: true };
  } catch (error) {
    console.error('Auto-install error:', error);
    return {
      success: false,
      error: error.message || 'An unexpected error occurred during installation.',
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
