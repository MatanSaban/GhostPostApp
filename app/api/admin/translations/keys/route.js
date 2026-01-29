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

// GET /api/admin/translations/keys - Get all keys with translations
export async function GET(request) {
  const admin = await verifySuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const namespace = searchParams.get('namespace') || undefined;
  const limitParam = searchParams.get('limit');
  let take = 100;
  if (limitParam) {
    const parsed = parseInt(limitParam, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 10000) take = parsed;
  }

  try {
    const where = namespace && namespace !== '__ALL__' ? { namespace } : {};
    const total = await prisma.i18nKey.count({ where });
    
    const keys = await prisma.i18nKey.findMany({
      where,
      orderBy: [{ id: 'desc' }],
      take
    });

    const languages = await prisma.i18nLanguage.findMany();
    
    const latestTranslations = await prisma.i18nTranslation.findMany({
      where: { isLatest: true, keyId: { in: keys.map(k => k.id) } },
      select: { keyId: true, locale: true, value: true }
    });

    const map = new Map();
    for (const t of latestTranslations) {
      const obj = map.get(t.keyId) || {};
      obj[t.locale] = t.value;
      map.set(t.keyId, obj);
    }

    const rows = keys.map(k => ({
      id: k.id,
      key: k.key,
      namespace: k.namespace,
      description: k.description,
      values: map.get(k.id) || {}
    }));

    return NextResponse.json({ rows, locales: languages.map(l => l.locale), total });
  } catch (e) {
    console.error('Error fetching keys:', e);
    return NextResponse.json({ error: 'Failed to fetch keys' }, { status: 500 });
  }
}

// POST /api/admin/translations/keys - Create a new key
export async function POST(request) {
  const admin = await verifySuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { key, namespace, description } = body;

    if (!key || !namespace) {
      return NextResponse.json({ error: 'Missing key or namespace' }, { status: 400 });
    }

    const created = await prisma.i18nKey.create({
      data: { key, namespace, description }
    });

    return NextResponse.json({ ok: true, id: created.id });
  } catch (e) {
    console.error('Error creating key:', e);
    if (e.code === 'P2002') {
      return NextResponse.json({ error: 'Key already exists' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create key' }, { status: 500 });
  }
}

// PATCH /api/admin/translations/keys - Update a key
export async function PATCH(request) {
  const admin = await verifySuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { id, key, namespace, description } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    const existing = await prisma.i18nKey.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Key not found' }, { status: 404 });
    }

    const newKey = key ?? existing.key;
    const newNamespace = namespace ?? existing.namespace;

    const updated = await prisma.i18nKey.update({
      where: { id },
      data: { key: newKey, namespace: newNamespace, description }
    });

    // Update denormalized fields in translations
    if (newKey !== existing.key || newNamespace !== existing.namespace) {
      await prisma.i18nTranslation.updateMany({
        where: { keyId: id },
        data: { key: newKey, namespace: newNamespace }
      });
    }

    return NextResponse.json({ ok: true, id: updated.id });
  } catch (e) {
    console.error('Error updating key:', e);
    return NextResponse.json({ error: 'Failed to update key' }, { status: 500 });
  }
}

// DELETE /api/admin/translations/keys - Delete keys
export async function DELETE(request) {
  const admin = await verifySuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const idParam = searchParams.get('id');
    let ids = [];

    if (idParam) {
      ids = [idParam];
    } else {
      const body = await request.json().catch(() => null);
      if (body?.ids && Array.isArray(body.ids)) {
        ids = body.ids.filter(x => typeof x === 'string');
      }
    }

    if (!ids.length) {
      return NextResponse.json({ error: 'No ids provided' }, { status: 400 });
    }

    // Delete translations first (cascade)
    await prisma.i18nTranslation.deleteMany({ where: { keyId: { in: ids } } });
    const del = await prisma.i18nKey.deleteMany({ where: { id: { in: ids } } });

    return NextResponse.json({ ok: true, deleted: del.count });
  } catch (e) {
    console.error('Error deleting keys:', e);
    return NextResponse.json({ error: 'Failed to delete keys' }, { status: 500 });
  }
}
