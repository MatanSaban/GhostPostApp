import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { v2 as cloudinary } from 'cloudinary';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';
const FAVICON_REFRESH_DAYS = 7;

let _cloudinaryConfigured = false;
function ensureCloudinaryConfig() {
  if (_cloudinaryConfigured) return;
  const cUrl = process.env.CLOUDINARY_URL;
  if (cUrl) {
    const match = cUrl.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/);
    if (match) {
      cloudinary.config({ cloud_name: match[3], api_key: match[1], api_secret: match[2], secure: true });
    }
  }
  if (!cloudinary.config().api_key) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }
  _cloudinaryConfigured = true;
}

function getDomain(url) {
  if (!url) return null;
  try {
    const withProtocol = url.startsWith('http') ? url : `https://${url}`;
    return new URL(withProtocol).hostname;
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0];
  }
}

/**
 * Fetch the favicon image from Google's S2 service and upload to Cloudinary.
 * Returns the Cloudinary URL or null if it fails.
 */
async function fetchAndUploadFavicon(siteUrl, siteId) {
  const domain = getDomain(siteUrl);
  if (!domain) return null;

  console.log(`[Favicon] Fetching favicon for ${domain}...`);

  // Fetch favicon bytes from Google's service (reliable, handles edge cases)
  const faviconSourceUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
  const response = await fetch(faviconSourceUrl);

  if (!response.ok) {
    console.log(`[Favicon] Google S2 returned HTTP ${response.status} for ${domain}`);
    return null;
  }

  const contentType = response.headers.get('content-type') || '';
  // Google returns a default blank/globe icon for missing favicons — skip those
  // by checking if the content type is valid image (not the 1x1 default)
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 100) {
    console.log(`[Favicon] Image too small (${buffer.length}b) for ${domain} — likely placeholder`);
    return null;
  }

  console.log(`[Favicon] Downloaded ${buffer.length}b favicon for ${domain}, uploading to Cloudinary...`);

  const base64 = buffer.toString('base64');
  const mimeType = contentType.includes('image/') ? contentType.split(';')[0] : 'image/png';
  const dataUri = `data:${mimeType};base64,${base64}`;

  ensureCloudinaryConfig();

  const result = await cloudinary.uploader.upload(dataUri, {
    folder: 'ghostpost/favicons',
    public_id: `site-${siteId}`,
    resource_type: 'image',
    overwrite: true,
    format: 'png',
  });

  return result.secure_url;
}

// POST - Check and refresh favicon for a site
export async function POST(request, { params }) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: siteId } = await params;
    console.log(`[Favicon] Check requested for site ${siteId}`);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { lastSelectedAccountId: true, isSuperAdmin: true },
    });

    // Find site and verify access
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, url: true, accountId: true, favicon: true, faviconCheckedAt: true },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    if (!user?.isSuperAdmin && site.accountId !== user?.lastSelectedAccountId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Check if refresh is needed
    const now = new Date();
    const needsRefresh = !site.favicon || !site.faviconCheckedAt ||
      (now - new Date(site.faviconCheckedAt)) > FAVICON_REFRESH_DAYS * 24 * 60 * 60 * 1000;

    if (!needsRefresh) {
      console.log(`[Favicon] No refresh needed for ${site.url} (checked ${site.faviconCheckedAt})`);
      return NextResponse.json({ favicon: site.favicon, refreshed: false });
    }

    console.log(`[Favicon] Refresh needed for ${site.url}`);

    // Fetch and upload new favicon
    try {
      const newFaviconUrl = await fetchAndUploadFavicon(site.url, site.id);

      await prisma.site.update({
        where: { id: siteId },
        data: {
          favicon: newFaviconUrl || site.favicon, // Keep old if fetch failed
          faviconCheckedAt: now,
        },
      });

      return NextResponse.json({
        favicon: newFaviconUrl || site.favicon,
        refreshed: true,
      });
    } catch (fetchError) {
      console.error(`[Favicon] Failed to fetch favicon for ${site.url}:`, fetchError.message);

      // Update check time even on failure to avoid retrying every request
      await prisma.site.update({
        where: { id: siteId },
        data: { faviconCheckedAt: now },
      });

      return NextResponse.json({ favicon: site.favicon, refreshed: false });
    }
  } catch (error) {
    console.error('[Favicon] Error:', error);
    return NextResponse.json({ error: 'Failed to check favicon' }, { status: 500 });
  }
}
