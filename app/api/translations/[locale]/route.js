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
          const part = parts[i];
          // If the current path doesn't exist, create an empty object
          if (!current[part]) {
            current[part] = {};
          } 
          // If it exists but is a string, convert to object with _self
          else if (typeof current[part] === 'string') {
            current[part] = { _self: current[part] };
          }
          // If it's somehow not an object (shouldn't happen), skip this translation
          else if (typeof current[part] !== 'object') {
            console.warn(`Skipping translation ${t.key} - path conflict`);
            continue;
          }
          current = current[part];
        }
        
        // Handle the final key
        const finalKey = parts[parts.length - 1];
        if (typeof current !== 'object' || current === null) {
          // This shouldn't happen but handle gracefully
          console.warn(`Skipping translation ${t.key} - current is not an object`);
          continue;
        }
        
        if (typeof current[finalKey] === 'object' && current[finalKey] !== null) {
          // If it's already an object (has children), store value as _self
          current[finalKey]._self = t.value;
        } else {
          current[finalKey] = t.value;
        }
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
