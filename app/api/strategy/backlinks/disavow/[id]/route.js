import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAuthenticatedUser, loadAccessibleSite, accountHasPaidPlan } from '@/lib/backlinks/access';
import { recomputeIsDisavowedForSite } from '@/lib/backlinks/disavow';

async function loadEntryAndAuthorize(user, id) {
  const entry = await prisma.disavowEntry.findUnique({
    where: { id },
    select: { id: true, siteId: true, status: true },
  });
  if (!entry) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  const access = await loadAccessibleSite({
    userId: user.id,
    isSuperAdmin: user.isSuperAdmin,
    siteId: entry.siteId,
  });
  if (!access) return { error: NextResponse.json({ error: 'No access' }, { status: 403 }) };
  if (!accountHasPaidPlan(access.account)) {
    return { error: NextResponse.json({ error: 'Backlink Audit requires a paid plan', code: 'PLAN_REQUIRED' }, { status: 403 }) };
  }
  return { entry };
}

export async function DELETE(request, { params }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const auth = await loadEntryAndAuthorize(user, id);
  if (auth.error) return auth.error;

  await prisma.disavowEntry.delete({ where: { id } });
  // Recompute the coverage flag for the whole site so removing one entry
  // doesn't unflag rows that another entry still covers.
  await recomputeIsDisavowedForSite(auth.entry.siteId);

  return NextResponse.json({ success: true });
}

export async function PATCH(request, { params }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const auth = await loadEntryAndAuthorize(user, id);
  if (auth.error) return auth.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // The only PATCH on a disavow entry today is the "I uploaded it" flow:
  // user confirms they pasted the file into Search Console. Anything else
  // is rejected so we keep the surface small.
  if (body.status === 'ACKNOWLEDGED') {
    if (auth.entry.status !== 'EXPORTED') {
      return NextResponse.json({ error: 'Only exported entries can be acknowledged' }, { status: 400 });
    }
    const updated = await prisma.disavowEntry.update({
      where: { id },
      data: { status: 'ACKNOWLEDGED' },
    });
    return NextResponse.json({ success: true, entry: { id: updated.id, status: updated.status } });
  }

  return NextResponse.json({ error: 'Unsupported update' }, { status: 400 });
}
