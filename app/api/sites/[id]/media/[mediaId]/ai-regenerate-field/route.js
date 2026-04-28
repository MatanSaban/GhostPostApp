import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { generateStructuredResponse } from '@/lib/ai/gemini';
import { enforceCredits } from '@/lib/account-limits';
import { BOT_FETCH_HEADERS } from '@/lib/bot-identity';

const SESSION_COOKIE = 'user_session';
const FIELD_COST = 1;
const ALLOWED_FIELDS = ['altText', 'title', 'caption', 'description'];

async function verifyUserSiteAccess(siteId) {
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!userId) return { authorized: false, error: 'Unauthorized' };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      isSuperAdmin: true,
      accountMemberships: { select: { accountId: true } },
    },
  });
  if (!user) return { authorized: false, error: 'User not found' };

  const siteWhere = user.isSuperAdmin
    ? { id: siteId }
    : { id: siteId, accountId: { in: user.accountMemberships.map(m => m.accountId) } };
  const site = await prisma.site.findFirst({ where: siteWhere });
  if (!site) return { authorized: false, error: 'Site not found or access denied' };

  return { authorized: true, userId: user.id, site };
}

function languageName(code) {
  const map = { en: 'English', he: 'Hebrew', ar: 'Arabic', fr: 'French', es: 'Spanish', de: 'German', pt: 'Portuguese', ru: 'Russian', it: 'Italian', nl: 'Dutch', pl: 'Polish', tr: 'Turkish', ja: 'Japanese', zh: 'Chinese', ko: 'Korean' };
  const base = (code || '').toLowerCase().split('-')[0];
  return map[base] || code || 'English';
}

