/**
 * GET /api/public/sites/{siteKey}/seo?path=/pricing
 *
 * Signed, cacheable resolved SEO for one route. Public (SEO is public); the
 * response is Ed25519-signed so consumers (SDK / edge proxy) can verify
 * authenticity with the pinned public key.
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
    const path = searchParams.get('path') || '/';

    const seo = await resolveSeoForPath(site, path);
    return signedResponse(seo);
  } catch (err) {
    console.error('[contract/seo] error:', err);
    return contractError(500, 'INTERNAL', 'Internal server error');
  }
}
