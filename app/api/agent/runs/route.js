import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { runSiteAnalysis } from '@/lib/agent-analysis';

const SESSION_COOKIE = 'user_session';

async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) return null;
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        isSuperAdmin: true,
        lastSelectedAccountId: true,
        accountMemberships: { select: { accountId: true } },
      },
    });
  } catch {
    return null;
  }
}

/**
 * GET /api/agent/runs?siteId=xxx&limit=10
 * Returns recent agent runs for a site.
 */
export async function GET(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const hasAccess = user.isSuperAdmin || user.accountMemberships.some(m => m.accountId === site.accountId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10), 50);

    const runs = await prisma.agentRun.findMany({
      where: { siteId },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({ runs });
  } catch (error) {
    console.error('[Agent API] GET runs error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/agent/runs
 * Body: { siteId: string }
 * Trigger a manual agent analysis for a site.
 */
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { siteId } = body;

    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
    }

    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { accountId: true },
    });
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const hasAccess = user.isSuperAdmin || user.accountMemberships.some(m => m.accountId === site.accountId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check for already running analysis
    const runningRun = await prisma.agentRun.findFirst({
      where: { siteId, status: 'RUNNING' },
    });

    if (runningRun) {
      return NextResponse.json({ runId: runningRun.id, status: 'RUNNING' }, { status: 200 });
    }

    // Create the run record first, then fire analysis asynchronously
    const run = await prisma.agentRun.create({
      data: { siteId, accountId: site.accountId, source: 'manual' },
    });

    // Fire and forget - analysis runs in background, client polls for status
    runSiteAnalysis(siteId, site.accountId, 'manual', run.id, user.id).catch(err => {
      console.error(`[Agent API] Background analysis failed for run ${run.id}:`, err);
    });

    return NextResponse.json({ runId: run.id, status: 'RUNNING' });
  } catch (error) {
    console.error('[Agent API] POST runs error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/agent/runs?siteId=xxx[&runId=yyy]
 * Force-fail a stuck agent run. Superadmin / dev only.
 *
 * If runId is omitted, force-fails the currently RUNNING run for the site.
 * Doesn't actually halt the in-flight worker — late writes from the dead
 * process just land on a record that's already FAILED. Mirrors the
 * site-audit DELETE handler.
 */
export async function DELETE(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isDev = process.env.NODE_ENV === 'development';
    if (!user.isSuperAdmin && !isDev) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    const runId = searchParams.get('runId');

    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
    }

    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { accountId: true },
    });
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const run = runId
      ? await prisma.agentRun.findFirst({ where: { id: runId, siteId } })
      : await prisma.agentRun.findFirst({ where: { siteId, status: 'RUNNING' } });

    if (!run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }
    if (run.status !== 'RUNNING') {
      return NextResponse.json({ error: 'Run is not running' }, { status: 409 });
    }

    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        error: `Cancelled by ${user.id} (superadmin=${user.isSuperAdmin}, dev=${isDev})`,
      },
    });

    console.warn(`[Agent API] DELETE: run ${run.id} force-failed by ${user.id} (superadmin=${user.isSuperAdmin}, dev=${isDev})`);
    return NextResponse.json({ ok: true, runId: run.id });
  } catch (error) {
    console.error('[Agent API] DELETE runs error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
