import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser, loadAccessibleSite, accountHasPaidPlan } from '@/lib/backlinks/access';
import { entryMatchWhere, recomputeIsDisavowedForSite } from '@/lib/backlinks/disavow';

const VALID_SCOPES = new Set(['DOMAIN', 'URL']);

async function authorizeSiteAccess(user, siteId) {
  if (!siteId) return { error: NextResponse.json({ error: 'siteId is required' }, { status: 400 }) };
  const access = await loadAccessibleSite({
    userId: user.id,
    isSuperAdmin: user.isSuperAdmin,
    siteId,
  });
  if (!access) return { error: NextResponse.json({ error: 'Site not found or no access' }, { status: 404 }) };
  if (!accountHasPaidPlan(access.account)) {
    return { error: NextResponse.json({ error: 'Backlink Audit requires a paid plan', code: 'PLAN_REQUIRED' }, { status: 403 }) };
  }
  return { access };
}

export async function GET(request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get('siteId');
  const auth = await authorizeSiteAccess(user, siteId);
  if (auth.error) return auth.error;

  const entries = await prisma.disavowEntry.findMany({
    where: { siteId },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      scope: true,
      value: true,
      reason: true,
      status: true,
      exportedAt: true,
      createdAt: true,
    },
  });

  // Per-entry coverage count: how many actual backlinks this entry hits today.
  // Done in JS rather than per-row queries so we keep this to two prisma calls.
  const allBacklinks = await prisma.backlink.findMany({
    where: { siteId },
    select: { referringDomain: true, referringUrl: true },
  });
  const domainCounts = new Map();
  const urlCounts = new Map();
  for (const b of allBacklinks) {
    domainCounts.set(b.referringDomain, (domainCounts.get(b.referringDomain) || 0) + 1);
    urlCounts.set(b.referringUrl, (urlCounts.get(b.referringUrl) || 0) + 1);
  }

  const enriched = entries.map(e => ({
    ...e,
    coverageCount: e.scope === 'DOMAIN'
      ? (domainCounts.get(e.value) || 0)
      : (urlCounts.get(e.value) || 0),
  }));

  const counts = {
    total: enriched.length,
    pending: enriched.filter(e => e.status === 'PENDING').length,
    exported: enriched.filter(e => e.status === 'EXPORTED').length,
    acknowledged: enriched.filter(e => e.status === 'ACKNOWLEDGED').length,
  };

  return NextResponse.json({ entries: enriched, counts });
}

export async function POST(request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const siteId = body?.siteId;
  const scope = body?.scope;
  const value = (body?.value || '').trim();
  const reason = (body?.reason || '').trim() || null;

  if (!VALID_SCOPES.has(scope)) {
    return NextResponse.json({ error: 'scope must be DOMAIN or URL' }, { status: 400 });
  }
  if (!value) {
    return NextResponse.json({ error: 'value is required' }, { status: 400 });
  }
  if (scope === 'URL' && !/^https?:\/\//i.test(value)) {
    return NextResponse.json({ error: 'URL must start with http:// or https://' }, { status: 400 });
  }

  const auth = await authorizeSiteAccess(user, siteId);
  if (auth.error) return auth.error;

  // Upsert by (siteId, scope, value). If already present and was previously
  // exported, leave the record alone — re-adding shouldn't reset its status.
  const existing = await prisma.disavowEntry.findFirst({
    where: { siteId, scope, value },
  });

  let entry;
  if (existing) {
    entry = existing;
  } else {
    entry = await prisma.disavowEntry.create({
      data: {
        siteId,
        scope,
        value,
        reason,
        createdById: user.id,
        status: 'PENDING',
      },
    });
  }

  // Mark covered backlinks as disavowed so the table flag is in sync. We use
  // updateMany for both scopes — cheap, no per-row branching.
  const where = entryMatchWhere(siteId, scope, value);
  const result = await prisma.backlink.updateMany({ where, data: { isDisavowed: true } });

  return NextResponse.json({
    success: true,
    entry: {
      id: entry.id,
      scope: entry.scope,
      value: entry.value,
      reason: entry.reason,
      status: entry.status,
      createdAt: entry.createdAt,
    },
    coverageCount: result.count,
    alreadyExisted: !!existing,
  });
}
