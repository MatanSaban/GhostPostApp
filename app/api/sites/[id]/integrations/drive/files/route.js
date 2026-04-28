import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { refreshAccessToken } from '@/lib/google-integration';

const SESSION_COOKIE = 'user_session';
const PAGE_SIZE = 40;

async function authorize(siteId) {
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
  if (!site) return { error: 'Site not found', status: 404 };

  return { site };
}

async function getDriveAccessToken(siteId) {
  const integration = await prisma.googleIntegration.findUnique({
    where: { siteId },
    select: { refreshToken: true, scopes: true },
  });
  if (!integration?.refreshToken) return null;
  const hasDrive = integration.scopes?.some((s) => s.includes('drive.readonly'));
  if (!hasDrive) return null;
  try {
    const refreshed = await refreshAccessToken(integration.refreshToken);
    return refreshed.access_token;
  } catch {
    return null;
  }
}

/**
 * GET /api/sites/[id]/integrations/drive/files
 *
 * Proxies Drive v3 `files.list` so the platform's custom Drive browser can
 * page through the user's files without touching a Google iframe on the
 * client. All the normal search knobs are exposed as query params so the
 * frontend can do keyword search, image-only filter, etc. without re-
 * implementing the Drive query syntax.
 *
 * Query params:
 *   q            - free-text search; added as `name contains '...'`
 *   mimeFilter   - "image" | "video" | "doc" | "any" (default "image")
 *   pageToken    - continuation token from a previous response
 *   pageSize     - clamped to 1–100 (default 40)
 *
 * Response: { files, nextPageToken }
 */
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const auth = await authorize(id);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const accessToken = await getDriveAccessToken(id);
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Drive not connected for this site.', code: 'DRIVE_NOT_CONNECTED' },
        { status: 400 },
      );
    }

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim();
    const pageToken = searchParams.get('pageToken') || '';
    const mimeFilter = (searchParams.get('mimeFilter') || 'image').toLowerCase();
    const rawPageSize = parseInt(searchParams.get('pageSize') || String(PAGE_SIZE), 10);
    const pageSize = Number.isFinite(rawPageSize) ? Math.min(Math.max(rawPageSize, 1), 100) : PAGE_SIZE;

    // Build the Drive query. We always exclude trashed files; mimeFilter
    // narrows to a media type group and the optional `q` matches against
    // the file name.
    const clauses = ['trashed = false'];
    if (mimeFilter === 'image') clauses.push("mimeType contains 'image/'");
    else if (mimeFilter === 'video') clauses.push("mimeType contains 'video/'");
    else if (mimeFilter === 'doc') clauses.push("mimeType = 'application/pdf'");
    // "any" → no mime clause
    if (q) {
      const escaped = q.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      clauses.push(`name contains '${escaped}'`);
    }

    const fields = 'nextPageToken, files(id,name,mimeType,size,thumbnailLink,iconLink,webViewLink,modifiedTime,imageMediaMetadata(width,height))';
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', clauses.join(' and '));
    url.searchParams.set('fields', fields);
    url.searchParams.set('pageSize', String(pageSize));
    url.searchParams.set('orderBy', 'modifiedTime desc');
    url.searchParams.set('spaces', 'drive');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const body = await res.text();
      console.error('[Drive files] list failed:', res.status, body);
      return NextResponse.json({ error: 'Failed to list Drive files' }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json({
      files: data.files || [],
      nextPageToken: data.nextPageToken || null,
    });
  } catch (error) {
    console.error('[Drive files] error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to list Drive files' },
      { status: 500 },
    );
  }
}
