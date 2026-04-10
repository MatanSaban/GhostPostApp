import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { generateTextResponse } from '@/lib/ai';

const SESSION_COOKIE = 'user_session';

async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) return null;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isSuperAdmin: true },
    });
    return user;
  } catch {
    return null;
  }
}

// POST /api/backlinks/translate-title
// Translates listing titles to target language, caches in DB
export async function POST(request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { listingIds, targetLang } = await request.json();

    if (!targetLang || !Array.isArray(listingIds) || listingIds.length === 0) {
      return NextResponse.json({ error: 'Missing listingIds or targetLang' }, { status: 400 });
    }

    // Limit batch size to prevent abuse
    if (listingIds.length > 50) {
      return NextResponse.json({ error: 'Max 50 listings per request' }, { status: 400 });
    }

    // Fetch listings that need translation
    const listings = await prisma.backlinkListing.findMany({
      where: { id: { in: listingIds } },
      select: { id: true, title: true, language: true, titleTranslations: true },
    });

    const translations = {};
    const needsAI = [];

    // Check which already have cached translations
    for (const listing of listings) {
      // If listing is already in the target language, use original title
      if (listing.language === targetLang) {
        translations[listing.id] = listing.title;
        continue;
      }

      const cached = listing.titleTranslations;
      if (cached && typeof cached === 'object' && cached[targetLang]) {
        translations[listing.id] = cached[targetLang];
      } else {
        needsAI.push(listing);
      }
    }

    // Batch translate with AI if needed
    if (needsAI.length > 0) {
      const langNames = { en: 'English', he: 'Hebrew', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese', ar: 'Arabic' };
      const targetLangName = langNames[targetLang] || targetLang;

      const titlesToTranslate = needsAI.map((l, i) => `${i + 1}. ${l.title}`).join('\n');

      const result = await generateTextResponse({
        system: `You are a professional translator. Translate the following listing titles to ${targetLangName}. Return ONLY the translated titles, one per line, numbered to match the input. Do not add explanations or extra text.`,
        prompt: titlesToTranslate,
        maxTokens: 1024,
        temperature: 0.3,
        operation: 'GENERIC',
        metadata: { type: 'backlink-title-translation', targetLang, count: needsAI.length },
      });

      // Parse AI response - extract numbered lines
      const lines = result.trim().split('\n')
        .map(line => line.replace(/^\d+\.\s*/, '').trim())
        .filter(Boolean);

      // Save translations to DB and build response
      const updatePromises = [];
      for (let i = 0; i < needsAI.length; i++) {
        const listing = needsAI[i];
        const translated = lines[i] || listing.title; // Fallback to original if AI response is short
        translations[listing.id] = translated;

        // Merge with existing translations
        const existing = (listing.titleTranslations && typeof listing.titleTranslations === 'object') ? listing.titleTranslations : {};
        updatePromises.push(
          prisma.backlinkListing.update({
            where: { id: listing.id },
            data: { titleTranslations: { ...existing, [targetLang]: translated } },
          })
        );
      }

      // Save all translations in parallel
      await Promise.all(updatePromises);
    }

    return NextResponse.json({ translations });
  } catch (error) {
    console.error('Error translating backlink titles:', error);
    return NextResponse.json({ error: 'Translation failed' }, { status: 500 });
  }
}
