import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generateTextResponse } from '@/lib/ai/gemini';

const MAX_NAME_LEN = 100;
const MAX_SLUG_LEN = 50;
const MIN_SLUG_LEN = 3;

const slugify = (s) =>
  String(s || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

// POST /api/auth/account/translate-slug
// Accepts a (possibly non-English) organization name and returns an English
// slug that is currently available in the platform. Used by the registration
// account-setup step so Hebrew/etc. names still produce a valid Organization URL.
export async function POST(request) {
  try {
    const { name } = await request.json();
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const trimmed = name.trim().slice(0, MAX_NAME_LEN);

    // Ask AI for a transliteration / English equivalent suitable for a URL slug.
    let aiSlug = '';
    try {
      const result = await generateTextResponse({
        system:
          'You convert organization names from any language into short English URL slugs. ' +
          'Reply with ONLY the slug. Format: lowercase ASCII letters, digits, and hyphens only. ' +
          'Length: 3-30 characters. Prefer transliteration over translation when the name is a proper noun. ' +
          'No spaces, no punctuation, no quotes, no explanation.',
        prompt: `Organization name: ${trimmed}\nSlug:`,
        maxTokens: 32,
        temperature: 0.2,
        operation: 'GENERIC',
        metadata: { type: 'account-slug-translation' },
      });
      aiSlug = slugify(result);
    } catch (err) {
      console.error('translate-slug AI error:', err);
    }

    if (!aiSlug || aiSlug.length < MIN_SLUG_LEN) {
      aiSlug = `org-${Math.random().toString(36).slice(2, 8)}`;
    }
    if (aiSlug.length > MAX_SLUG_LEN) {
      aiSlug = aiSlug.slice(0, MAX_SLUG_LEN).replace(/-+$/, '');
    }

    let candidate = aiSlug;
    for (let suffix = 1; suffix <= 20; suffix++) {
      const exists = await prisma.account.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!exists) {
        return NextResponse.json({ slug: candidate });
      }
      const next = `${aiSlug}-${suffix + 1}`;
      candidate = next.length > MAX_SLUG_LEN ? next.slice(0, MAX_SLUG_LEN) : next;
    }

    const fallback = `${aiSlug}-${Math.random().toString(36).slice(2, 6)}`.slice(0, MAX_SLUG_LEN);
    return NextResponse.json({ slug: fallback });
  } catch (error) {
    console.error('translate-slug error:', error);
    return NextResponse.json({ error: 'Failed to generate slug' }, { status: 500 });
  }
}
