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

// POST /api/admin/translations/translation - Create or update a translation
export async function POST(request) {
  const admin = await verifySuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { keyId, locale, value, application } = body;

    if (!keyId || !locale) {
      return NextResponse.json({ error: 'Missing keyId or locale' }, { status: 400 });
    }

    const lang = await prisma.i18nLanguage.findUnique({ where: { locale } });
    if (!lang) {
      return NextResponse.json({ error: 'Language not found' }, { status: 404 });
    }

    const key = await prisma.i18nKey.findUnique({ where: { id: keyId } });
    if (!key) {
      return NextResponse.json({ error: 'Key not found' }, { status: 404 });
    }

    // Mark previous latest for this pair as not latest
    await prisma.i18nTranslation.updateMany({
      where: { keyId, languageId: lang.id, isLatest: true },
      data: { isLatest: false }
    });

    // Create new translation (use application from key if not provided)
    const created = await prisma.i18nTranslation.create({
      data: {
        keyId,
        languageId: lang.id,
        key: key.key,
        namespace: key.namespace,
        application: application || key.application || 'PLATFORM',
        locale: lang.locale,
        value: value || '',
        status: 'APPROVED',
        isLatest: true
      }
    });

    return NextResponse.json({ ok: true, id: created.id });
  } catch (e) {
    console.error('Error creating translation:', e);
    return NextResponse.json({ error: 'Failed to save translation' }, { status: 500 });
  }
}
