/**
 * Available Report Periods
 *
 * GET /api/reports/available-periods?siteId=xxx
 *
 * Returns the set of months that have audit or agent-action data for a site,
 * so the report UI can constrain its month pickers to periods that will
 * actually produce something, rather than letting the user choose empty
 * ranges that silently render blank sections.
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember } from '@/lib/auth-permissions';
import { hasPermission, CAPABILITIES } from '@/lib/permissions';

function toMonthKey(date) {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function monthRange(key) {
  // `YYYY-MM` → [startOfMonthUTC, endOfMonthUTC].
  const [y, m] = key.split('-').map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const to = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0) - 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

export async function GET(request) {
  try {
    const { authorized, member } = await getCurrentAccountMember();
    if (!authorized || !member) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!hasPermission(member, 'REPORTS', CAPABILITIES.VIEW)) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
    }

    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { accountId: true },
    });
    if (!site || site.accountId !== member.accountId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Mongo through Prisma doesn't have groupBy for month buckets directly,
    // so we pull the timestamp fields and bucket in JS. Keep the select
    // narrow and rely on ordering + takeN to cap memory on older sites.
    const [audits, actions] = await Promise.all([
      prisma.siteAudit.findMany({
        where: { siteId, status: 'COMPLETED', completedAt: { not: null } },
        orderBy: { completedAt: 'desc' },
        select: { completedAt: true },
        take: 500,
      }),
      prisma.agentInsight.findMany({
        where: { siteId, status: 'EXECUTED', executedAt: { not: null } },
        orderBy: { executedAt: 'desc' },
        select: { executedAt: true },
        take: 2000,
      }),
    ]);

    const auditMonths = new Set();
    let auditEarliest = null;
    let auditLatest = null;
    for (const a of audits) {
      const key = toMonthKey(a.completedAt);
      if (key) auditMonths.add(key);
      const t = a.completedAt ? new Date(a.completedAt).getTime() : null;
      if (t != null) {
        if (auditLatest == null || t > auditLatest) auditLatest = t;
        if (auditEarliest == null || t < auditEarliest) auditEarliest = t;
      }
    }

    const actionMonths = new Set();
    let actionEarliest = null;
    let actionLatest = null;
    for (const a of actions) {
      const key = toMonthKey(a.executedAt);
      if (key) actionMonths.add(key);
      const t = a.executedAt ? new Date(a.executedAt).getTime() : null;
      if (t != null) {
        if (actionLatest == null || t > actionLatest) actionLatest = t;
        if (actionEarliest == null || t < actionEarliest) actionEarliest = t;
      }
    }

    const union = new Set([...auditMonths, ...actionMonths]);
    // Newest → oldest so the UI shows the most recent month first by default.
    const availableMonths = [...union].sort((a, b) => (a < b ? 1 : -1));

    return NextResponse.json({
      audits: {
        earliest: auditEarliest ? new Date(auditEarliest).toISOString() : null,
        latest: auditLatest ? new Date(auditLatest).toISOString() : null,
        months: [...auditMonths].sort((a, b) => (a < b ? 1 : -1)),
      },
      actions: {
        earliest: actionEarliest ? new Date(actionEarliest).toISOString() : null,
        latest: actionLatest ? new Date(actionLatest).toISOString() : null,
        months: [...actionMonths].sort((a, b) => (a < b ? 1 : -1)),
      },
      availableMonths,
      hasComparison: availableMonths.length >= 2,
      // Expose month→range for the client so it doesn't have to recompute.
      ranges: availableMonths.reduce((acc, key) => {
        acc[key] = monthRange(key);
        return acc;
      }, {}),
    });
  } catch (error) {
    console.error('[ReportPeriods] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch available periods' }, { status: 500 });
  }
}
