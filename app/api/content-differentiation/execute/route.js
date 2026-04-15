import { NextResponse } from 'next/server';
import { getCurrentAccountMember } from '@/lib/auth-permissions';
import { executeDifferentiationFixes } from '@/lib/actions/content-differentiation';

/**
 * POST /api/content-differentiation/execute
 * Execute approved differentiation fixes: deduct credits, update entities, push to WP.
 * Body: { jobId: string, siteId: string }
 */
export async function POST(request) {
  try {
    const { authorized, member, error } = await getCurrentAccountMember();
    if (!authorized) {
      return NextResponse.json({ error }, { status: 401 });
    }

    const body = await request.json();
    const { jobId, siteId } = body;

    if (!jobId) {
      return NextResponse.json({ error: 'jobId required' }, { status: 400 });
    }
    if (!siteId) {
      return NextResponse.json({ error: 'siteId required' }, { status: 400 });
    }

    const result = await executeDifferentiationFixes({
      jobId,
      userId: member.userId || member.id,
      accountId: member.accountId,
      siteId,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('[ContentDifferentiation] Execute error:', err);
    const status = err.message?.includes('Insufficient') ? 402 : 
                   err.message?.includes('Unauthorized') ? 403 : 500;
    return NextResponse.json({ error: err.message || 'Execution failed' }, { status });
  }
}
