import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { generateImage, generateStructuredResponse, analyzeImageStructured } from '@/lib/ai/gemini';
import { enforceCredits } from '@/lib/account-limits';

const SESSION_COOKIE = 'user_session';

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

/**
 * Resolve the language to generate the image in.
 * Priority: explicit override > site.contentLanguage > crawledData.language >
 * Interview responses.contentLanguage > detected from homepage HTML.
 * If none can be determined, returns `{ needsLanguage: true }`.
 */
async function resolveSiteLanguage(site, override) {
  if (override && typeof override === 'string' && override.length >= 2) {
    return { language: override.toLowerCase().slice(0, 5), source: 'override' };
  }
  if (site.contentLanguage) {
    return { language: site.contentLanguage, source: 'site.contentLanguage' };
  }
  const crawledLang = site.crawledData?.language;
  if (crawledLang) {
    return { language: crawledLang, source: 'site.crawledData.language' };
  }

  try {
    const interview = await prisma.userInterview.findFirst({
      where: { siteId: site.id, status: 'COMPLETED' },
      select: { responses: true },
      orderBy: { updatedAt: 'desc' },
    });
    const responseLang = interview?.responses?.contentLanguage;
    if (responseLang) return { language: responseLang, source: 'userInterview.responses' };
  } catch {
    // interview lookup is best-effort
  }

  if (site.url) {
    try {
      const res = await fetch(site.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GhostSEOBot/1.0)' },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const html = (await res.text()).slice(0, 200000);
        const detected = detectLanguageFromHtml(html);
        if (detected) return { language: detected, source: 'html' };
      }
    } catch {
      // fall through
    }
  }

  return { needsLanguage: true };
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

function languageName(code) {
  const map = { en: 'English', he: 'Hebrew', ar: 'Arabic', fr: 'French', es: 'Spanish', de: 'German', pt: 'Portuguese', ru: 'Russian', it: 'Italian', nl: 'Dutch', pl: 'Polish', tr: 'Turkish', ja: 'Japanese', zh: 'Chinese', ko: 'Korean' };
  const base = (code || '').toLowerCase().split('-')[0];
  return map[base] || code || 'English';
}

async function fetchImageAsBase64(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GhostSEOBot/1.0)' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const mimeType = res.headers.get('content-type') || 'image/png';
    if (!mimeType.startsWith('image/')) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    return { base64: buffer.toString('base64'), mimeType };
  } catch {
    return null;
  }
}

function buildRegeneratePrompt({ existing, userInstructions, language, hasReference, site }) {
  const langName = languageName(language);
  const parts = [];

  if (hasReference) {
    parts.push('Regenerate an image that keeps the essence of the attached reference image but improves quality, composition, and visual appeal.');
  } else {
    parts.push('Create a professional, high-quality image.');
  }

  const contextLines = [];
  if (existing.title) contextLines.push(`Title: ${existing.title}`);
  if (existing.altText) contextLines.push(`Alt text: ${existing.altText}`);
  if (existing.caption) contextLines.push(`Caption: ${existing.caption}`);
  if (existing.description) contextLines.push(`Description: ${existing.description}`);
  if (contextLines.length) {
    parts.push(`Image context from the website:\n${contextLines.join('\n')}`);
  }

  if (site?.name) parts.push(`Website: ${site.name}${site.url ? ` (${site.url})` : ''}.`);

  if (userInstructions) {
    parts.push(`Additional instructions from the user (highest priority): ${userInstructions}`);
  }

  parts.push(`IMPORTANT: Any visible text inside the image (labels, signs, headings, buttons, banners, captions, screens) MUST be written in ${langName}.`);
  if (language === 'he' || language === 'ar') {
    parts.push(`${langName} is a right-to-left language — ensure any text reads correctly right-to-left.`);
  }
  parts.push('Photorealistic, high resolution, sharp focus, professional quality. No watermarks, no borders.');

  return parts.join('\n\n');
}

