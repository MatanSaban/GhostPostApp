import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifySignature } from '@/lib/site-keys';

const ALLOWED_LANGUAGES = ['auto', 'en', 'he'];

/**
 * POST /api/public/wp/save-language
 * Called by WordPress plugin to save the display language preference
 */
export async function POST(request) {
  try {
    const siteKey = request.headers.get('X-GP-Site-Key');
    const timestamp = parseInt(request.headers.get('X-GP-Timestamp'), 10);
    const signature = request.headers.get('X-GP-Signature');

    if (!siteKey || !timestamp || !signature) {
      return NextResponse.json(
        { success: false, error: 'Missing required headers' },
        { status: 400 }
      );
    }

    const site = await prisma.site.findFirst({
      where: { siteKey },
      select: { id: true, siteSecret: true },
    });

    if (!site) {
      return NextResponse.json(
        { success: false, error: 'Invalid site key' },
        { status: 404 }
      );
    }

    const body = await request.text();
    const verification = verifySignature(body, timestamp, signature, site.siteSecret);
    if (!verification.valid) {
      return NextResponse.json(
        { success: false, error: verification.error },
        { status: 401 }
      );
    }

    const data = body ? JSON.parse(body) : {};
    const language = ALLOWED_LANGUAGES.includes(data.language) ? data.language : 'auto';

    await prisma.site.update({
      where: { id: site.id },
      data: { pluginLanguage: language },
    });

    return NextResponse.json({ success: true, language });
  } catch (error) {
    console.error('Save language error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
