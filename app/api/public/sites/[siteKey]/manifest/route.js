/**
 * GET /api/public/sites/{siteKey}/manifest
 *
 * A cheap, signed "what/when changed" descriptor: a `version` (etag) that moves
 * whenever the site's SEO or redirects change, plus capabilities + counts. The
 * SDK/edge poll this to decide whether to re-fetch the fuller endpoints.
 */
import prisma from '@/lib/prisma';
import {
  resolveSiteByKey,
  signedResponse,
  contractError,
  enforceRateLimit,
  corsPreflight,
} from '@/lib/contract/http';
import { buildManifest } from '@/lib/contract/resolver';
import { getCapabilities } from '@/lib/cms';
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

    // Per-site kill switch: fold the paused flag into the version string so
    // consumers' manifest-keyed caches bust when the switch flips either way.
    const paused = Boolean(
      await prisma.siteIntegration.findFirst({
        where: { siteId: site.id, killSwitch: true },
        select: { id: true },
      }),
    );

    const manifest = await buildManifest(site);
    const caps = getCapabilities(site);

    return signedResponse(
      {
        ...manifest,
        version: paused ? `${manifest.version}.paused` : manifest.version,
        paused,
        capabilities: {
          platform: caps.platform,
          redirectsBackend: caps.redirectsBackend,
          seoBackend: caps.seoBackend,
        },
      },
      { sMaxAge: 60, swr: 600 }, // manifest is the change-detector - cache briefly
    );
  } catch (err) {
    console.error('[contract/manifest] error:', err);
    return contractError(500, 'INTERNAL', 'Internal server error');
  }
}
