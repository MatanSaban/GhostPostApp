import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { translateAuditSummary } from '@/lib/audit/summary-generator.js';
import { invalidateAudit } from '@/lib/cache/invalidate.js';

const SESSION_COOKIE = 'user_session';

// In-flight dedup: when two requests arrive simultaneously for the same
// (auditId, lang) pair, the second one awaits the first instead of calling
// Gemini again. Survives only per-process, which is fine — we're protecting
// against React StrictMode double-renders and rapid refetches, not a true
// distributed race (cache check + write already handles the cross-process case).
const inflight = new Map();

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
        siteId: true,
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

    const lockKey = `${auditId}:${targetLang}`;
    if (inflight.has(lockKey)) {
      const translation = await inflight.get(lockKey);
      if (!translation) {
        return NextResponse.json({ error: 'Translation failed' }, { status: 500 });
      }
      return NextResponse.json({ translation });
    }

    const task = (async () => {
      // Translate via the shared helper (deducts credits + tracks usage).
      const translation = await translateAuditSummary(audit.summary, targetLang, {
        accountId: audit.site.accountId,
        userId: user.id,
        siteId: audit.siteId,
      });

      if (!translation) return null;

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
          // Bust the cached audit payload so the next /api/audit fetch
          // includes this translation without an extra translate-summary call.
          invalidateAudit(audit.siteId);
          break;
        } catch (retryErr) {
          if (retryErr.code === 'P2034' && attempt < MAX_RETRIES - 1) {
            await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
            continue;
          }
          throw retryErr;
        }
      }

      return translation;
    })();

    inflight.set(lockKey, task);
    let translation;
    try {
      translation = await task;
    } finally {
      inflight.delete(lockKey);
    }

    if (!translation) {
      return NextResponse.json({ error: 'Translation failed' }, { status: 500 });
    }

    return NextResponse.json({ translation });
  } catch (error) {
    console.error('[API/audit/translate-summary] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
