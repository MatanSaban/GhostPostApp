import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { cms, getCapabilities } from '@/lib/cms';
import { refreshAccessToken } from '@/lib/google-integration';

const SESSION_COOKIE = 'user_session';
const MAX_FILES_PER_REQUEST = 10;
const MAX_BYTES_PER_FILE = 50 * 1024 * 1024; // 50MB

/**
 * Normalize a GhostSEO plugin media item to the WordPress REST API shape
 * the client expects (source_url, alt_text, title.rendered, media_details,
 * etc.). Same logic as the main media/route.js — duplicated here to avoid
 * an unnecessary export.
 */
function normalizeItem(item) {
  if (!item || typeof item !== 'object') return item;
  if (item.source_url || item.media_details) return item;

  const sizes = {};
  if (item.sizes && typeof item.sizes === 'object') {
    for (const [name, data] of Object.entries(item.sizes)) {
      sizes[name] = {
        width: data?.width ?? null,
        height: data?.height ?? null,
        source_url: data?.url ?? data?.source_url ?? null,
      };
    }
  }

  return {
    id: item.id,
    slug: item.slug || '',
    date: item.date || null,
    alt_text: item.alt ?? item.alt_text ?? '',
    title: { rendered: item.title ?? '' },
    caption: { rendered: item.caption ?? '' },
    description: { rendered: item.description ?? '' },
    mime_type: item.mimeType ?? item.mime_type ?? '',
    source_url: item.url ?? item.source_url ?? '',
    media_details: {
      width: item.width ?? null,
      height: item.height ?? null,
      filesize: item.filesize ?? null,
      sizes,
    },
  };
}

async function authorizeSite(siteId) {
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!userId) return { error: 'Unauthorized', status: 401 };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      isSuperAdmin: true,
      accountMemberships: { select: { accountId: true } },
    },
  });
  if (!user) return { error: 'User not found', status: 401 };

  const siteWhere = user.isSuperAdmin
    ? { id: siteId }
    : { id: siteId, accountId: { in: user.accountMemberships.map((m) => m.accountId) } };
  const site = await prisma.site.findFirst({ where: siteWhere });
  if (!site) return { error: 'Site not found or access denied', status: 404 };

  return { site };
}

function checkCmsConnection(site) {
  const caps = getCapabilities(site);
  const isShopifyConnected = !!site.shopifyAccessToken && !!site.shopifyDomain;
  const isWpConnected = !!site.siteKey && !!site.siteSecret;
  const isConnected = caps.platform === 'shopify' ? isShopifyConnected : isWpConnected;
  return { caps, isConnected };
}

/**
 * Obtain a fresh Google access token for the site. Prefers a client-supplied
 * token (the Picker flow hands us one with only `drive.file` scope), falling
 * back to the stored refresh token on the GoogleIntegration record. Returns
 * null if neither works — the caller surfaces that as "connect first".
 */
async function getAccessToken({ site, clientAccessToken }) {
  if (clientAccessToken) return clientAccessToken;
  const integration = await prisma.googleIntegration.findUnique({
    where: { siteId: site.id },
    select: { refreshToken: true },
  });
  if (!integration?.refreshToken) return null;
  try {
    const refreshed = await refreshAccessToken(integration.refreshToken);
    return refreshed.access_token;
  } catch (err) {
    console.error('[import-drive] token refresh failed:', err.message);
    return null;
  }
}

async function fetchDriveFileMetadata(fileId, accessToken) {
  const fields = 'id,name,mimeType,size';
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=${fields}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Drive metadata fetch failed (${res.status}): ${body}`);
  }
  return res.json();
}

async function fetchDriveFileBinary(fileId, accessToken) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Drive download failed (${res.status}): ${body}`);
  }
  const contentLength = parseInt(res.headers.get('content-length') || '0', 10);
  if (contentLength > MAX_BYTES_PER_FILE) {
    throw new Error(`File exceeds ${MAX_BYTES_PER_FILE} byte limit`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_BYTES_PER_FILE) {
    throw new Error(`File exceeds ${MAX_BYTES_PER_FILE} byte limit`);
  }
  return buffer;
}

/**
 * POST /api/sites/[id]/media/import-drive
 *
 * Body: { fileIds: string[], accessToken?: string }
 *
 * For each Drive file ID, fetch metadata + bytes and upload to the connected
 * CMS (WordPress plugin or Shopify Files API). Returns a per-file result list
 * so partial success is reported cleanly.
 */
export async function POST(req, { params }) {
  try {
    const { id } = await params;
    const auth = await authorizeSite(id);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { site } = auth;

    const { caps, isConnected } = checkCmsConnection(site);
    if (!isConnected) {
      return NextResponse.json(
        {
          error: caps.platform === 'shopify'
            ? 'Site is not connected. Install the GhostSEO Shopify app.'
            : 'Site is not connected. Please install and activate the plugin.',
        },
        { status: 400 },
      );
    }

    const schema = z.object({
      fileIds: z.array(z.string().min(1)).min(1).max(MAX_FILES_PER_REQUEST),
      accessToken: z.string().optional().nullable(),
    });
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.issues },
        { status: 400 },
      );
    }
    const { fileIds, accessToken: clientAccessToken } = parsed.data;

    const accessToken = await getAccessToken({ site, clientAccessToken });
    if (!accessToken) {
      return NextResponse.json(
        {
          error: 'Google Drive is not connected for this site. Connect it in Settings → Integrations.',
          code: 'DRIVE_NOT_CONNECTED',
        },
        { status: 400 },
      );
    }

    const results = [];
    for (const fileId of fileIds) {
      try {
        const meta = await fetchDriveFileMetadata(fileId, accessToken);
        if (meta.size && parseInt(meta.size, 10) > MAX_BYTES_PER_FILE) {
          results.push({ fileId, ok: false, error: `File too large (>${MAX_BYTES_PER_FILE} bytes)` });
          continue;
        }
        const buffer = await fetchDriveFileBinary(fileId, accessToken);
        const base64 = buffer.toString('base64');

        const uploaded = await cms.uploadMediaFromBase64(site, base64, meta.name, {
          title: meta.name,
          mimeType: meta.mimeType,
        });
        results.push({ fileId, ok: true, item: normalizeItem(uploaded) });
      } catch (err) {
        console.error('[import-drive] file failed:', fileId, err);
        results.push({ fileId, ok: false, error: err.message || 'Import failed' });
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    return NextResponse.json({
      success: okCount > 0,
      imported: okCount,
      total: results.length,
      results,
    });
  } catch (error) {
    console.error('[import-drive] error:', error);
    return NextResponse.json(
      { error: error.message || 'Drive import failed' },
      { status: 500 },
    );
  }
}
