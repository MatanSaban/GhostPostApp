import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { logAIUsage } from '@/lib/ai/credits.js';

const SESSION_COOKIE = 'user_session';
const MODEL = 'gemini-2.0-flash';

async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) return null;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        accountMemberships: { select: { accountId: true } },
      },
    });
    return user;
  } catch {
    return null;
  }
}

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

const translationSchema = z.object({
  translations: z.array(
    z.object({
      key: z.string(),
      message: z.string(),
      suggestion: z.string(),
    })
  ),
});

/**
 * POST /api/audit/translate-issues
 *
 * Translates AI-generated (non-i18n-key) audit issues to the target language.
 * Caches results in SiteAudit.issueTranslations field.
 *
 * Body: { auditId, targetLang, issues: [{ key, message, suggestion }] }
 * Response: { translations: { [key]: { message, suggestion } } }
 */
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { auditId, targetLang, issues } = await request.json();

    if (!auditId || !targetLang || !issues || issues.length === 0) {
      return NextResponse.json(
        { error: 'auditId, targetLang, and issues are required' },
        { status: 400 }
      );
    }

    // If target is English, no translation needed (AI generates in English)
    if (targetLang === 'en') {
      const result = {};
      for (const issue of issues) {
        result[issue.key] = { message: issue.message, suggestion: issue.suggestion };
      }
      return NextResponse.json({ translations: result });
    }

    // Fetch audit & verify access
    const accountIds = user.accountMemberships.map(m => m.accountId);
    const audit = await prisma.siteAudit.findFirst({
      where: { id: auditId },
      select: {
        id: true,
        issueTranslations: true,
        site: { select: { accountId: true } },
      },
    });

    if (!audit || !accountIds.includes(audit.site.accountId)) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    }

    // Check cache
    const cached = audit.issueTranslations || {};
    const langCache = cached[targetLang] || {};
    const result = {};
    const toTranslate = [];

    for (const issue of issues) {
      if (langCache[issue.key]) {
        result[issue.key] = langCache[issue.key];
      } else {
        toTranslate.push(issue);
      }
    }

    // If everything is cached, return immediately
    if (toTranslate.length === 0) {
      return NextResponse.json({ translations: result });
    }

    // Translate uncached issues using Gemini
    const langName = LANG_NAMES[targetLang] || targetLang;

    const aiResult = await generateObject({
      model: google(MODEL),
      schema: translationSchema,
      system: `You are a professional translator. Translate the following website audit issue messages and suggestions to ${langName}.
Keep technical terms like SEO, CSS, HTML, viewport, CTA in English.
Maintain the same tone and specificity. Return the translations in the same order.`,
      messages: [
        {
          role: 'user',
          content: `Translate these ${toTranslate.length} audit issues to ${langName}:\n\n${toTranslate
            .map(
              (t, i) =>
                `${i + 1}. Key: "${t.key}"\n   Message: "${t.message}"\n   Suggestion: "${t.suggestion}"`
            )
            .join('\n\n')}`,
        },
      ],
      temperature: 0.1,
    });

    // Log AI usage
    const usage = aiResult.usage || {};
    logAIUsage({
      operation: 'AUDIT_ISSUE_TRANSLATE',
      inputTokens: usage.promptTokens || 0,
      outputTokens: usage.completionTokens || 0,
      totalTokens: usage.totalTokens || 0,
      model: MODEL,
      metadata: { auditId, targetLang, issueCount: toTranslate.length },
    });

    // Merge AI translations into result
    const aiTranslations = aiResult.object?.translations || [];
    for (let i = 0; i < toTranslate.length; i++) {
      const key = toTranslate[i].key;
      const translated = aiTranslations[i];
      if (translated) {
        result[key] = {
          message: translated.message || toTranslate[i].message,
          suggestion: translated.suggestion || toTranslate[i].suggestion,
        };
      } else {
        // Fallback to original
        result[key] = {
          message: toTranslate[i].message,
          suggestion: toTranslate[i].suggestion,
        };
      }
    }

    // Cache translations in DB
    const updatedCache = {
      ...cached,
      [targetLang]: { ...langCache, ...result },
    };
    await prisma.siteAudit.update({
      where: { id: auditId },
      data: { issueTranslations: updatedCache },
    });

    return NextResponse.json({ translations: result });
  } catch (error) {
    console.error('[API/audit/translate-issues] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
