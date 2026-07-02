/**
 * GET /api/preview/proxy?siteId=...&path=/pricing&gp_editor=true&gp_origin=...
 *
 * On-demand preview proxy for the editor iframe. Fetches a customer page
 * server-side, rewrites it (base href + strip framing blockers + inject the
 * editor-bridge), and serves it SAME-ORIGIN into the platform's editor so the
 * "chat preview of website" + visual editor work for ANY site - no plugin, no
 * DNS change, not in production traffic.
 *
 * Security:
 *   - Authenticated (user session) + site-access checked - not an open proxy.
 *   - SSRF-guarded: only fetches within the *registered site's own origin*
 *     (the path can't escape to another host), http/https only.
 *   - Served noindex, no-store, frame-ancestors 'self'.
 */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { BOT_FETCH_HEADERS } from '@/lib/bot-identity';
import { rewriteHtmlForPreview } from '@/lib/preview/rewrite';
import { getEditorBridgeJs } from '@/app/api/sites/[id]/download-plugin/plugin-templates/editor-bridge';

// Never cache the proxy itself - the editor must reflect the live page.
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const SESSION_COOKIE = 'user_session';
const FETCH_TIMEOUT_MS = 15000;
const MAX_HTML_BYTES = 5 * 1024 * 1024; // 5MB guard

async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) return null;
    return prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isSuperAdmin: true, accountMemberships: { select: { accountId: true } } },
    });
  } catch {
    return null;
  }
}

function text(status, body) {
  return new NextResponse(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

export async function GET(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return text(401, 'Unauthorized');

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    const path = searchParams.get('path') || '/';
    if (!siteId) return text(400, 'Missing siteId');

    const accountIds = user.accountMemberships.map((m) => m.accountId);
    const site = await prisma.site.findFirst({
      where: user.isSuperAdmin ? { id: siteId } : { id: siteId, accountId: { in: accountIds } },
      select: { id: true, url: true },
    });
    if (!site || !site.url) return text(404, 'Site not found');

    // Resolve target within the site's OWN origin (SSRF guard).
    let target;
    try {
      const base = /^https?:\/\//i.test(site.url) ? site.url : `https://${site.url}`;
      const baseOrigin = new URL(base).origin;
      target = new URL(path, base);
      if (!/^https?:$/.test(target.protocol)) return text(400, 'Unsupported protocol');
      if (target.origin !== baseOrigin) return text(400, 'Path escapes the site origin');
    } catch {
      return text(400, 'Invalid path');
    }

    // Fetch the page server-side. Cache-bust so the editor shows the LIVE render
    // (not a stale ISR/edge-cached page): a unique query param makes upstream
    // CDNs (Vercel/Cloudflare) treat it as a fresh key, plus no-store + no-cache
    // request headers. NOTE: this only busts the fetch we make - it does not
    // purge the site's public cache (see the response to the user).
    const fetchUrl = new URL(target.toString());
    fetchUrl.searchParams.set('gp_preview', String(Date.now()));
    let res;
    try {
      res = await fetch(fetchUrl.toString(), {
        headers: { ...BOT_FETCH_HEADERS, 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        redirect: 'follow',
        cache: 'no-store',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (e) {
      return text(502, `Could not reach the page: ${e.message}`);
    }
    if (!res.ok) return text(502, `The page returned ${res.status}`);

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('text/html')) {
      return text(415, 'The URL did not return an HTML page');
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_HTML_BYTES) return text(413, 'Page too large to preview');
    const html = buf.toString('utf8');

    const rewritten = rewriteHtmlForPreview(html, {
      pageUrl: target.toString(),
      bridgeScript: getEditorBridgeJs(),
    });

    return new NextResponse(rewritten, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // Only our own dashboard may frame the preview.
        'Content-Security-Policy': "frame-ancestors 'self'",
        'X-Robots-Tag': 'noindex, nofollow',
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch (err) {
    console.error('[preview/proxy] error:', err);
    return text(500, 'Internal error');
  }
}
