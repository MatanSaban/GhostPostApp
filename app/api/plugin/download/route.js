import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import JSZip from 'jszip';
import { PLUGIN_VERSION } from '../version';

// Import all plugin template generators
import { getPluginMainFile } from '@/app/api/sites/[id]/download-plugin/plugin-templates/main';
import { getPluginConfigFile } from '@/app/api/sites/[id]/download-plugin/plugin-templates/config';
import { getPluginReadme } from '@/app/api/sites/[id]/download-plugin/plugin-templates/readme';
import { getPluginUninstall } from '@/app/api/sites/[id]/download-plugin/plugin-templates/uninstall';
import { getClassGhostSEO } from '@/app/api/sites/[id]/download-plugin/plugin-templates/class-ghost-post';
import { getClassApiHandler } from '@/app/api/sites/[id]/download-plugin/plugin-templates/class-api-handler';
import { getClassRequestValidator } from '@/app/api/sites/[id]/download-plugin/plugin-templates/class-request-validator';
import { getClassContentManager } from '@/app/api/sites/[id]/download-plugin/plugin-templates/class-content-manager';
import { getClassMediaManager } from '@/app/api/sites/[id]/download-plugin/plugin-templates/class-media-manager';
import { getClassSeoManager } from '@/app/api/sites/[id]/download-plugin/plugin-templates/class-seo-manager';
import { getClassCptManager } from '@/app/api/sites/[id]/download-plugin/plugin-templates/class-cpt-manager';
import { getClassAcfManager } from '@/app/api/sites/[id]/download-plugin/plugin-templates/class-acf-manager';
import { getAdminPage } from '@/app/api/sites/[id]/download-plugin/plugin-templates/admin-page';
import { getAdminCss } from '@/app/api/sites/[id]/download-plugin/plugin-templates/admin-css';
import { getClassUpdater } from '@/app/api/sites/[id]/download-plugin/plugin-templates/class-updater';
import { getClassEntitySync } from '@/app/api/sites/[id]/download-plugin/plugin-templates/class-entity-sync';
import { getClassRedirectionsManager } from '@/app/api/sites/[id]/download-plugin/plugin-templates/class-redirections-manager';
import { getClassCacheManager } from '@/app/api/sites/[id]/download-plugin/plugin-templates/class-cache-manager';
import { getClassElementManipulator } from '@/app/api/sites/[id]/download-plugin/plugin-templates/class-element-manipulator';
import { getAdminJs } from '@/app/api/sites/[id]/download-plugin/plugin-templates/admin-js';
import { getRedirectionsPage } from '@/app/api/sites/[id]/download-plugin/plugin-templates/redirections-page';
import { getClassI18n } from '@/app/api/sites/[id]/download-plugin/plugin-templates/class-gp-i18n';
import { getSettingsPage } from '@/app/api/sites/[id]/download-plugin/plugin-templates/settings-page';
import { getEditorBridgeJs } from '@/app/api/sites/[id]/download-plugin/plugin-templates/editor-bridge';

/**
 * GET /api/plugin/download
 * Download the latest plugin version for a specific site
 * 
 * Query params:
 * - site_key: The site's unique key for authentication
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const siteKey = searchParams.get('site_key');

    if (!siteKey) {
      return NextResponse.json({ error: 'Missing site_key' }, { status: 400 });
    }

    // Get site by key
    const site = await prisma.site.findFirst({
      where: { siteKey },
      select: {
        id: true,
        name: true,
        url: true,
        siteKey: true,
        siteSecret: true,
        sitePermissions: true,
      },
    });

    if (!site) {
      return NextResponse.json({ error: 'Invalid site key' }, { status: 401 });
    }

    // Generate ZIP file
    const zip = new JSZip();
    const pluginFolder = zip.folder('ghost-post-connector');

    // API URL for the plugin to communicate with
    const apiUrl = process.env.GP_PLUGIN_API_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://app.ghostpost.co.il';

    // Main plugin file (with updated version)
    pluginFolder.file('ghost-post-connector.php', getPluginMainFile(PLUGIN_VERSION));

    // Config file with site-specific values
    pluginFolder.file('includes/config.php', getPluginConfigFile({
      siteId: site.id,
      siteKey: site.siteKey,
      siteSecret: site.siteSecret,
      apiUrl: apiUrl,
      permissions: site.sitePermissions,
    }));

    // Other plugin files
    pluginFolder.file('readme.txt', getPluginReadme(PLUGIN_VERSION));
    pluginFolder.file('uninstall.php', getPluginUninstall());
    
    // Includes folder
    pluginFolder.file('includes/class-ghost-post.php', getClassGhostSEO());
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
    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="GhostSEO-Connector-${PLUGIN_VERSION}.zip"`,
        'Content-Length': zipBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Plugin download error:', error);
    return NextResponse.json(
      { error: 'Failed to generate plugin' },
      { status: 500 }
    );
  }
}