export async function POST(req, { params }) {
  try {
    const { id } = await params;
    const auth = await verifyUserSiteAccess(id);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }
    const { userId, site } = auth;

    const schema = z.object({
      existingImageUrl: z.string().url().optional().nullable(),
      isBroken: z.boolean().optional().default(false),
      altText: z.string().optional().default(''),
      title: z.string().optional().default(''),
      caption: z.string().optional().default(''),
      description: z.string().optional().default(''),
      userInstructions: z.string().max(2000).optional().default(''),
      aspectRatio: z.string().optional().default('16:9'),
      languageOverride: z.string().optional().nullable(),
    });
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', details: parsed.error.issues }, { status: 400 });
    }
    const body = parsed.data;

    const existingHasAnyInfo = !!(body.altText || body.title || body.caption || body.description);
    if (body.isBroken && !existingHasAnyInfo && !body.userInstructions) {
      return NextResponse.json(
        { error: 'A broken image needs at least alt text, title, caption, description, or user instructions to generate from.' },
        { status: 400 },
      );
    }

    // ── Preflight credit check ─────────────────────────────────
    const creditCheck = await enforceCredits(site.accountId, 5);
    if (!creditCheck.allowed) {
      return NextResponse.json(creditCheck, { status: 402 });
    }

    // ── Resolve language ───────────────────────────────────────
    const lang = await resolveSiteLanguage(site, body.languageOverride);
    if (lang.needsLanguage) {
      return NextResponse.json({ needsLanguage: true }, { status: 200 });
    }
    const language = lang.language;

    // ── Reference image ────────────────────────────────────────
    let referenceImages = [];
    if (!body.isBroken && body.existingImageUrl) {
      const ref = await fetchImageAsBase64(body.existingImageUrl);
      if (ref) referenceImages = [ref];
    }

    // ── Build prompt & generate ────────────────────────────────
    const prompt = buildRegeneratePrompt({
      existing: body,
      userInstructions: body.userInstructions,
      language,
      hasReference: referenceImages.length > 0,
      site,
    });

    const images = await generateImage({
      prompt,
      aspectRatio: body.aspectRatio || '16:9',
      referenceImages,
      operation: 'REGENERATE_MEDIA_IMAGE',
      metadata: {
        siteId: site.id,
        existingImageUrl: body.existingImageUrl || null,
        wasBroken: !!body.isBroken,
        language,
        languageSource: lang.source,
      },
      accountId: site.accountId,
      userId,
      siteId: site.id,
    });

    if (!images?.length) {
      return NextResponse.json({ error: 'Image generation returned no result' }, { status: 502 });
    }

    const generated = images[0];

    // ── Generate metadata (alt / title / caption / description) in site language ─────────────
    // Not billed separately — the 5-credit cost already covers this feature.
    const metaSchema = z.object({
      altText: z.string().min(1).max(200).describe(`Concise descriptive alt text (50-125 chars) in ${languageName(language)}. Do not start with "Image of".`),
      title: z.string().min(1).max(100).describe(`Short title in ${languageName(language)}.`),
      caption: z.string().max(160).describe(`Short caption in ${languageName(language)}. May be empty.`),
      description: z.string().max(400).describe(`Longer description in ${languageName(language)}.`),
    });

    const metaPrompt = `Given the user's image context below, produce metadata for the newly generated image.

Write EVERYTHING in ${languageName(language)} (${language}). Do not mix languages.

USER'S EXISTING CONTEXT:
${body.title ? `- Title: ${body.title}\n` : ''}${body.altText ? `- Alt text: ${body.altText}\n` : ''}${body.caption ? `- Caption: ${body.caption}\n` : ''}${body.description ? `- Description: ${body.description}\n` : ''}${body.userInstructions ? `- User instructions: ${body.userInstructions}\n` : ''}

GENERATION PROMPT THAT PRODUCED THE IMAGE:
${prompt}

Produce metadata that would help this image be findable and accessible on the website.`;

    let generatedMetadata = null;
    try {
      generatedMetadata = await generateStructuredResponse({
        system: 'You are an SEO and accessibility specialist. You write concise, descriptive image metadata in the exact language requested.',
        prompt: metaPrompt,
        schema: metaSchema,
        temperature: 0.4,
        operation: 'GENERIC', // not billed — covered by the image generation charge
      });
    } catch (metaErr) {
      console.warn('[ai-regenerate] metadata generation failed:', metaErr.message);
    }

    // ── Verify the generated image (text language + instructions honored) ──
    // Not billed separately — bundled into the 5-credit image regen cost, the
    // same way metadata generation is. Failures are non-fatal; we surface the
    // verdict to the UI so the user can regenerate if something's off.
    let verification = null;
    try {
      const verifySchema = z.object({
        containsText: z.boolean().describe('True if the image contains any readable text (signs, labels, headings, captions, buttons, screens, etc.).'),
        textLanguageCorrect: z.boolean().describe(`True if any visible text reads correctly in ${languageName(language)}, OR if there is no text. False if text appears in a different language or is garbled.`),
        instructionsFollowed: z.boolean().describe("True if the user's additional instructions were clearly followed. If the user didn't supply instructions, return true."),
        issues: z.array(z.string()).max(4).describe('Short list of specific problems found (empty if none). Each entry is a sentence, in English.'),
      });

      verification = await analyzeImageStructured({
        system: 'You are a strict image QA reviewer. Inspect the image and answer the schema precisely. Be honest — false positives on "correct" are worse than false negatives.',
        prompt: `The image below was just generated. Verify it against these requirements:

1. Any visible text MUST be in ${languageName(language)} (${language}).${language === 'he' || language === 'ar' ? ` ${languageName(language)} is right-to-left — text must read correctly RTL.` : ''}
2. The user's additional instructions (if any) must be honored.

User instructions (may be empty): ${body.userInstructions || '(none)'}

Context the image was generated for:
${body.title ? `- Title: ${body.title}\n` : ''}${body.altText ? `- Alt text: ${body.altText}\n` : ''}${body.caption ? `- Caption: ${body.caption}\n` : ''}${body.description ? `- Description: ${body.description}\n` : ''}

Return a strict verdict.`,
        image: { base64: generated.base64, mimeType: generated.mimeType || 'image/png' },
        schema: verifySchema,
        temperature: 0.1,
        operation: 'GENERIC', // bundled into the 5-credit image regen cost
        metadata: {
          siteId: site.id,
          language,
          hasUserInstructions: !!body.userInstructions,
        },
      });
    } catch (verifyErr) {
      console.warn('[ai-regenerate] verification failed:', verifyErr.message);
    }

    return NextResponse.json({
      success: true,
      image: {
        base64: generated.base64,
        mimeType: generated.mimeType || 'image/png',
      },
      metadata: generatedMetadata || {
        altText: body.altText || '',
        title: body.title || '',
        caption: body.caption || '',
        description: body.description || '',
      },
      language,
      languageSource: lang.source,
      verification, // { containsText, textLanguageCorrect, instructionsFollowed, issues } | null
      creditsUpdated: { used: 5 },
    });
  } catch (error) {
    console.error('[ai-regenerate] error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to regenerate image' },
      { status: 500 },
    );
  }
}
