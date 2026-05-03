import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser, loadAccessibleSite, accountHasPaidPlan } from '@/lib/backlinks/access';
import { getLatestSync } from '@/lib/backlinks/sync';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

const VALID_STATUSES = new Set(['ACTIVE', 'LOST', 'BROKEN']);

function parseIntInRange(value, min, max) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < min || n > max) return null;
  return Math.round(n);
}

export async function GET(request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get('siteId');
  if (!siteId) {
    return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
  }

  const access = await loadAccessibleSite({ userId: user.id, isSuperAdmin: user.isSuperAdmin, siteId });
  if (!access) {
    return NextResponse.json({ error: 'Site not found or no access' }, { status: 404 });
  }
  if (!accountHasPaidPlan(access.account)) {
    return NextResponse.json({ error: 'Backlink Audit requires a paid plan', code: 'PLAN_REQUIRED' }, { status: 403 });
  }

  const page = Math.max(1, Number(searchParams.get('page') || 1));
  const pageSizeRaw = Number(searchParams.get('pageSize') || DEFAULT_PAGE_SIZE);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, pageSizeRaw));

  const statusParam = searchParams.get('status');
  // 'ALL' (or any unrecognized value) drops the status filter entirely so the
  // tab can show ACTIVE+LOST+BROKEN combined; explicit valid values still
  // narrow the query.
  const status = statusParam && VALID_STATUSES.has(statusParam) ? statusParam : null;

  const drMin = parseIntInRange(searchParams.get('drMin'), 0, 100);
  const drMax = parseIntInRange(searchParams.get('drMax'), 0, 100);
  const dofollowParam = searchParams.get('dofollow');
  const anchor = (searchParams.get('anchor') || '').trim();
  const toxicOnly = searchParams.get('toxic') === 'true';

  const where = {
    siteId,
    isHidden: false,
  };
  if (status) where.status = status;
  if (toxicOnly) where.isToxic = true;
  if (anchor) where.anchorText = { contains: anchor, mode: 'insensitive' };
  if (dofollowParam === 'true') where.isDofollow = true;
  else if (dofollowParam === 'false') where.isDofollow = false;
  if (drMin !== null || drMax !== null) {
    where.domainRating = {};
    if (drMin !== null) where.domainRating.gte = drMin;
    if (drMax !== null) where.domainRating.lte = drMax;
  }

  const [total, rows, latestSync] = await Promise.all([
    prisma.backlink.count({ where }),
    prisma.backlink.findMany({
      where,
      orderBy: [
        // MongoDB connector doesn't support `{ sort, nulls }` order syntax;
        // plain 'desc' is required. Rows with null domainRating sort to the
        // bottom of the page on Mongo, which matches the UX we want anyway.
        { domainRating: 'desc' },
        { lastSeen: 'desc' },
      ],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        referringUrl: true,
        referringDomain: true,
        targetUrl: true,
        anchorText: true,
        isDofollow: true,
        domainRating: true,
        spamScore: true,
        firstSeen: true,
        lastSeen: true,
        status: true,
        isToxic: true,
        isDisavowed: true,
        // sources is intentionally excluded from the default response — it's
        // surfaced separately for super-admins via a different query so
        // regular users never see provenance badges.
      },
    }),
    getLatestSync(siteId),
  ]);

  return NextResponse.json({
    rows,
    page,
    pageSize,
    total,
    lastSync: latestSync ? {
      id: latestSync.id,
      // `source` is intentionally omitted — provider names ("DATAFORSEO" /
      // "GSC_CSV") are an internal implementation detail and should not be
      // surfaced to clients.
      status: latestSync.status,
      totalFound: latestSync.totalFound,
      newCount: latestSync.newCount,
      lostCount: latestSync.lostCount,
      createdAt: latestSync.createdAt,
      completedAt: latestSync.completedAt,
    } : null,
  });
}
