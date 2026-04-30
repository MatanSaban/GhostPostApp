/**
 * Welcome + free-trial reminder email templates (HE/EN, with structure for
 * adding more languages from the Language enum).
 *
 *   - welcome              → fired on registration finalize for every plan
 *                            (paid OR trial). Two copy variants based on whether
 *                            trialEndAt is provided.
 *   - trialEnding2Days     → subtle, friendly heads-up two days before trial end.
 *   - trialEnding1Day      → urgent reminder one day before trial end.
 *
 * Each template returns { subject, html, text }, ready to drop into sendEmail().
 *
 * To add a new language: add an entry to the `t` object inside each template
 * keyed by Language enum code. The lookup falls back to EN when missing.
 */

const isHe = (lang) => lang === 'HE' || lang === 'he';

const formatDate = (date, lang) => {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  // DD/MM/YYYY for both EN and HE — matches lib/billing-emails.js convention.
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

const baseShell = ({ html, lang }) => {
  const dir = isHe(lang) ? 'rtl' : 'ltr';
  const align = isHe(lang) ? 'right' : 'left';
  return `<!DOCTYPE html>
<html lang="${dir === 'rtl' ? 'he' : 'en'}" dir="${dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#0a0a0f;">
    <tr><td style="padding:40px 20px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:560px;margin:0 auto;">
        <tr><td style="text-align:center;padding-bottom:24px;">
          <div style="display:inline-block;background:linear-gradient(135deg,#a855f7 0%,#7c3aed 50%,#6366f1 100%);padding:14px 22px;border-radius:12px;">
            <span style="color:#fff;font-size:22px;font-weight:700;">GhostSEO</span>
          </div>
        </td></tr>
        <tr><td style="background:linear-gradient(180deg,#1a1a24 0%,#12121a 100%);border-radius:16px;border:1px solid #2a2a3a;overflow:hidden;direction:${dir};text-align:${align};">
          ${html}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
};

const ctaButton = (label, href) =>
  `<div style="text-align:center;margin:24px 0;"><a href="${href}" style="display:inline-block;background:linear-gradient(135deg,#a855f7,#7c3aed);color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">${label}</a></div>`;

const secondaryLink = (label, href) =>
  `<p style="text-align:center;margin:8px 0 0;"><a href="${href}" style="color:#a0a0b0;text-decoration:underline;font-size:13px;">${label}</a></p>`;

// Look up a translations dict by Language enum code; fall back to EN.
const pick = (t, lang) => t[lang] || t[lang?.toUpperCase?.()] || t.EN;

/**
 * Welcome email — sent on registration finalize for every plan.
 *
 * If `trialEndAt` is provided, renders the trial variant (mentions start now /
 * ends DD/MM/YYYY). Otherwise renders the paid-plan variant.
 */
export function welcome({ userName, planName, trialEndAt, addPaymentUrl, dashboardUrl, lang = 'EN' }) {
  const safeName = userName || (isHe(lang) ? 'שלום' : 'there');
  const isTrial = !!trialEndAt;
  const endStr = formatDate(trialEndAt, lang);

  const t = {
    EN: {
      subjectTrial: `Welcome to GhostSEO — your ${planName} free trial has started`,
      subjectPaid: `Welcome to GhostSEO — your ${planName} subscription is active`,
      heading: `Welcome to GhostSEO, ${safeName}`,
      introTrial: `Your <strong>${planName}</strong> free trial is now active. You have full access until <strong>${endStr}</strong>.`,
      introPaid: `Thanks for joining. Your <strong>${planName}</strong> subscription is active and ready to go.`,
      noCardYet: `No payment method needed right now — we'll only ask for one if you decide to keep your subscription after the trial ends.`,
      cta: 'Open dashboard',
      addPaymentLink: 'Or add a payment method now',
      footer: `Questions? Just reply to this email — we read every message.`,
      textTrial: `Welcome to GhostSEO, ${safeName}.\nYour ${planName} free trial is active until ${endStr}.\nDashboard: ${dashboardUrl}\nAdd payment any time: ${addPaymentUrl}`,
      textPaid: `Welcome to GhostSEO, ${safeName}.\nYour ${planName} subscription is active.\nDashboard: ${dashboardUrl}`,
    },
    HE: {
      subjectTrial: `ברוך הבא ל-GhostSEO — תקופת הניסיון של ${planName} החלה`,
      subjectPaid: `ברוך הבא ל-GhostSEO — מנוי ${planName} פעיל`,
      heading: `ברוך הבא ל-GhostSEO, ${safeName}`,
      introTrial: `תקופת הניסיון של <strong>${planName}</strong> החלה. יש לך גישה מלאה עד <strong>${endStr}</strong>.`,
      introPaid: `תודה שהצטרפת. מנוי <strong>${planName}</strong> שלך פעיל ומוכן לשימוש.`,
      noCardYet: `לא צריך להזין פרטי תשלום עכשיו — נבקש אותם רק אם תרצה להמשיך עם המנוי בתום תקופת הניסיון.`,
      cta: 'פתח לוח בקרה',
      addPaymentLink: 'או הוסף אמצעי תשלום עכשיו',
      footer: `שאלה? פשוט הגב למייל הזה — אנחנו קוראים כל הודעה.`,
      textTrial: `ברוך הבא ל-GhostSEO, ${safeName}.\nתקופת הניסיון של ${planName} פעילה עד ${endStr}.\nלוח בקרה: ${dashboardUrl}\nהוספת אמצעי תשלום: ${addPaymentUrl}`,
      textPaid: `ברוך הבא ל-GhostSEO, ${safeName}.\nמנוי ${planName} פעיל.\nלוח בקרה: ${dashboardUrl}`,
    },
  };
  const tr = pick(t, lang);

  const subject = isTrial ? tr.subjectTrial : tr.subjectPaid;
  const intro = isTrial ? tr.introTrial : tr.introPaid;
  const bodyInner = `
    <p style="margin:0 0 16px;color:#e5e5e5;font-size:15px;line-height:1.6;">${intro}</p>
    ${isTrial ? `<p style="margin:0 0 16px;color:#a0a0b0;font-size:14px;line-height:1.6;">${tr.noCardYet}</p>` : ''}
    ${ctaButton(tr.cta, dashboardUrl)}
    ${isTrial ? secondaryLink(tr.addPaymentLink, addPaymentUrl) : ''}
    <p style="margin:24px 0 0;color:#6b6b7c;font-size:13px;">${tr.footer}</p>
  `;

  const html = baseShell({
    lang,
    html: `
      <div style="padding:28px 32px;border-bottom:1px solid #2a2a3a;">
        <h1 style="margin:0;color:#fff;font-size:22px;font-weight:600;">${tr.heading}</h1>
      </div>
      <div style="padding:24px 32px;">${bodyInner}</div>`,
  });
  const text = isTrial ? tr.textTrial : tr.textPaid;
  return { subject, html, text };
}

