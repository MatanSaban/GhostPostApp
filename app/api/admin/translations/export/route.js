import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

// Check if user is super admin
async function verifySuperAdmin() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, isSuperAdmin: true }
    });

    if (!user?.isSuperAdmin) return null;
    return user;
  } catch {
    return null;
  }
}

// GET /api/admin/translations/export - Export translations as JSON
export async function GET(request) {
  const admin = await verifySuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const locale = searchParams.get('locale');
  const namespace = searchParams.get('namespace');

  if (!locale) {
    return NextResponse.json({ error: 'Missing locale parameter' }, { status: 400 });
  }

  try {
    const where = { locale, isLatest: true };
    if (namespace && namespace !== '__ALL__') {
      where.namespace = namespace;
    }

    const translations = await prisma.i18nTranslation.findMany({
      where,
      select: { key: true, value: true }
    });

    // Build nested object from flat keys
    const result = {};
    for (const t of translations) {
      const parts = t.key.split('.');
      let current = result;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) current[parts[i]] = {};
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = t.value;
    }

    return NextResponse.json(result);
  } catch (e) {
    console.error('Error exporting translations:', e);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
