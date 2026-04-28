import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { getDraftAccountForUser } from '@/lib/draft-account';

const SESSION_COOKIE = 'user_session';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * POST /api/auth/registration/entities/select
 *
 * Body: { selectedSlugs: string[] }
 *
 * Persists the user's entity-type selection on the in-flight scan record.
 * Used by the registration chat after the user picks types in the
 * EntitiesSelectionPanel. The selection is later consulted at finalize to
 * decide which discovered types/entities migrate onto the new Site.
 */
export async function POST(request) {
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: 'No registration in progress' }, { status: 400 });
  }

  const draftAccount = await getDraftAccountForUser(user.id);
  if (!draftAccount) {
    return NextResponse.json({ error: 'No draft account found' }, { status: 404 });
  }

  let body = {};
  try { body = await request.json(); } catch { /* allow empty body */ }

  const selectedSlugs = Array.isArray(body.selectedSlugs)
    ? body.selectedSlugs.filter(s => typeof s === 'string' && s.length > 0)
    : [];

  const interviewData = draftAccount.draftInterviewData || {};
  const existingScan = interviewData.entityScan;

  if (!existingScan) {
    return NextResponse.json({
      error: 'No scan to select against - POST /scan first',
    }, { status: 400 });
  }

  const merged = {
    ...interviewData,
    entityScan: {
      ...existingScan,
      selectedSlugs,
      selectedAt: new Date().toISOString(),
    },
  };

  await prisma.account.update({
    where: { id: draftAccount.id },
    data: { draftInterviewData: merged },
  });

  return NextResponse.json({
    success: true,
    selectedSlugs,
  });
}
