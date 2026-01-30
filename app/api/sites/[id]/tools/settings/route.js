import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { makePluginRequest } from '@/lib/wp-api-client';

/**
 * GET /api/sites/[id]/tools/settings
 * Get tool settings for the site (from WordPress plugin)
 */
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    
    const site = await prisma.site.findUnique({
      where: { id },
      select: {
        id: true,
        url: true,
        siteKey: true,
        siteSecret: true,
      },
    });
    
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }
    
    // If site is not connected, return default settings
    if (!site.siteKey || !site.siteSecret) {
      return NextResponse.json({
        autoConvertToWebp: false,
      });
    }
    
    try {
      // Fetch settings from WordPress plugin
      const result = await makePluginRequest(site, '/media/settings', 'GET');
      
      return NextResponse.json({
        autoConvertToWebp: result.autoConvertToWebp ?? false,
      });
    } catch (pluginError) {
      // Plugin might not support settings endpoint yet
      console.warn('Plugin settings not available:', pluginError.message);
      return NextResponse.json({
        autoConvertToWebp: false,
      });
    }
  } catch (error) {
    console.error('Error fetching tool settings:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/sites/[id]/tools/settings
 * Update tool settings for the site (on WordPress plugin)
 */
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    const site = await prisma.site.findUnique({
      where: { id },
      select: {
        id: true,
        url: true,
        siteKey: true,
        siteSecret: true,
      },
    });
    
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }
    
    if (!site.siteKey || !site.siteSecret) {
      return NextResponse.json(
        { error: 'Site is not connected. Please install and activate the plugin.' },
        { status: 400 }
      );
    }
    
    // Update settings on WordPress plugin
    const result = await makePluginRequest(site, '/media/settings', 'PUT', {
      autoConvertToWebp: body.autoConvertToWebp ?? false,
    });
    
    return NextResponse.json({
      autoConvertToWebp: result.autoConvertToWebp ?? false,
    });
  } catch (error) {
    console.error('Error updating tool settings:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update settings' },
      { status: 500 }
    );
  }
}
