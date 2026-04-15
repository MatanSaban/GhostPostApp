import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember } from '@/lib/auth-permissions';

/**
 * GET /api/background-jobs/[id]
 * Poll the status of a background job. Used by useBackgroundJobPolling hook.
 */
export async function GET(request, { params }) {
  try {
    const { authorized, member, error } = await getCurrentAccountMember();
    if (!authorized) {
      return NextResponse.json({ error }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Job ID required' }, { status: 400 });
    }

    const job = await prisma.backgroundJob.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        status: true,
        progress: true,
        message: true,
        resultData: true,
        error: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json({ job });
  } catch (err) {
    console.error('[BackgroundJob] GET error:', err);
    return NextResponse.json({ error: 'Failed to fetch job' }, { status: 500 });
  }
}
