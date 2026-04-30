import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { isValidIsraeliId } from '@/lib/israeli-id';

const SESSION_COOKIE = 'user_session';

/**
 * POST /api/auth/registration/save-citizen-id
 *
 * Persists the user's Israeli citizen ID (Teudat Zehut) on their draft
 * User row during registration, and enforces global uniqueness so a single
 * person can't register multiple accounts to abuse free trials or sample
 * plans.
 *
 * Uniqueness is enforced in application code (an explicit `findFirst`
 * pre-check) rather than via a DB-level @unique on the column. Mongo's
 * unique index treats every null as equal, so a global @unique would
 * refuse to build on a User collection that already has rows without a
 * citizenId. The plain `@@index([citizenId])` keeps the lookup fast.
 *
 * There's a small TOCTOU window between the findFirst and the update —
 * if two registrations submit the same ID at exactly the same instant
 * they could both succeed. Acceptable for an abuse-prevention measure
 * that is also re-checked at finalize time.
 *
 * Idempotent: re-saving the same citizenId on the same user updates only
 * the same row (the findFirst excludes self via id != current).
 *
 * Body: { citizenId: string }
 * Returns: { success, citizenId } on success, { error, errorCode } on failure.
 */
export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const sessionUserId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!sessionUserId) {
      return NextResponse.json(
        { error: 'No registration in progress' },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const raw = (body.citizenId || '').toString().replace(/\D/g, '');

    if (!raw) {
      return NextResponse.json(
        { error: 'Citizen ID is required', errorCode: 'required' },
        { status: 400 }
      );
    }
    if (!isValidIsraeliId(raw)) {
      return NextResponse.json(
        { error: 'Invalid Israeli ID', errorCode: 'invalid' },
        { status: 400 }
      );
    }

    // Application-level uniqueness check. Excludes the current user so
    // re-saving the same ID on the same draft is a no-op rather than
    // a self-collision.
    const collision = await prisma.user.findFirst({
      where: { citizenId: raw, id: { not: sessionUserId } },
      select: { id: true },
    });
    if (collision) {
      return NextResponse.json(
        {
          error: 'This ID is already registered to another account',
          errorCode: 'duplicate',
        },
        { status: 409 }
      );
    }

    const user = await prisma.user.update({
      where: { id: sessionUserId },
      data: { citizenId: raw },
      select: { id: true, citizenId: true },
    });
    return NextResponse.json({ success: true, citizenId: user.citizenId });
  } catch (error) {
    console.error('Save citizen ID error:', error);
    return NextResponse.json(
      { error: 'Failed to save citizen ID' },
      { status: 500 }
    );
  }
}
