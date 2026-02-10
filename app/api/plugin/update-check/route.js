import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { PLUGIN_VERSION, PLUGIN_CHANGELOG } from '../version';

/**
 * GET /api/plugin/update-check
 * WordPress plugin update check endpoint
 * 
 * Query params:
 * - site_key: The site's unique key for authentication
 * - current_version: The currently installed version
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const siteKey = searchParams.get('site_key');
    const currentVersion = searchParams.get('current_version');

    if (!siteKey) {
      return NextResponse.json({ error: 'Missing site_key' }, { status: 400 });
    }

    // Verify site exists and is connected
    const site = await prisma.site.findFirst({
      where: { siteKey },
      select: {
        id: true,
        connectionStatus: true,
      },
    });

    if (!site) {
      return NextResponse.json({ error: 'Invalid site key' }, { status: 401 });
    }

    // Get the API URL for downloads
    const apiUrl = process.env.GP_PLUGIN_API_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://app.ghostpost.co.il';

    // Compare versions
    const updateAvailable = isNewerVersion(PLUGIN_VERSION, currentVersion);

    // Return update info in WordPress-compatible format
    return NextResponse.json({
      success: true,
      version: PLUGIN_VERSION,
      current_version: currentVersion,
      update_available: updateAvailable,
      download_url: updateAvailable ? `${apiUrl}/api/plugin/download?site_key=${siteKey}` : null,
      changelog: PLUGIN_CHANGELOG,
      tested_wp: '6.7',
      requires_wp: '5.6',
      requires_php: '7.4',
      last_updated: new Date().toISOString().split('T')[0],
      homepage: 'https://ghostpost.co.il',
      plugin_name: 'Ghost Post Connector',
      slug: 'ghost-post-connector',
      author: 'Ghost Post',
      author_profile: 'https://ghostpost.co.il',
      sections: {
        description: 'Connects your WordPress site to Ghost Post platform for AI-powered content management.',
        installation: 'Upload the plugin files to your WordPress installation and activate it.',
        changelog: PLUGIN_CHANGELOG,
      },
    });
  } catch (error) {
    console.error('Plugin update check error:', error);
    return NextResponse.json({ error: 'Update check failed' }, { status: 500 });
  }
}

/**
 * Compare version strings
 * Returns true if newVersion is greater than currentVersion
 */
function isNewerVersion(newVersion, currentVersion) {
  if (!currentVersion) return true;
  
  const newParts = newVersion.split('.').map(Number);
  const currentParts = currentVersion.split('.').map(Number);
  
  for (let i = 0; i < Math.max(newParts.length, currentParts.length); i++) {
    const newPart = newParts[i] || 0;
    const currentPart = currentParts[i] || 0;
    
    if (newPart > currentPart) return true;
    if (newPart < currentPart) return false;
  }
  
  return false; // Versions are equal
}
