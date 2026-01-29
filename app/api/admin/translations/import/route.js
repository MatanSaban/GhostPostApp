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

// POST /api/admin/translations/import - Bulk import translations from JSON
export async function POST(request) {
  const admin = await verifySuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { locale, defaultNamespace = 'common', createMissing = true, entries } = body;

    if (!locale || !entries || typeof entries !== 'object') {
      return NextResponse.json({ error: 'Missing locale or entries' }, { status: 400 });
    }

    const lang = await prisma.i18nLanguage.findUnique({ where: { locale } });
    if (!lang) {
      return NextResponse.json({ error: 'Language not found' }, { status: 404 });
    }

    // Normalize entries - ensure all keys have namespace prefix
    const normalized = {};
    for (const [k, v] of Object.entries(entries)) {
      if (typeof v !== 'string') continue;
      const key = k.includes('.') ? k : `${defaultNamespace}.${k}`;
      normalized[key] = v;
    }

    const allKeys = Object.keys(normalized);
    if (!allKeys.length) {
      return NextResponse.json({ 
        ok: true, 
        summary: { createdKeys: 0, updatedTranslations: 0, skipped: 0, failed: 0, unchanged: 0 } 
      });
    }

    // Get existing keys
    const existingKeys = await prisma.i18nKey.findMany({
      where: { key: { in: allKeys } },
      select: { id: true, key: true, namespace: true }
    });
    const existingMap = new Map(existingKeys.map(k => [k.key, k]));

    // Create missing keys if enabled
    let createdKeys = 0;
    if (createMissing) {
      for (const key of allKeys) {
        if (!existingMap.has(key)) {
          const namespace = key.split('.')[0] || defaultNamespace;
          try {
            const created = await prisma.i18nKey.create({ data: { key, namespace } });
            existingMap.set(created.key, created);
            createdKeys++;
          } catch { /* ignore duplicates */ }
        }
      }
    }

    // Refresh key records
    const keyRecords = await prisma.i18nKey.findMany({
      where: { key: { in: allKeys } },
      select: { id: true, key: true, namespace: true }
    });
    const keyIdMap = new Map(keyRecords.map(k => [k.key, k.id]));

    // Get existing translations
    const existingTranslations = await prisma.i18nTranslation.findMany({
      where: { languageId: lang.id, keyId: { in: keyRecords.map(k => k.id) }, isLatest: true },
      select: { keyId: true, value: true }
    });
    const latestValByKeyId = new Map(existingTranslations.map(t => [t.keyId, t.value]));

    // Build list of translations to insert
    let updatedTranslations = 0;
    let failed = 0;
    let skipped = 0;
    let unchanged = 0;
    const toInsert = [];
    const toUpdateKeyIds = new Set();

    for (const key of allKeys) {
      const keyId = keyIdMap.get(key);
      if (!keyId) { skipped++; continue; }
      
      const newVal = normalized[key];
      const prevVal = latestValByKeyId.get(keyId);
      
      if (prevVal !== undefined && prevVal === newVal) { unchanged++; continue; }
      
      toUpdateKeyIds.add(keyId);
      toInsert.push({
        keyId,
        languageId: lang.id,
        key,
        namespace: key.split('.')[0] || defaultNamespace,
        locale: lang.locale,
        value: newVal,
        status: 'APPROVED',
        isLatest: true
      });
    }

    // Update existing translations and insert new ones
    if (toInsert.length) {
      await prisma.i18nTranslation.updateMany({
        where: { languageId: lang.id, keyId: { in: Array.from(toUpdateKeyIds) }, isLatest: true },
        data: { isLatest: false }
      });

      // Insert in chunks
      const CHUNK = 500;
      for (let i = 0; i < toInsert.length; i += CHUNK) {
        const slice = toInsert.slice(i, i + CHUNK);
        try {
          const result = await prisma.i18nTranslation.createMany({ data: slice });
          updatedTranslations += result.count;
        } catch {
          // Fallback to individual inserts
          for (const rec of slice) {
            try {
              await prisma.i18nTranslation.create({ data: rec });
              updatedTranslations++;
            } catch { failed++; }
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      summary: { createdKeys, updatedTranslations, skipped, failed, unchanged, totalKeys: allKeys.length }
    });
  } catch (e) {
    console.error('Error importing translations:', e);
    return NextResponse.json({ error: 'Import failed' }, { status: 500 });
  }
}
