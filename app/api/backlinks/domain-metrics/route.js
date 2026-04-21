import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { getDomainMetrics, getConfiguredProviders, isMetricsEnabled } from '@/lib/domain-metrics';
import { refreshAccessToken, fetchGAMonthlyTraffic, fetchGAReport, fetchGSCReport } from '@/lib/google-integration';

const SESSION_COOKIE = 'user_session';
const FIVE_MIN = 5 * 60 * 1000;

/**
 * Smart monthly traffic averaging.
 *
 * Strategy:
 * 1. Exclude months with 0 visitors.
 * 2. Compute a "recent baseline" from the last 3 months (or fewer).
 * 3. Walk backwards: a month is "meaningful" if it has ≥ 10 % of the baseline.
 *    The first month that falls below the threshold marks the end of the
 *    "pre-traffic" era - earlier months are excluded.
 * 4. Average the remaining meaningful months (capped at 12).
 *
 * Examples:
 *   [5, 3, 500]          → avg only [500]      = 500
 *   [500 × 10, 2000]     → avg all 11 months   = 636
 */
function calculateSmartMonthlyTraffic(monthlyData) {
  if (!monthlyData || monthlyData.length === 0) return 0;

  const withTraffic = monthlyData.filter(m => m.visitors > 0);
  if (withTraffic.length === 0) return 0;
  if (withTraffic.length === 1) return withTraffic[0].visitors;

  // Baseline = average of last 3 months (or fewer)
  const recentSlice = withTraffic.slice(-Math.min(3, withTraffic.length));
  const recentAvg = recentSlice.reduce((s, m) => s + m.visitors, 0) / recentSlice.length;
  const threshold = recentAvg * 0.1;

  // Walk backwards, keep months ≥ threshold; stop at first "pre-traffic" month
  const included = [];
  for (let i = withTraffic.length - 1; i >= 0; i--) {
    if (withTraffic[i].visitors >= threshold) {
      included.unshift(withTraffic[i]);
    } else {
      break;
    }
  }

  if (included.length === 0) return withTraffic[withTraffic.length - 1].visitors;
  return Math.round(included.reduce((s, m) => s + m.visitors, 0) / included.length);
}

/**
 * GET /api/backlinks/domain-metrics?domain=example.com&siteId=xxx
 * Fetches DA, DR, and monthly traffic for a domain.
 * Priority for monthly traffic: SEMrush/Ahrefs → GA4 (smart avg) → GSC (last 30d clicks).
 * Requires authentication.
 */
export async function GET(request) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const domain = searchParams.get('domain');
    const siteId = searchParams.get('siteId');

    if (!domain) {
      return NextResponse.json({ error: 'domain parameter is required' }, { status: 400 });
    }

    const enabled = isMetricsEnabled();

    let domainAuthority = null;
    let domainRating = null;
    let monthlyTraffic = null;
    let sources = [];

    if (enabled) {
      const metrics = await getDomainMetrics(domain);
      domainAuthority = metrics.domainAuthority;
      domainRating = metrics.domainRating;
      monthlyTraffic = metrics.monthlyTraffic;
      sources = metrics.sources || [];
    }

    // Fallback: if no monthly traffic from external APIs, try Google integrations
    if (monthlyTraffic == null && siteId) {
      try {
        const integration = await prisma.googleIntegration.findUnique({
          where: { siteId },
          select: {
            id: true,
            gaConnected: true,
            gaPropertyId: true,
            gscConnected: true,
            gscSiteUrl: true,
            accessToken: true,
            refreshToken: true,
            tokenExpiresAt: true,
          },
        });

        if (integration) {
          // Ensure valid access token
          let accessToken = integration.accessToken;
          const needsRefresh = integration.refreshToken && (
            !integration.tokenExpiresAt ||
            new Date(integration.tokenExpiresAt).getTime() - Date.now() < FIVE_MIN
          );
          if (needsRefresh) {
            const refreshed = await refreshAccessToken(integration.refreshToken);
            accessToken = refreshed.access_token;
            await prisma.googleIntegration.update({
              where: { id: integration.id },
              data: {
                accessToken: refreshed.access_token,
                tokenExpiresAt: new Date(Date.now() + (refreshed.expires_in || 3600) * 1000),
              },
            });
          }

          // Priority 1: GA4 - smart average over up to 12 complete months
          if (integration.gaConnected && integration.gaPropertyId) {
            try {
              const monthlyData = await fetchGAMonthlyTraffic(accessToken, integration.gaPropertyId, 12);
              if (monthlyData && monthlyData.length > 0) {
                const avg = calculateSmartMonthlyTraffic(monthlyData);
                if (avg > 0) {
                  monthlyTraffic = avg;
                  sources.push('GA4');
                }
              }
              // If no complete months yet, fall back to last-30-day snapshot
              if (monthlyTraffic == null) {
                const gaReport = await fetchGAReport(accessToken, integration.gaPropertyId, 30);
                if (gaReport?.visitors > 0) {
                  monthlyTraffic = gaReport.visitors;
                  sources.push('GA4');
                }
              }
            } catch (gaErr) {
              console.error('Error fetching GA4 traffic:', gaErr.message);
            }
          }

          // Priority 2: GSC - organic search clicks last 30 days (if GA4 unavailable)
          if (monthlyTraffic == null && integration.gscConnected && integration.gscSiteUrl) {
            try {
              const gscReport = await fetchGSCReport(accessToken, integration.gscSiteUrl, 30);
              if (gscReport?.clicks > 0) {
                monthlyTraffic = gscReport.clicks;
                sources.push('GSC');
              }
            } catch (gscErr) {
              console.error('Error fetching GSC traffic:', gscErr.message);
            }
          }
        }
      } catch (e) {
        console.error('Error fetching Google traffic fallback:', e);
      }
    }

    return NextResponse.json({
      enabled: enabled || monthlyTraffic != null,
      domain,
      domainAuthority,
      domainRating,
      monthlyTraffic,
      sources,
      providersConfigured: enabled ? getConfiguredProviders() : [],
    });
  } catch (error) {
    console.error('Error fetching domain metrics:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
