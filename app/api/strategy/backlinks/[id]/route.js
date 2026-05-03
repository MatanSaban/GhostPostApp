import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser, loadAccessibleSite, accountHasPaidPlan } from '@/lib/backlinks/access';

const NOTES_MAX = 1000;

async function loadBacklinkAndAuthorize(user, id) {
  const row = await prisma.backlink.findUnique({
    where: { id },
    select: { id: true, siteId: true },
  });
  if (!row) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  const access = await loadAccessibleSite({
    userId: user.id,
    isSuperAdmin: user.isSuperAdmin,
    siteId: row.siteId,
  });
  if (!access) return { error: NextResponse.json({ error: 'No access' }, { status: 403 }) };
  if (!accountHasPaidPlan(access.account)) {
    return { error: NextResponse.json({ error: 'Backlink Audit requires a paid plan', code: 'PLAN_REQUIRED' }, { status: 403 }) };
  }
  return { row };
}

export async function PATCH(request, { params }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const auth = await loadBacklinkAndAuthorize(user, id);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const data = {};
  if (typeof body.isToxic === 'boolean') {
    data.isToxic = body.isToxic;
    // Manual toggles never claim the AI's confidence threshold; clear the
    // confidence so we don't mislead users into thinking a manual mark was
    // AI-validated.
    data.toxicConfidence = null;
    if (!body.isToxic) data.toxicReason = null;
    else if (typeof body.toxicReason === 'string') data.toxicReason = body.toxicReason.slice(0, 500) || null;
  }
  if (typeof body.isHidden === 'boolean') {
    data.isHidden = body.isHidden;
  }
  if (typeof body.notes === 'string' || body.notes === null) {
    data.notes = body.notes ? String(body.notes).slice(0, NOTES_MAX) : null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No updatable fields supplied' }, { status: 400 });
  }

  const updated = await prisma.backlink.update({ where: { id }, data });
  return NextResponse.json({
    success: true,
    row: {
      id: updated.id,
      isToxic: updated.isToxic,
      isHidden: updated.isHidden,
      notes: updated.notes,
    },
  });
}
