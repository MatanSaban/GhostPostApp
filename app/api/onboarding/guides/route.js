import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember } from '@/lib/auth-permissions';
import { VALID_GUIDE_IDS } from '@/lib/guides';

async function resolveAccountId() {
  const { authorized, member, error } = await getCurrentAccountMember();
  if (!authorized) return { error, status: 401 };
  const accountId = member?.accountId;
  if (!accountId) return { error: 'No account selected', status: 400 };
  return { accountId };
}

function normalizeCompleted(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const v of value) {
    if (typeof v !== 'string') continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/**
 * GET /api/onboarding/guides
 * Returns { completedGuides: string[] } for the current account.
 */
export async function GET() {
  try {
    const resolved = await resolveAccountId();
    if (resolved.error) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    const account = await prisma.account.findUnique({
      where: { id: resolved.accountId },
      select: { completedGuides: true },
    });
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    return NextResponse.json({
      completedGuides: normalizeCompleted(account.completedGuides),
    });
  } catch (error) {
    console.error('Guides GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch guides state' }, { status: 500 });
  }
}

/**
 * POST /api/onboarding/guides
 * Body: { action: 'complete' | 'reset', guideId: string }
 *   - 'complete' adds guideId to completedGuides (idempotent).
 *   - 'reset' removes guideId so the user can replay and earn the ✓ again.
 *
 * Alternate body: { action: 'resetAll' } - clears every completion (used
 * when the user triggers a full onboarding restart from GuidesCenter).
 */
export async function POST(request) {
  try {
    const resolved = await resolveAccountId();
    if (resolved.error) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    const body = await request.json().catch(() => ({}));
    const { action, guideId } = body || {};

    const account = await prisma.account.findUnique({
      where: { id: resolved.accountId },
      select: { completedGuides: true },
    });
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const current = normalizeCompleted(account.completedGuides);
    let next;

    if (action === 'complete') {
      if (!guideId || !VALID_GUIDE_IDS.has(guideId)) {
        return NextResponse.json({ error: 'Invalid guideId' }, { status: 400 });
      }
      next = current.includes(guideId) ? current : [...current, guideId];
    } else if (action === 'reset') {
      if (!guideId || !VALID_GUIDE_IDS.has(guideId)) {
        return NextResponse.json({ error: 'Invalid guideId' }, { status: 400 });
      }
      next = current.filter((id) => id !== guideId);
    } else if (action === 'resetAll') {
      next = [];
    } else {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    const updated = await prisma.account.update({
      where: { id: resolved.accountId },
      data: { completedGuides: next },
      select: { completedGuides: true },
    });

    return NextResponse.json({
      completedGuides: normalizeCompleted(updated.completedGuides),
    });
  } catch (error) {
    console.error('Guides POST error:', error);
    return NextResponse.json({ error: 'Failed to update guides state' }, { status: 500 });
  }
}
