import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import JSZip from 'jszip';
import { PLUGIN_VERSION } from '@/app/api/plugin/version';

const SESSION_COOKIE = 'user_session';

// Plugin template files (imported as strings)
import { getPluginMainFile } from './plugin-templates/main';
import { getPluginConfigFile } from './plugin-templates/config';
import { getPluginReadme } from './plugin-templates/readme';
import { getPluginUninstall } from './plugin-templates/uninstall';
import { getClassGhostPost } from './plugin-templates/class-ghost-post';
import { getClassApiHandler } from './plugin-templates/class-api-handler';
import { getClassRequestValidator } from './plugin-templates/class-request-validator';
import { getClassContentManager } from './plugin-templates/class-content-manager';
import { getClassMediaManager } from './plugin-templates/class-media-manager';
import { getClassSeoManager } from './plugin-templates/class-seo-manager';
import { getClassCptManager } from './plugin-templates/class-cpt-manager';
import { getClassAcfManager } from './plugin-templates/class-acf-manager';
import { getClassUpdater } from './plugin-templates/class-updater';
import { getClassEntitySync } from './plugin-templates/class-entity-sync';
import { getClassRedirectionsManager } from './plugin-templates/class-redirections-manager';
import { getAdminPage } from './plugin-templates/admin-page';
import { getAdminCss } from './plugin-templates/admin-css';
import { getAdminJs } from './plugin-templates/admin-js';
import { getRedirectionsPage } from './plugin-templates/redirections-page';
import { getClassI18n } from './plugin-templates/class-gp-i18n';
import { getSettingsPage } from './plugin-templates/settings-page';

/**
 * GET /api/sites/[id]/download-plugin
 * Generate and download a pre-configured WordPress plugin ZIP
 */
export async function GET(request, { params }) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Get user with account memberships
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

    // Get site and verify access
    const site = await prisma.site.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        url: true,
        siteKey: true,
        siteSecret: true,
        accountId: true,
        sitePermissions: true,
      },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Verify user has access to this site's account
    const hasAccess = user.isSuperAdmin || user.accountMemberships.some(m => m.accountId === site.accountId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Generate site keys if they don't exist (for sites created before this feature)
    let { siteKey, siteSecret, sitePermissions } = site;
    
    if (!siteKey || !siteSecret) {
      const { generateSiteKey, generateSiteSecret, DEFAULT_SITE_PERMISSIONS } = await import('@/lib/site-keys');
      
      siteKey = generateSiteKey();
      siteSecret = generateSiteSecret();
      sitePermissions = sitePermissions || DEFAULT_SITE_PERMISSIONS;
      
      // Update site with new keys
      await prisma.site.update({
        where: { id: site.id },
        data: {
          siteKey,
          siteSecret,
          sitePermissions,
          connectionStatus: 'PENDING',
        },
      });
    }

    // Generate ZIP file
    const zip = new JSZip();
    const pluginFolder = zip.folder('ghost-post-connector');

    // API URL for the plugin to communicate with
    // Use dedicated plugin API URL, fall back to base URL, then default to production
    const apiUrl = process.env.GP_PLUGIN_API_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://app.ghostpost.co.il';

    // Main plugin file (with current version from centralized config)
    pluginFolder.file('ghost-post-connector.php', getPluginMainFile(PLUGIN_VERSION));

    // Config file with site-specific values
    pluginFolder.file('includes/config.php', getPluginConfigFile({
      siteId: site.id,
      siteKey: siteKey,
      siteSecret: siteSecret,
      apiUrl: apiUrl,
      permissions: sitePermissions,
    }));

    // Other plugin files
    pluginFolder.file('readme.txt', getPluginReadme(PLUGIN_VERSION));
    pluginFolder.file('uninstall.php', getPluginUninstall());
    
    // Includes folder
    pluginFolder.file('includes/class-ghost-post.php', getClassGhostPost());
    pluginFolder.file('includes/class-gp-api-handler.php', getClassApiHandler());
    pluginFolder.file('includes/class-gp-request-validator.php', getClassRequestValidator());
    pluginFolder.file('includes/class-gp-content-manager.php', getClassContentManager());
    pluginFolder.file('includes/class-gp-media-manager.php', getClassMediaManager());
    pluginFolder.file('includes/class-gp-seo-manager.php', getClassSeoManager());
    pluginFolder.file('includes/class-gp-cpt-manager.php', getClassCptManager());
    pluginFolder.file('includes/class-gp-acf-manager.php', getClassAcfManager());
    pluginFolder.file('includes/class-gp-updater.php', getClassUpdater());
    pluginFolder.file('includes/class-gp-entity-sync.php', getClassEntitySync());
    pluginFolder.file('includes/class-gp-redirections-manager.php', getClassRedirectionsManager());
    pluginFolder.file('includes/class-gp-i18n.php', getClassI18n());

    // Admin folder
    pluginFolder.file('admin/views/dashboard-page.php', getAdminPage());
    pluginFolder.file('admin/views/settings-page.php', getSettingsPage());
    pluginFolder.file('admin/views/redirections-page.php', getRedirectionsPage());
    pluginFolder.file('admin/css/admin.css', getAdminCss());
    pluginFolder.file('admin/js/admin.js', getAdminJs());

    // Assets folder - ghost icon SVG (purple to match platform branding)
    pluginFolder.file('assets/icon.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 335 288"><path fill="#9B4DE0" d="M313.736 127.747C313.681 123.229 311.924 112.362 311.064 107.716C310.204 103.051 314.797 91.8007 316.819 83.2673C319.527 71.8339 320.341 61.5991 317.176 56.0377C314.477 51.2909 291.961 52.5258 282.775 53.6596C279.985 54.0075 268.283 35.1105 244.669 21.3816C223.682 9.1892 191.825 2 170.691 2C109.758 2 57.627 39.0527 36.3828 91.4716C36.2181 91.8834 30.8934 90.4471 22.6775 91.7827C14.2422 93.1547 2.89737 97.3531 2.11054 101.35C1.27798 105.557 5.23035 120.045 11.2047 130.555C17.6822 141.943 25.3491 149.745 25.3948 150.842C27.8376 204.916 61.9816 250.649 109.2 272.491C122.796 278.784 144.195 286.732 170.691 285.946C245.804 283.723 302.995 213.469 325.144 145.903C330.085 130.829 333.15 116.926 332.994 108.777C332.985 108.118 332.299 107.689 331.695 107.972C327.697 109.847 316.087 116.067 313.525 118.683Z"/></svg>');

    // Generate ZIP buffer
    const zipBuffer = await zip.generateAsync({ 
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    // Return as downloadable file
    // Build filename: Ghost-Post-Connector-{siteName}_{version}.zip
    const safeName = (site.name || 'site')
      .replace(/[^a-zA-Z0-9\u0590-\u05FF\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
    const fileName = `Ghost-Post-Connector-${safeName}_${PLUGIN_VERSION}.zip`;
    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'Content-Length': zipBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Download plugin error:', error);
    return NextResponse.json(
      { error: 'Failed to generate plugin' },
      { status: 500 }
    );
  }
}
