/**
 * Admin Alerts
 *
 * Fire-and-forget email notifications to all active SuperAdmins when
 * something happens that needs operator attention — third-party API
 * failures, repeated errors users are seeing, etc.
 *
 * Errors are logged, never thrown. Safe to call from any code path.
 */

import prisma from '@/lib/prisma';
import { queueEmail } from '@/lib/mailer';

const APP_URL = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

async function getSuperAdminEmails() {
  try {
    const admins = await prisma.user.findMany({
      where: { isSuperAdmin: true, isActive: true },
      select: { email: true },
    });
    return admins.map((a) => a.email).filter(Boolean);
  } catch (err) {
    console.warn('[admin-alerts] getSuperAdminEmails failed:', err.message);
    return [];
  }
}

function fmtMeta(metadata) {
  if (!metadata || typeof metadata !== 'object') return '';
  return Object.entries(metadata)
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#a0a0b0;font-family:monospace;">${k}</td><td style="padding:4px 0;color:#e5e5e5;font-family:monospace;word-break:break-all;">${escapeHtml(String(v))}</td></tr>`)
    .join('');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function buildSystemAlert({ severity = 'warning', title, summary, metadata }) {
  const safeTitle = escapeHtml(title);
  const safeSummary = escapeHtml(summary || '');
  const accent = severity === 'critical' ? '#ef4444' : severity === 'warning' ? '#f59e0b' : '#a855f7';
  const subject = `[Ghost Post · ${severity.toUpperCase()}] ${title}`;

  return {
    subject,
    html: `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#0a0a0f;">
    <tr><td style="padding:32px 20px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:560px;margin:0 auto;background:linear-gradient(180deg,#1a1a24 0%,#12121a 100%);border:1px solid #2a2a3a;border-radius:14px;overflow:hidden;">
        <tr><td style="padding:22px 28px;border-bottom:1px solid #2a2a3a;border-left:4px solid ${accent};">
          <p style="margin:0 0 4px;color:#a0a0b0;font-size:11px;font-family:monospace;text-transform:uppercase;letter-spacing:0.05em;">Ghost Post · System Alert · ${severity}</p>
          <h1 style="margin:0;color:#fff;font-size:18px;font-weight:600;">${safeTitle}</h1>
        </td></tr>
        <tr><td style="padding:20px 28px;">
          ${safeSummary ? `<p style="margin:0 0 16px;color:#e5e5e5;font-size:14px;line-height:1.55;">${safeSummary}</p>` : ''}
          ${metadata ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="font-size:12px;">${fmtMeta(metadata)}</table>` : ''}
          <p style="margin:18px 0 0;color:#6b6b7b;font-size:12px;">${escapeHtml(APP_URL)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
    text: `[${severity.toUpperCase()}] ${title}\n\n${summary || ''}\n\n${metadata ? Object.entries(metadata).map(([k,v]) => `${k}: ${v}`).join('\n') : ''}`,
  };
}

/**
 * Send a system alert to all active SuperAdmins.
 *
 * @param {object} opts
 * @param {'critical'|'warning'|'info'} [opts.severity='warning']
 * @param {string} opts.title — short headline (used in subject)
 * @param {string} [opts.summary] — one-paragraph explanation
 * @param {object} [opts.metadata] — flat key/value pairs rendered as a table
 *
 * @returns {Promise<{ sent: number }>}
 */
export async function notifySuperadmins({ severity = 'warning', title, summary, metadata } = {}) {
  if (!title) {
    console.warn('[admin-alerts] notifySuperadmins called without a title');
    return { sent: 0 };
  }
  try {
    const recipients = await getSuperAdminEmails();
    if (recipients.length === 0) {
      console.warn('[admin-alerts] no SuperAdmin recipients found for alert:', title);
      return { sent: 0 };
    }
    const tpl = buildSystemAlert({ severity, title, summary, metadata });
    for (const to of recipients) {
      queueEmail({ to, subject: tpl.subject, html: tpl.html, text: tpl.text });
    }
    return { sent: recipients.length };
  } catch (err) {
    console.warn('[admin-alerts] notifySuperadmins failed:', err.message);
    return { sent: 0 };
  }
}

/**
 * Specialized helper for third-party AI failures (Gemini, Imagen, etc.).
 * The user is told to apologize for a third-party issue; this notifies the
 * superadmin so they can investigate and intervene.
 */
export function notifyThirdPartyAiFailure({ provider, model, operation, errorMessage, accountId, siteId, userId } = {}) {
  return notifySuperadmins({
    severity: 'critical',
    title: `${provider || 'AI'} failure during ${operation || 'operation'}`,
    summary: `A user-facing AI request failed because of a third-party error. The user was shown an apology and was NOT charged. Investigate ${provider} status before more users hit this.`,
    metadata: {
      provider: provider || '(unknown)',
      model: model || '(unknown)',
      operation: operation || '(unknown)',
      error: errorMessage || '(no message)',
      accountId: accountId || '(none)',
      siteId: siteId || '(none)',
      userId: userId || '(none)',
      timestamp: new Date().toISOString(),
    },
  });
}
