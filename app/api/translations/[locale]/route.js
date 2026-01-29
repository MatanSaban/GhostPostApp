import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// In-memory cache with TTL
const cache = new Map();
const CACHE_TTL = 60 * 1000; // 1 minute cache

// Deep merge utility - merges source into target
function deepMerge(target, source) {
  const result = { ...target };
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

// GET /api/translations/[locale] - Get all translations for a locale
export async function GET(request, { params }) {
  const { locale } = await params;

  if (!locale) {
    return NextResponse.json({ error: 'Missing locale' }, { status: 400 });
  }

  // Check cache
  const cacheKey = `translations:${locale}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data, {
      headers: {
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
        'X-Cache': 'HIT'
      }
    });
  }

  try {
    // First, load the base JSON dictionary as the foundation
    let baseDict = {};
    try {
      const jsonDict = await import(`@/i18n/dictionaries/${locale}.json`);
      baseDict = jsonDict.default || {};
    } catch {
      // If JSON file doesn't exist, try English as fallback
      if (locale !== 'en') {
        try {
          const enDict = await import('@/i18n/dictionaries/en.json');
          baseDict = enDict.default || {};
        } catch {
          baseDict = {};
        }
      }
    }

    // Fetch database translations and merge on top (database overrides JSON)
    let dbTranslations = {};
    try {
      const translations = await prisma.i18nTranslation.findMany({
        where: {
          locale,
          isLatest: true
        },
        select: {
          key: true,
          value: true
        }
      });

      // Build nested object from flat keys
      for (const t of translations) {
        const parts = t.key.split('.');
        let current = dbTranslations;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!current[parts[i]]) current[parts[i]] = {};
          current = current[parts[i]];
        }
        current[parts[parts.length - 1]] = t.value;
      }
    } catch (dbError) {
      console.error('Database translation fetch error:', dbError);
      // Continue with just the base dictionary
    }

    // Merge: base JSON + database overrides
    const result = deepMerge(baseDict, dbTranslations);

    // Update cache
    cache.set(cacheKey, { data: result, timestamp: Date.now() });

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
        'X-Cache': 'MISS'
      }
    });
  } catch (e) {
    console.error('Error fetching translations:', e);
    
    // Final fallback: try to load from JSON file
    try {
      const dict = await import(`@/i18n/dictionaries/${locale}.json`);
      return NextResponse.json(dict.default, {
        headers: {
          'X-Cache': 'FALLBACK'
        }
      });
    } catch {
      return NextResponse.json({ error: 'Failed to load translations' }, { status: 500 });
    }
  }
}
