import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import JSZip from 'jszip';
import { PLUGIN_VERSION } from '../version';

// Import all plugin template generators
import { getPluginMainFile } from '@/app/api/sites/[id]/download-plugin/plugin-templates/main';
import { getPluginConfigFile } from '@/app/api/sites/[id]/download-plugin/plugin-templates/config';
import { getPluginReadme } from '@/app/api/sites/[id]/download-plugin/plugin-templates/readme';
import { getPluginUninstall } from '@/app/api/sites/[id]/download-plugin/plugin-templates/uninstall';
import { getClassGhostPost } from '@/app/api/sites/[id]/download-plugin/plugin-templates/class-ghost-post';
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

    // Generate ZIP buffer
    const zipBuffer = await zip.generateAsync({ 
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    });

    // Return as downloadable file
    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="ghost-post-connector-${PLUGIN_VERSION}.zip"`,
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
