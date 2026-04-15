import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { generateText } from 'ai';
import { google } from '@/lib/ai/vertex-provider.js';
import { logAIUsage } from '@/lib/ai/credits.js';

const SESSION_COOKIE = 'user_session';
const MODEL = 'gemini-2.5-pro';

async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) return null;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        isSuperAdmin: true,
        accountMemberships: { select: { accountId: true } },
      },
    });
    return user;
  } catch {
    return null;
  }
}

/**
 * POST /api/audit/translate-summary
 *
 * Translates an audit summary to the requested language.
 * Checks if translation already exists; if not, generates via Gemini
 * and caches it in the SiteAudit.summaryTranslations field.
 *
 * Body: { auditId, targetLang }
 * Response: { translation: string }
 */
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { auditId, targetLang } = await request.json();

    if (!auditId || !targetLang) {
      return NextResponse.json(
        { error: 'auditId and targetLang are required' },
        { status: 400 }
      );
    }

    // Fetch audit & verify access
    const accountIds = user.accountMemberships.map(m => m.accountId);
    const audit = await prisma.siteAudit.findFirst({
      where: { id: auditId },
      select: {
        id: true,
        summary: true,
        summaryTranslations: true,
        site: { select: { accountId: true } },
      },
    });

    if (!audit || !accountIds.includes(audit.site.accountId)) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    }

    if (!audit.summary) {
      return NextResponse.json({ error: 'No summary available' }, { status: 404 });
    }

    // Check if translation already exists
    const translations = audit.summaryTranslations || {};
    if (translations[targetLang]) {
      return NextResponse.json({ translation: translations[targetLang] });
    }

    // Language name mapping for the prompt
    const LANG_NAMES = {
      en: 'English',
      he: 'Hebrew',
      ar: 'Arabic',
      es: 'Spanish',
      fr: 'French',
      de: 'German',
      ru: 'Russian',
      pt: 'Portuguese',
      zh: 'Chinese',
      ja: 'Japanese',
    };

    const langName = LANG_NAMES[targetLang] || targetLang;

    // Translate using Gemini
    const result = await generateText({
      model: google(MODEL),
      system: `You are a professional translator. Translate the following website audit summary to ${langName}. 
Maintain the same formatting (markdown bullets, bold, etc.). 
Keep technical terms like SEO, TTFB, LCP, CLS, PSI in English.
Only output the translated text - no preamble or explanation.`,
      prompt: audit.summary,
      temperature: 0.1,
      maxTokens: 800,
    });

    const translation = result.text?.trim();

    if (!translation) {
      return NextResponse.json({ error: 'Translation failed' }, { status: 500 });
    }

    // Log AI usage
    const usage = result.usage || {};
    logAIUsage({
      operation: 'AUDIT_SUMMARY_TRANSLATE',
      inputTokens: usage.promptTokens || 0,
      outputTokens: usage.completionTokens || 0,
      totalTokens: usage.totalTokens || 0,
      model: MODEL,
      metadata: { auditId, targetLang },
    });

    // Cache the translation (retry on write conflict)
    const MAX_RETRIES = 5;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const fresh = await prisma.siteAudit.findUnique({
          where: { id: auditId },
          select: { summaryTranslations: true },
        });
        const merged = { ...(fresh?.summaryTranslations || {}), [targetLang]: translation };
        await prisma.siteAudit.update({
          where: { id: auditId },
          data: { summaryTranslations: merged },
        });
        break;
      } catch (retryErr) {
        if (retryErr.code === 'P2034' && attempt < MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
          continue;
        }
        throw retryErr;
      }
    }

    return NextResponse.json({ translation });
  } catch (error) {
    console.error('[API/audit/translate-summary] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