function detectLanguageFromHtml(html) {
  const langAttr = html.match(/<html[^>]*\slang=["']([a-zA-Z-]+)["']/i);
  if (langAttr?.[1]) return langAttr[1].toLowerCase().slice(0, 5);
  if (/<html[^>]*\sdir=["']rtl["']/i.test(html)) return 'he';
  const metaLang = html.match(/<meta[^>]+http-equiv=["']content-language["'][^>]*content=["']([a-zA-Z-]+)["']/i);
  if (metaLang?.[1]) return metaLang[1].toLowerCase().slice(0, 5);

  const hebrewChars = (html.match(/[֐-׿]/g) || []).length;
  const arabicChars = (html.match(/[؀-ۿ]/g) || []).length;
  const latinChars = (html.match(/[a-zA-Z]/g) || []).length;
  if (hebrewChars > 50 && hebrewChars > latinChars * 0.3) return 'he';
  if (arabicChars > 50 && arabicChars > latinChars * 0.3) return 'ar';
  if (latinChars > 200) return 'en';
  return null;
}

/**
 * Resolve the site's content language. Priority (as requested):
 *   1. Explicit override from the caller
 *   2. Platform setting - `site.contentLanguage`
 *   3. Other stored fields - `site.crawledData.language`, then the completed
 *      onboarding interview's `responses.contentLanguage`
 *   4. Live check of the site's homepage HTML (lang attr, dir=rtl, meta
 *      content-language, or character heuristics)
 *   5. Fall back to English so we never block generation
 */
async function resolveSiteLanguage(site, override) {
  if (override && typeof override === 'string' && override.length >= 2) {
    return override.toLowerCase().slice(0, 5);
  }
  if (site.contentLanguage) return site.contentLanguage;
  if (site.crawledData?.language) return site.crawledData.language;

  try {
    const interview = await prisma.userInterview.findFirst({
      where: { siteId: site.id, status: 'COMPLETED' },
      select: { responses: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (interview?.responses?.contentLanguage) return interview.responses.contentLanguage;
  } catch {
    /* best-effort */
  }

  if (site.url) {
    try {
      const res = await fetch(site.url, {
        headers: BOT_FETCH_HEADERS,
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        const html = (await res.text()).slice(0, 200000);
        const detected = detectLanguageFromHtml(html);
        if (detected) return detected;
      }
    } catch {
      /* best-effort - fall through to the default */
    }
  }

  return 'en';
}

function maxLenFor(field) {
  switch (field) {
    case 'altText': return 200;
    case 'title': return 100;
    case 'caption': return 160;
    case 'description': return 500;
    default: return 200;
  }
}

function fieldSchema(field, language) {
  const ln = languageName(language);
  const guidance = {
    altText: `Concise descriptive alt text (50–125 chars) in ${ln}. Do not start with "Image of".`,
    title: `Short title in ${ln}.`,
    caption: `Brief caption in ${ln}. May be empty if nothing useful to add.`,
    description: `Longer description (2-3 sentences) in ${ln}.`,
  };
  return z.object({
    value: z.string().max(maxLenFor(field)).describe(guidance[field]),
  });
}

function buildPrompt({ field, context, language }) {
  const ln = languageName(language);
  const ctxLines = [];
  if (context.title) ctxLines.push(`Title: ${context.title}`);
  if (context.altText) ctxLines.push(`Alt text: ${context.altText}`);
  if (context.caption) ctxLines.push(`Caption: ${context.caption}`);
  if (context.description) ctxLines.push(`Description: ${context.description}`);
  if (context.filename) ctxLines.push(`Filename: ${context.filename}`);
  if (context.mimeType) ctxLines.push(`Type: ${context.mimeType}`);
  if (context.width && context.height) ctxLines.push(`Dimensions: ${context.width}×${context.height}`);
  if (context.sourceUrl) ctxLines.push(`Source URL: ${context.sourceUrl}`);

  const fieldExplain = {
    altText: 'alt text - an accessibility-friendly description of the image content',
    title: 'short title that summarizes the media item',
    caption: 'brief caption that could appear under the image on a page',
    description: 'longer description, 2–3 sentences, useful for SEO and media details',
  };

  return `Generate a new ${fieldExplain[field]} for the media item described below.

Write it in ${ln} (${language}). Do not mix languages. Return ONLY the new value for the "${field}" field - no labels, quotes, or commentary.

EXISTING METADATA (use as context, but do not echo verbatim):
${ctxLines.length ? ctxLines.join('\n') : '(no metadata yet)'}`;
}

export async function POST(req, { params }) {
  try {
    const { id, mediaId } = await params;
    const auth = await verifyUserSiteAccess(id);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }
    const { userId, site } = auth;

    const schema = z.object({
      field: z.enum(ALLOWED_FIELDS),
      context: z.object({
        altText: z.string().optional().default(''),
        title: z.string().optional().default(''),
        caption: z.string().optional().default(''),
        description: z.string().optional().default(''),
        filename: z.string().optional().default(''),
        mimeType: z.string().optional().default(''),
        width: z.number().optional().nullable(),
        height: z.number().optional().nullable(),
        sourceUrl: z.string().optional().default(''),
      }).optional().default({}),
      languageOverride: z.string().optional().nullable(),
    });

    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', details: parsed.error.issues }, { status: 400 });
    }
    const body = parsed.data;

    const creditCheck = await enforceCredits(site.accountId, FIELD_COST);
    if (!creditCheck.allowed) {
      return NextResponse.json(creditCheck, { status: 402 });
    }

    const language = await resolveSiteLanguage(site, body.languageOverride);

    const result = await generateStructuredResponse({
      system: 'You write concise, accurate media metadata in the exact language requested. Match the tone of existing metadata and keep within the length limit.',
      prompt: buildPrompt({ field: body.field, context: body.context, language }),
      schema: fieldSchema(body.field, language),
      temperature: 0.6,
      operation: 'REGENERATE_MEDIA_FIELD',
      metadata: {
        siteId: site.id,
        mediaId: String(mediaId),
        field: body.field,
        language,
      },
      accountId: site.accountId,
      userId,
      siteId: site.id,
    });

    return NextResponse.json({
      success: true,
      field: body.field,
      value: (result?.value ?? '').trim(),
      language,
      creditsUpdated: { used: FIELD_COST },
    });
  } catch (error) {
    console.error('[ai-regenerate-field] error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to regenerate field' },
      { status: 500 },
    );
  }
}
