import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { inferAiQueries } from '@/lib/ai/infer-ai-queries';
import { getLocale } from '@/i18n/server';

const SESSION_COOKIE = 'user_session';

async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) return null;
    return prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, accountMemberships: { select: { accountId: true } } },
    });
  } catch {
    return null;
  }
}

/**
 * POST /api/dashboard/stats/ai-inferred-queries
 *
 * Body: { siteId: string, topLandingPages: [{ page, sessions }] }
 *
 * Takes the AI landing pages (already fetched by the client from the ai-traffic
 * endpoint) and runs the inference pipeline: DB content match → Gemini.
 * Uses POST because the client sends a payload (landing pages array).
 */
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { siteId, topLandingPages } = body || {};

    if (!siteId || !topLandingPages?.length) {
      return NextResponse.json({ error: 'siteId and topLandingPages required' }, { status: 400 });
    }

    // permission check: user must belong to the site's account
    const accountIds = user.accountMemberships.map(m => m.accountId);
    const site = await prisma.site.findFirst({
      where: { id: siteId, accountId: { in: accountIds } },
      select: { id: true },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const locale = await getLocale();
    const inferred = await inferAiQueries(siteId, topLandingPages, locale);

    return NextResponse.json({ inferredQueries: inferred });
  } catch (error) {
    console.error('[AI Inferred Queries] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