/**
 * T-2 reminder — subtle. Hope you're enjoying it, gentle nudge to add payment.
 */
export function trialEnding2Days({ userName, planName, trialEndAt, addPaymentUrl, dashboardUrl, lang = 'EN' }) {
  const safeName = userName || (isHe(lang) ? 'שלום' : 'there');
  const endStr = formatDate(trialEndAt, lang);

  const t = {
    EN: {
      subject: `A quick heads-up — your ${planName} trial ends on ${endStr}`,
      heading: `Hope you're enjoying GhostSEO`,
      intro: `Hi ${safeName}, just a friendly heads-up: your <strong>${planName}</strong> free trial wraps up on <strong>${endStr}</strong>.`,
      body: `If you'd like to keep going without a break in service, you can add a payment method whenever you're ready. No rush — we just want to make sure you have the option.`,
      cta: 'Add a payment method',
      secondary: 'Back to dashboard',
      text: `Hi ${safeName},\nYour ${planName} free trial ends on ${endStr}. Add a payment method any time to keep your subscription active.\n${addPaymentUrl}`,
    },
    HE: {
      subject: `הודעה קצרה — תקופת הניסיון של ${planName} מסתיימת ב-${endStr}`,
      heading: `מקווים שאתה נהנה מ-GhostSEO`,
      intro: `שלום ${safeName}, רצינו רק להזכיר: תקופת הניסיון של <strong>${planName}</strong> מסתיימת ב-<strong>${endStr}</strong>.`,
      body: `אם תרצה להמשיך ללא הפסקה בשירות, תוכל להוסיף אמצעי תשלום מתי שנוח לך. אין לחץ — רק רצינו לוודא שהאפשרות בידיים שלך.`,
      cta: 'הוסף אמצעי תשלום',
      secondary: 'חזרה ללוח הבקרה',
      text: `שלום ${safeName},\nתקופת הניסיון של ${planName} מסתיימת ב-${endStr}. תוכל להוסיף אמצעי תשלום בכל עת כדי להמשיך עם המנוי.\n${addPaymentUrl}`,
    },
  };
  const tr = pick(t, lang);

  const html = baseShell({
    lang,
    html: `
      <div style="padding:28px 32px;border-bottom:1px solid #2a2a3a;">
        <h1 style="margin:0;color:#fff;font-size:22px;font-weight:600;">${tr.heading}</h1>
      </div>
      <div style="padding:24px 32px;">
        <p style="margin:0 0 16px;color:#e5e5e5;font-size:15px;line-height:1.6;">${tr.intro}</p>
        <p style="margin:0 0 16px;color:#a0a0b0;font-size:14px;line-height:1.6;">${tr.body}</p>
        ${ctaButton(tr.cta, addPaymentUrl)}
        ${secondaryLink(tr.secondary, dashboardUrl)}
      </div>`,
  });
  return { subject: tr.subject, html, text: tr.text };
}

