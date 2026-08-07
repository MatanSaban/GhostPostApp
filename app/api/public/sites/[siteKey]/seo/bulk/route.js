/**
 * GET /api/public/sites/{siteKey}/seo/bulk?paths=/a,/b,/c
 *
 * Batch resolved SEO for many routes in one signed response - used by the SDK
 * at build time (SSG) to inline correct meta into every prerendered page.
 */
import {
  resolveSiteByKey,
  signedResponse,
  contractError,
  enforceRateLimit,
  corsPreflight,
} from '@/lib/contract/http';
import { resolveSeoForPath } from '@/lib/contract/resolver';
import { recordContractHit } from '@/lib/contract/heartbeat';

const MAX_PATHS = 100;

export async function OPTIONS() {
  return corsPreflight();
}

export async function GET(request, { params }) {
  try {
    const { siteKey } = await params;

    const limited = enforceRateLimit(request, siteKey);
    if (limited) return limited;

    const site = await resolveSiteByKey(siteKey);
    if (!site) return contractError(404, 'SITE_NOT_FOUND', 'Unknown site key');

    await recordContractHit(site, request);

    const { searchParams } = new URL(request.url);
    const raw = searchParams.get('paths') || '';
    const paths = [...new Set(raw.split(',').map((p) => p.trim()).filter(Boolean))].slice(0, MAX_PATHS);
    if (paths.length === 0) {
      return contractError(400, 'BAD_REQUEST', 'paths query param is required (comma-separated)');
    }

    const pages = await Promise.all(paths.map((p) => resolveSeoForPath(site, p)));
    return signedResponse({ pages });
  } catch (err) {
    console.error('[contract/seo/bulk] error:', err);
    return contractError(500, 'INTERNAL', 'Internal server error');
  }
}
