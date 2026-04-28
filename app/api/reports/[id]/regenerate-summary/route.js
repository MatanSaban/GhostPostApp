/**
 * Report Summary Regenerate API
 *
 * POST /api/reports/[id]/regenerate-summary
 *
 * Body: { hint?: string }
 *
 * Generates a fresh AI executive summary for an existing report. The
 * `hint` field - if present - carries whatever the user typed in the
 * preview's summary editor before clicking "Regenerate summary"; we
 * pass it to the model as user guidance so the new summary expands /
 * rewrites that draft rather than replacing it cold.
 *
 * Returns the persisted summary string. The PDF is NOT re-rendered
 * here - that's a heavier operation and can be triggered separately
 * via /regenerate when the user is ready to ship the updated PDF.
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember } from '@/lib/auth-permissions';
import { hasPermission, CAPABILITIES } from '@/lib/permissions';
import { generateTextResponse } from '@/lib/ai/gemini';

function buildPrompt({ siteName, currentPeriodLabel, previousPeriodLabel, currentScore, previousScore, actions, locale, hint }) {
  const isHe = locale === 'he';
  const delta = currentScore != null && previousScore != null ? currentScore - previousScore : null;
  const hasComparison = !!(currentPeriodLabel && previousPeriodLabel);

  const intro = isHe
    ? `אתה מנהל חשבון SEO בכיר. כתוב סיכום מנהלים תמציתי בן 4 משפטים עבור הלקוח על האתר "${siteName}"${hasComparison ? `, בהשוואה בין ${previousPeriodLabel} ל-${currentPeriodLabel}` : ''}.`
    : `You are a senior SEO Account Manager. Write a concise, 4-sentence executive summary for the client about "${siteName}"${hasComparison ? `, comparing ${previousPeriodLabel} to ${currentPeriodLabel}` : ''}.`;

  const deltaLine = delta != null
    ? (isHe
      ? `שינוי בציון בריאות האתר: ${delta > 0 ? '+' : ''}${delta} (מ-${previousScore} ל-${currentScore}).`
      : `Site health score change: ${delta > 0 ? '+' : ''}${delta} (from ${previousScore} to ${currentScore}).`)
    : (isHe
      ? `ציון בריאות האתר הנוכחי: ${currentScore ?? 'לא זמין'}.`
      : `Current site health score: ${currentScore ?? 'not available'}.`);

  const actionsLine = actions?.length
    ? (isHe
      ? `פעולות שבוצעו: ${actions.slice(0, 10).map((a) => a?.data?.description || a.descriptionKey || a.actionType).join(', ')}.`
      : `Actions performed: ${actions.slice(0, 10).map((a) => a?.data?.description || a.descriptionKey || a.actionType).join(', ')}.`)
    : (isHe ? 'לא בוצעו פעולות אוטומטיות בתקופה.' : 'No automated actions performed in this period.');

  // The user's existing draft - when present we ask the model to refine
  // it instead of starting from scratch, so manual edits aren't lost.
  const hintBlock = hint && hint.trim()
    ? (isHe
      ? `\n\nהמשתמש כתב את הטיוטה הזו, אנא שמור על הכוון/דגשים שלה ועדכן אותה:\n"""\n${hint.trim()}\n"""`
      : `\n\nThe user wrote this draft. Preserve its angle and emphasis while polishing it:\n"""\n${hint.trim()}\n"""`)
    : '';

  const closing = isHe
    ? '\n\nשמור על טון מקצועי ומעודד, עם דגש על ROI. פלט טקסט רגיל בלבד, ללא markdown. כתוב בעברית.'
    : '\n\nKeep it professional, encouraging, and focused on ROI. Output plain text only, no markdown.';

  return `${intro}\n\n${deltaLine}\n${actionsLine}${hintBlock}${closing}`;
}

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const { authorized, member } = await getCurrentAccountMember();
    if (!authorized || !member) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasPermission(member, 'REPORTS', CAPABILITIES.MANAGE)) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const userHint = typeof body?.hint === 'string' ? body.hint : '';

    const report = await prisma.reportArchive.findUnique({ where: { id } });
    if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    if (report.accountId !== member.accountId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    if (report.status === 'PENDING') {
      return NextResponse.json({ error: 'Report is currently generating; try again in a moment.' }, { status: 409 });
    }

    const site = await prisma.site.findUnique({
      where: { id: report.siteId },
      select: { name: true },
    });

    const md = report.metadata || {};
    const snapshot = report.sectionData || {};
    const prompt = buildPrompt({
      siteName: site?.name || 'your website',
      currentPeriodLabel: md.currentPeriodLabel || null,
      previousPeriodLabel: md.previousPeriodLabel || null,
      currentScore: snapshot.currentAudit?.score ?? null,
      previousScore: snapshot.previousAudit?.score ?? null,
      actions: Array.isArray(snapshot.executedActions) ? snapshot.executedActions : [],
      locale: report.locale || 'en',
      hint: userHint,
    });

    let aiSummary;
    try {
      aiSummary = await generateTextResponse({
        system: report.locale === 'he'
          ? 'אתה מנהל חשבון SEO מקצועי הכותב דוחות חודשיים ללקוחות. כתוב בעברית.'
          : 'You are a professional SEO account manager writing monthly reports for clients.',
        prompt,
        maxTokens: 350,
        temperature: 0.7,
        operation: 'REPORT_SUMMARY_REGENERATE',
        metadata: { reportId: id, siteId: report.siteId, locale: report.locale, hasHint: !!userHint },
        accountId: member.accountId,
        userId: member.userId,
        siteId: report.siteId,
      });
    } catch (e) {
      console.error('[ReportRegenerateSummary] AI call failed:', e);
      return NextResponse.json({ error: e?.message || 'Failed to regenerate summary' }, { status: 500 });
    }

    const trimmed = (aiSummary || '').trim();
    const updated = await prisma.reportArchive.update({
      where: { id },
      data: { aiSummary: trimmed },
    });

    return NextResponse.json({ aiSummary: trimmed, report: updated });
  } catch (error) {
    console.error('[ReportRegenerateSummary] Error:', error);
    return NextResponse.json({ error: 'Failed to regenerate summary' }, { status: 500 });
  }
}
