import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * GET /api/public/website/translations
 * Fetch all translations for the marketing website (gp-ws)
 * 
 * Query params:
 * - locale: Language locale (en, fr, he) - required
 * - namespace: Optional filter by namespace (hero, pricing, etc.)
 * 
 * Returns nested object structure matching the original JSON format
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const locale = searchParams.get('locale') || 'en';
    const namespace = searchParams.get('namespace');

    // Build query filters
    const where = {
      application: 'WEBSITE',
      locale,
      isLatest: true,
      ...(namespace && { namespace })
    };

    // Fetch translations
    const translations = await prisma.i18nTranslation.findMany({
      where,
      select: {
        key: true,
        value: true
      },
      orderBy: {
        key: 'asc'
      }
    });

    // Convert flat keys to nested object
    const result = {};
    
    for (const { key, value } of translations) {
      // Parse value - try to restore arrays
      let parsedValue = value;
      if (value.startsWith('[') && value.endsWith(']')) {
        try {
          parsedValue = JSON.parse(value);
        } catch {
          // Keep as string if parsing fails
        }
      }
      
      // Set nested value
      setNestedValue(result, key, parsedValue);
    }

    // Add cache headers - cache for 5 minutes, allow stale for 1 hour
    const headers = {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
    };

    return NextResponse.json({
      locale,
      namespace: namespace || 'all',
      count: translations.length,
      data: result
    }, { headers });

  } catch (error) {
    console.error('Error fetching website translations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch translations' },
      { status: 500 }
    );
  }
}

/**
 * Set a value in a nested object using dot notation
 * e.g., setNestedValue(obj, 'hero.title', 'Hello') -> { hero: { title: 'Hello' } }
 */
function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  let current = obj;
  
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current)) {
      current[key] = {};
    }
    current = current[key];
  }
  
  current[keys[keys.length - 1]] = value;
}
