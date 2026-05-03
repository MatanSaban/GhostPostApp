import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser, loadAccessibleSite, accountHasPaidPlan } from '@/lib/backlinks/access';
import { entryMatchWhere } from '@/lib/backlinks/disavow';

/**
 * Apply a backlink-audit insight's recommended action.
 *
 * Today only the TOXIC insight is fixable: its action creates a domain-scoped
 * DisavowEntry and flips matching backlinks to isDisavowed=true. Other insight
 * types are advisory and return a 400 here — the user actions them by
 * inspecting the data themselves.
 */
export async function POST(request, { params }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const insight = await prisma.agentInsight.findUnique({
    where: { id },
    select: {
      id: true, siteId: true, category: true, status: true,
      actionType: true, actionPayload: true, data: true, titleKey: true,
    },
  });
  if (!insight) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (insight.category !== 'BACKLINKS') {
    return NextResponse.json({ error: 'Wrong category for this endpoint' }, { status: 400 });
  }

  const access = await loadAccessibleSite({
    userId: user.id,
    isSuperAdmin: user.isSuperAdmin,
    siteId: insight.siteId,
  });
  if (!access) return NextResponse.json({ error: 'No access' }, { status: 403 });
  if (!accountHasPaidPlan(access.account)) {
    return NextResponse.json({ error: 'Backlink Audit requires a paid plan', code: 'PLAN_REQUIRED' }, { status: 403 });
  }

  if (insight.status !== 'PENDING') {
    return NextResponse.json({ error: 'Insight already actioned', code: 'NOT_PENDING' }, { status: 409 });
  }

  if (insight.actionType !== 'disavow_domain') {
    return NextResponse.json({ error: 'This insight has no automated fix', code: 'NOT_FIXABLE' }, { status: 400 });
  }

  const payload = insight.actionPayload || {};
  const scope = payload.scope || 'DOMAIN';
  const value = payload.value;
  const reason = payload.reason || insight.data?.reason || null;
  if (!value) return NextResponse.json({ error: 'Missing disavow value on insight' }, { status: 500 });

  // Idempotent create — if the user already manually disavowed this domain
  // before applying the suggestion, we don't error, we just record the apply.
  const existing = await prisma.disavowEntry.findFirst({
    where: { siteId: insight.siteId, scope, value },
  });
  let entry = existing;
  if (!existing) {
    entry = await prisma.disavowEntry.create({
      data: {
        siteId: insight.siteId,
        scope,
        value,
        reason,
        createdById: user.id,
        status: 'PENDING',
      },
    });
  }

  const where = entryMatchWhere(insight.siteId, scope, value);
  const result = await prisma.backlink.updateMany({ where, data: { isDisavowed: true } });

  await prisma.agentInsight.update({
    where: { id },
    data: {
      status: 'EXECUTED',
      executedAt: new Date(),
      executionResult: {
        disavowEntryId: entry.id,
        coverageCount: result.count,
        alreadyExisted: !!existing,
      },
    },
  });

  return NextResponse.json({
    success: true,
    disavowEntryId: entry.id,
    coverageCount: result.count,
  });
}
