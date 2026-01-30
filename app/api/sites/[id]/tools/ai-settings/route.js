import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { makePluginRequest } from '@/lib/wp-api-client';

/**
 * GET /api/sites/[id]/tools/ai-settings
 * Get AI image optimization settings
 */
export async function GET(req, { params }) {
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
        enabled: false,
        auto_alt_text: false,
        auto_filename: false,
        language: 'en',
      });
    }

    try {
      const result = await makePluginRequest(site, '/media/ai-settings', 'GET');
      return NextResponse.json(result);
    } catch (pluginError) {
      console.warn('AI settings not available:', pluginError.message);
      return NextResponse.json({
        enabled: false,
        auto_alt_text: false,
        auto_filename: false,
        language: 'en',
      });
    }
  } catch (error) {
    console.error('Get AI settings error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get AI settings' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/sites/[id]/tools/ai-settings
 * Update AI image optimization settings
 */
export async function PUT(req, { params }) {
  try {
    const { id } = await params;
    const body = await req.json();

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
      return NextResponse.json({ error: 'Site is not connected' }, { status: 400 });
    }

    const result = await makePluginRequest(site, '/media/ai-settings', 'PUT', body);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Update AI settings error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update AI settings' },
      { status: 500 }
    );
  }
}