/**
 * T-1 reminder — direct. Tomorrow your trial ends; explain consequence
 * (downgrade to free) and ask for action.
 */
export function trialEnding1Day({ userName, planName, trialEndAt, addPaymentUrl, dashboardUrl, lang = 'EN' }) {
  const safeName = userName || (isHe(lang) ? 'שלום' : 'there');
  const endStr = formatDate(trialEndAt, lang);

  const t = {
    EN: {
      subject: `Last day — your ${planName} trial ends tomorrow (${endStr})`,
      heading: `Your free trial ends tomorrow`,
      intro: `Hi ${safeName}, your <strong>${planName}</strong> free trial ends tomorrow, <strong>${endStr}</strong>.`,
      consequence: `If you don't add a payment method by then, your account will move to the <strong>Free</strong> plan and you'll lose access to the full feature set you've been using.`,
      callToAction: `Add a payment method now to keep ${planName} without interruption — it only takes a minute.`,
      cta: 'Keep my subscription',
      secondary: `I'll switch to Free`,
      text: `Hi ${safeName},\nYour ${planName} free trial ends tomorrow, ${endStr}. Add a payment method to keep your subscription, or your account will move to the Free plan.\n${addPaymentUrl}`,
    },
    HE: {
      subject: `יום אחרון — תקופת הניסיון של ${planName} מסתיימת מחר (${endStr})`,
      heading: `תקופת הניסיון שלך מסתיימת מחר`,
      intro: `שלום ${safeName}, תקופת הניסיון של <strong>${planName}</strong> מסתיימת מחר, <strong>${endStr}</strong>.`,
      consequence: `אם לא תוסיף אמצעי תשלום עד אז, החשבון שלך יעבור לתוכנית <strong>החינמית</strong> ותאבד את הגישה לתכונות המתקדמות שאתה משתמש בהן.`,
      callToAction: `הוסף אמצעי תשלום עכשיו כדי לשמור על ${planName} ללא הפסקה — לוקח פחות מדקה.`,
      cta: 'שמור על המנוי',
      secondary: `אעבור לתוכנית החינמית`,
      text: `שלום ${safeName},\nתקופת הניסיון של ${planName} מסתיימת מחר, ${endStr}. הוסף אמצעי תשלום כדי לשמור על המנוי, אחרת החשבון יעבור לתוכנית החינמית.\n${addPaymentUrl}`,
    },
  };
  const tr = pick(t, lang);

  const html = baseShell({
    lang,
    html: `
      <div style="padding:28px 32px;border-bottom:1px solid #2a2a3a;background:linear-gradient(180deg,rgba(168,85,247,0.12),transparent);">
        <h1 style="margin:0;color:#fff;font-size:22px;font-weight:600;">${tr.heading}</h1>
      </div>
      <div style="padding:24px 32px;">
        <p style="margin:0 0 16px;color:#e5e5e5;font-size:15px;line-height:1.6;">${tr.intro}</p>
        <p style="margin:0 0 16px;color:#fbbf24;font-size:14px;line-height:1.6;background:rgba(251,191,36,0.08);padding:12px 14px;border-radius:6px;">${tr.consequence}</p>
        <p style="margin:0 0 8px;color:#e5e5e5;font-size:15px;line-height:1.6;">${tr.callToAction}</p>
        ${ctaButton(tr.cta, addPaymentUrl)}
        ${secondaryLink(tr.secondary, dashboardUrl)}
      </div>`,
  });
  return { subject: tr.subject, html, text: tr.text };
}
