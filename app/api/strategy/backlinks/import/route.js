import { NextResponse } from 'next/server';
import { getAuthenticatedUser, loadAccessibleSite, accountHasPaidPlan } from '@/lib/backlinks/access';
import { importBacklinksFromGscCsv } from '@/lib/backlinks/sync';
import { parseGscBacklinksCsv } from '@/lib/backlinks/gsc-csv';

export const maxDuration = 60;

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB hard ceiling on any GSC export

export async function POST(request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 });
  }

  const siteId = formData.get('siteId');
  const file = formData.get('file');
  if (!siteId || typeof siteId !== 'string') {
    return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
  }
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 413 });
  }

  const access = await loadAccessibleSite({ userId: user.id, isSuperAdmin: user.isSuperAdmin, siteId });
  if (!access) {
    return NextResponse.json({ error: 'Site not found or no access' }, { status: 404 });
  }
  if (!accountHasPaidPlan(access.account)) {
    return NextResponse.json({ error: 'Backlink Audit requires a paid plan', code: 'PLAN_REQUIRED' }, { status: 403 });
  }

  let parsed;
  try {
    const text = await file.text();
    parsed = parseGscBacklinksCsv(text);
  } catch (err) {
    return NextResponse.json(
      { error: String(err?.message || 'CSV parse failed'), code: 'PARSE_ERROR' },
      { status: 400 }
    );
  }

  if (parsed.items.length === 0) {
    return NextResponse.json({ error: 'No valid rows found in the CSV', code: 'EMPTY' }, { status: 400 });
  }

  try {
    const sync = await importBacklinksFromGscCsv({
      siteId,
      items: parsed.items,
      triggeredBy: user.id,
    });
    return NextResponse.json({
      success: true,
      format: parsed.format,
      sync: {
        id: sync.id,
        status: sync.status,
        totalFound: sync.totalFound,
        newCount: sync.newCount,
        lostCount: sync.lostCount,
        completedAt: sync.completedAt,
      },
    });
  } catch (err) {
    console.error('[backlinks/import] failed:', err);
    return NextResponse.json({ error: String(err?.message || 'Import failed') }, { status: 500 });
  }
}
