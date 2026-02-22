import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { getDomainMetrics, getConfiguredProviders, isMetricsEnabled } from '@/lib/domain-metrics';

const SESSION_COOKIE = 'user_session';

/**
 * GET /api/backlinks/domain-metrics?domain=example.com
 * Fetches DA, DR, and monthly traffic for a domain from SEMrush/Ahrefs.
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

    const enabled = isMetricsEnabled();

    // If auto-fetch is turned off, return immediately so the UI uses manual entry
    if (!enabled) {
      return NextResponse.json({
        enabled: false,
        domainAuthority: null,
        domainRating: null,
        monthlyTraffic: null,
        sources: [],
        providersConfigured: [],
      });
    }

    const { searchParams } = new URL(request.url);
    const domain = searchParams.get('domain');

    if (!domain) {
      return NextResponse.json({ error: 'domain parameter is required' }, { status: 400 });
    }

    const providers = getConfiguredProviders();
    const metrics = await getDomainMetrics(domain);

    return NextResponse.json({
      enabled: true,
      domain,
      domainAuthority: metrics.domainAuthority,
      domainRating: metrics.domainRating,
      monthlyTraffic: metrics.monthlyTraffic,
      sources: metrics.sources,
      providersConfigured: providers,
    });
  } catch (error) {
    console.error('Error fetching domain metrics:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
