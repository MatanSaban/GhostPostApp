import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/sites/[id]/tools/settings
 * Get tool settings for the site
 */
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    
    const site = await prisma.site.findUnique({
      where: { id },
      select: {
        id: true,
        toolSettings: true,
      },
    });
    
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }
    
    const settings = site.toolSettings || {};
    
    return NextResponse.json({
      autoConvertToWebp: settings.autoConvertToWebp ?? false,
    });
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
 * Update tool settings for the site
 */
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    const site = await prisma.site.findUnique({
      where: { id },
      select: { id: true, toolSettings: true },
    });
    
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }
    
    const currentSettings = site.toolSettings || {};
    const newSettings = {
      ...currentSettings,
    };
    
    if (typeof body.autoConvertToWebp === 'boolean') {
      newSettings.autoConvertToWebp = body.autoConvertToWebp;
    }
    
    await prisma.site.update({
      where: { id },
      data: { toolSettings: newSettings },
    });
    
    return NextResponse.json({
      autoConvertToWebp: newSettings.autoConvertToWebp ?? false,
    });
  } catch (error) {
    console.error('Error updating tool settings:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update settings' },
      { status: 500 }
    );
  }
}
