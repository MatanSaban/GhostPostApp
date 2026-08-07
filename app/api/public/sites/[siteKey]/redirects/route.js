/**
 * GET /api/public/sites/{siteKey}/redirects
 *
 * The platform-managed redirect table as ready-to-apply rules
 * ({ source, destination, statusCode }). The SDK writes these into the
 * framework's native redirect config; the edge proxy applies them as HTTP
 * 301/302. Signed + cacheable.
 */
import {
  resolveSiteByKey,
  signedResponse,
  contractError,
  enforceRateLimit,
  corsPreflight,
} from '@/lib/contract/http';
import { resolveRedirects } from '@/lib/contract/resolver';
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

    const redirects = await resolveRedirects(site);
    return signedResponse({ redirects });
  } catch (err) {
    console.error('[contract/redirects] error:', err);
    return contractError(500, 'INTERNAL', 'Internal server error');
  }
}
