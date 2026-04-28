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
import { getClassGhostSEO } from './plugin-templates/class-ghostseo-plugin';
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
import { getClassCacheManager } from './plugin-templates/class-cache-manager';
import { getClassElementManipulator } from './plugin-templates/class-element-manipulator';
import { getAdminPage } from './plugin-templates/admin-page';
import { getAdminCss } from './plugin-templates/admin-css';
import { getAdminJs } from './plugin-templates/admin-js';
import { getRedirectionsPage } from './plugin-templates/redirections-page';
import { getClassI18n } from './plugin-templates/class-gp-i18n';
import { getSettingsPage } from './plugin-templates/settings-page';
import { getEditorBridgeJs } from './plugin-templates/editor-bridge';

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
    const pluginFolder = zip.folder('ghostseo-connector');

    // API URL for the plugin to communicate with
    // Use dedicated plugin API URL, fall back to base URL, then default to production
    const apiUrl = process.env.GP_PLUGIN_API_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://app.ghostpost.co.il';

    // Main plugin file (with current version from centralized config)
    pluginFolder.file('ghostseo-connector.php', getPluginMainFile(PLUGIN_VERSION));

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
    pluginFolder.file('includes/class-ghostseo-plugin.php', getClassGhostSEO());
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
    pluginFolder.file('includes/class-gp-cache-manager.php', getClassCacheManager());
    pluginFolder.file('includes/class-gp-element-manipulator.php', getClassElementManipulator());
    pluginFolder.file('includes/class-gp-i18n.php', getClassI18n());

    // Admin folder
    pluginFolder.file('admin/views/dashboard-page.php', getAdminPage());
    pluginFolder.file('admin/views/settings-page.php', getSettingsPage());
    pluginFolder.file('admin/views/redirections-page.php', getRedirectionsPage());
    pluginFolder.file('admin/css/admin.css', getAdminCss());
    pluginFolder.file('admin/js/admin.js', getAdminJs());

    // Assets folder - editor bridge script for platform live-preview iframe
    pluginFolder.file('assets/editor-bridge.js', getEditorBridgeJs());

    // Assets folder - ghost icon SVG (gradient to match platform branding)
    pluginFolder.file('assets/icon.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 150" fill="none"><mask id="gp-icon-mask" mask-type="alpha" maskUnits="userSpaceOnUse" x="15" y="3" width="121" height="144"><path fill="black" d="M75.5461 3.00018C108.904 3.08102 135.88 30.1882 135.799 63.5461C135.782 70.4471 134.608 77.0746 132.462 83.2463C128.767 94.9403 114.793 138.722 116.926 125.109C119.38 109.444 115.241 108.796 115.241 108.796C115.241 108.796 108.932 134.279 99.1515 142.226C97.432 143.945 92.4613 124.597 91.5666 121.612C75.2533 142.837 60.6398 146.505 60.6398 146.505C57.975 145.585 68.0358 128.033 53.4728 119.945C53.3927 120.061 32.9192 149.64 37.174 135.183C41.4231 120.744 34.0604 107.477 34.0129 107.392C34.0129 107.392 28.4578 110.169 23.3517 121.612C23.2612 121.814 23.1625 121.884 23.0558 121.834C25.0063 112.559 20.6972 92.9492 18.05 82.4025C16.0562 76.3826 14.984 69.9435 15.0002 63.2531C15.0811 29.8953 42.1883 2.91935 75.5461 3.00018ZM98.7795 39.343C93.1724 38.8818 88.0574 45.4345 87.3547 53.9787C86.6521 62.5227 90.6275 69.8232 96.2346 70.2844C101.842 70.7455 106.956 64.1927 107.659 55.6486C108.362 47.1044 104.387 39.8041 98.7795 39.343ZM64.6467 53.8635C63.8471 45.3278 58.6574 38.8329 53.0558 39.3576C47.4546 39.8825 43.5621 47.2275 44.3615 55.7629C45.1611 64.2984 50.3499 70.7932 55.9514 70.2687C61.5528 69.744 65.4461 62.399 64.6467 53.8635Z"/></mask><g mask="url(#gp-icon-mask)"><rect width="121.034" height="143.04" transform="translate(15.001 3)" fill="url(#gp-icon-grad)"/></g><defs><linearGradient id="gp-icon-grad" x1="0" y1="71.52" x2="121.034" y2="71.52" gradientUnits="userSpaceOnUse"><stop stop-color="#8231F1"/><stop offset="1" stop-color="#4847F8"/></linearGradient></defs></svg>');

    // Generate ZIP buffer
    const zipBuffer = await zip.generateAsync({ 
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    // Return as downloadable file
    // Build filename: GhostSEO-Connector-{siteName}_{version}.zip
    const safeName = (site.name || 'site')
      .replace(/[^a-zA-Z0-9\u0590-\u05FF\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
    const fileName = `GhostSEO-Connector-${safeName}_${PLUGIN_VERSION}.zip`;
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
