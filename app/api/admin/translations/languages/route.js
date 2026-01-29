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

// GET /api/admin/translations/languages - Get all languages and namespaces
export async function GET() {
  const admin = await verifySuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const [languages, namespacesAgg] = await Promise.all([
      prisma.i18nLanguage.findMany({ orderBy: { locale: 'asc' } }),
      prisma.i18nKey.findMany({ select: { namespace: true } })
    ]);
    const namespaces = Array.from(new Set(namespacesAgg.map(n => n.namespace))).sort();
    return NextResponse.json({ languages, namespaces });
  } catch (e) {
    console.error('Error fetching languages:', e);
    return NextResponse.json({ error: 'Failed to fetch languages' }, { status: 500 });
  }
}

// POST /api/admin/translations/languages - Create or update a language
export async function POST(request) {
  const admin = await verifySuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { locale, name, isRTL, fallback } = body;

    if (!locale || !name) {
      return NextResponse.json({ error: 'Missing locale or name' }, { status: 400 });
    }

    const language = await prisma.i18nLanguage.upsert({
      where: { locale },
      update: { name, isRTL: !!isRTL, fallback: Array.isArray(fallback) ? fallback : [] },
      create: { locale, name, isRTL: !!isRTL, fallback: Array.isArray(fallback) ? fallback : [] }
    });

    return NextResponse.json({ ok: true, language });
  } catch (e) {
    console.error('Error creating language:', e);
    return NextResponse.json({ error: 'Failed to create language' }, { status: 500 });
  }
}
