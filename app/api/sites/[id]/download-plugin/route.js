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
import { getAdminPage } from './plugin-templates/admin-page';
import { getAdminCss } from './plugin-templates/admin-css';

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
    const hasAccess = user.accountMemberships.some(m => m.accountId === site.accountId);
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

    // Admin folder
    pluginFolder.file('admin/views/settings-page.php', getAdminPage());
    pluginFolder.file('admin/css/admin.css', getAdminCss());

    // Assets folder
    // pluginFolder.file('assets/images/ghost-post-icon.png', iconBuffer);

    // Generate ZIP buffer
    const zipBuffer = await zip.generateAsync({ 
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    });

    // Return as downloadable file
    // Use short key identifier in filename (first 8 chars of siteKey)
    const shortKey = siteKey.replace('gp_site_', '').substring(0, 8);
    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="ghost-post-connector-${shortKey}.zip"`,
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
