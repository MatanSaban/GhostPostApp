/**
 * Billing-engine email templates (HE/EN).
 *
 * Used by the recurring billing crons:
 *   - chargeRenewalSucceeded       → after a successful renewal charge
 *   - chargeRenewalFailed          → first / interim failure (retries pending)
 *   - chargeRenewalFinalFailed     → after retries exhausted, sub canceled
 *   - cardExpiring30 / 7 / expired → token-expiry reminders
 *
 * Each template returns { subject, html, text }, ready to drop into sendEmail().
 */

const isHe = (lang) => lang === 'HE' || lang === 'he';

const formatPrice = (n, lang) => {
  const fixed = (Number(n) || 0).toFixed(2);
  return isHe(lang) ? `$${fixed}` : `$${fixed}`;
};

const formatDate = (date, lang) => {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  // Israeli DD/MM/YYYY format works in both languages.
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

const cardLine = ({ pm, lang }) => {
  if (!pm) return '';
  const last4 = pm.cardLast4 ? `•••• ${pm.cardLast4}` : '';
  const brand = pm.cardBrand || (isHe(lang) ? 'כרטיס' : 'Card');
  const label = pm.nickname ? `${pm.nickname} (${brand})` : brand;
  return `<p style="margin:0;color:#a0a0b0;font-size:13px;">${label} ${last4}</p>`;
};

/**
 * Successful renewal — invoice / receipt notice.
 */
export function chargeRenewalSucceeded({
  amountUsd,
  productName,
  nextBillingDate,
  paymentMethod,
  invoiceUrl,
  lang = 'EN',
}) {
  const he = isHe(lang);
  const subject = he
    ? `קבלה: חיוב המנוי בוצע בהצלחה — ${formatPrice(amountUsd)}`
    : `Receipt: Subscription renewed — ${formatPrice(amountUsd)}`;
  const heading = he ? 'החיוב בוצע בהצלחה' : 'Subscription renewed successfully';
  const body = he
    ? `<p style="margin:0 0 16px;color:#e5e5e5;font-size:15px;line-height:1.6;">חייבנו את כרטיסך עבור <strong>${productName}</strong>.</p>
       <p style="margin:0 0 4px;color:#a0a0b0;font-size:14px;">סכום</p>
       <p style="margin:0 0 16px;color:#fff;font-size:20px;font-weight:600;">${formatPrice(amountUsd)}</p>
       ${cardLine({ pm: paymentMethod, lang })}
       <p style="margin:16px 0 8px;color:#a0a0b0;font-size:14px;">החיוב הבא צפוי ב-${formatDate(nextBillingDate, lang)}</p>
       ${invoiceUrl ? `<div style="text-align:center;margin:24px 0;"><a href="${invoiceUrl}" style="display:inline-block;background:linear-gradient(135deg,#a855f7,#7c3aed);color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">הצג חשבונית</a></div>` : ''}`
    : `<p style="margin:0 0 16px;color:#e5e5e5;font-size:15px;line-height:1.6;">We charged your card for <strong>${productName}</strong>.</p>
       <p style="margin:0 0 4px;color:#a0a0b0;font-size:14px;">Amount</p>
       <p style="margin:0 0 16px;color:#fff;font-size:20px;font-weight:600;">${formatPrice(amountUsd)}</p>
       ${cardLine({ pm: paymentMethod, lang })}
       <p style="margin:16px 0 8px;color:#a0a0b0;font-size:14px;">Next billing on ${formatDate(nextBillingDate, lang)}</p>
       ${invoiceUrl ? `<div style="text-align:center;margin:24px 0;"><a href="${invoiceUrl}" style="display:inline-block;background:linear-gradient(135deg,#a855f7,#7c3aed);color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">View invoice</a></div>` : ''}`;
  const html = baseShell({
    lang,
    html: `<div style="padding:28px 32px;border-bottom:1px solid #2a2a3a;"><h1 style="margin:0;color:#fff;font-size:22px;font-weight:600;">${heading}</h1></div>
           <div style="padding:24px 32px;">${body}</div>`,
  });
  const text = he
    ? `החיוב בוצע בהצלחה.\nמוצר: ${productName}\nסכום: ${formatPrice(amountUsd)}\nהחיוב הבא: ${formatDate(nextBillingDate, lang)}`
    : `Subscription renewed successfully.\nProduct: ${productName}\nAmount: ${formatPrice(amountUsd)}\nNext billing: ${formatDate(nextBillingDate, lang)}`;
  return { subject, html, text };
}

/**
 * Renewal charge failed (interim — more retries pending).
 */
export function chargeRenewalFailed({
  amountUsd,
  productName,
  reason,
  attempt,
  maxAttempts,
  paymentMethod,
  updateCardUrl,
  lang = 'EN',
}) {
  const he = isHe(lang);
  const subject = he
    ? `החיוב נכשל — נסה לעדכן את אמצעי התשלום`
    : `We couldn't charge your card — please update your payment method`;
  const heading = he ? 'החיוב נכשל' : 'Renewal charge failed';
  const body = he
    ? `<p style="margin:0 0 16px;color:#e5e5e5;font-size:15px;line-height:1.6;">לא הצלחנו לחייב את כרטיסך עבור <strong>${productName}</strong> בסך <strong>${formatPrice(amountUsd)}</strong>.</p>
       ${reason ? `<p style="margin:0 0 16px;color:#fbbf24;font-size:14px;background:rgba(251,191,36,0.1);padding:10px 12px;border-radius:6px;">סיבה: ${reason}</p>` : ''}
       ${cardLine({ pm: paymentMethod, lang })}
       <p style="margin:16px 0 8px;color:#a0a0b0;font-size:14px;">ניסיון ${attempt} מתוך ${maxAttempts}. ננסה שוב במהלך הימים הקרובים. אם הבעיה ממשיכה, ייתכן שהמנוי יבוטל.</p>
       <div style="text-align:center;margin:24px 0;"><a href="${updateCardUrl}" style="display:inline-block;background:linear-gradient(135deg,#a855f7,#7c3aed);color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">עדכן אמצעי תשלום</a></div>`
    : `<p style="margin:0 0 16px;color:#e5e5e5;font-size:15px;line-height:1.6;">We couldn't charge your card for <strong>${productName}</strong> (<strong>${formatPrice(amountUsd)}</strong>).</p>
       ${reason ? `<p style="margin:0 0 16px;color:#fbbf24;font-size:14px;background:rgba(251,191,36,0.1);padding:10px 12px;border-radius:6px;">Reason: ${reason}</p>` : ''}
       ${cardLine({ pm: paymentMethod, lang })}
       <p style="margin:16px 0 8px;color:#a0a0b0;font-size:14px;">Attempt ${attempt} of ${maxAttempts}. We'll try again over the next few days. If we can't charge after the final attempt, your subscription may be canceled.</p>
       <div style="text-align:center;margin:24px 0;"><a href="${updateCardUrl}" style="display:inline-block;background:linear-gradient(135deg,#a855f7,#7c3aed);color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">Update payment method</a></div>`;
  const html = baseShell({
    lang,
    html: `<div style="padding:28px 32px;border-bottom:1px solid #2a2a3a;"><h1 style="margin:0;color:#fff;font-size:22px;font-weight:600;">${heading}</h1></div>
           <div style="padding:24px 32px;">${body}</div>`,
  });
  const text = he
    ? `החיוב עבור ${productName} (${formatPrice(amountUsd)}) נכשל.\nניסיון ${attempt}/${maxAttempts}. ${reason || ''}\nעדכן אמצעי תשלום: ${updateCardUrl}`
    : `Renewal charge for ${productName} (${formatPrice(amountUsd)}) failed.\nAttempt ${attempt}/${maxAttempts}. ${reason || ''}\nUpdate: ${updateCardUrl}`;
  return { subject, html, text };
}

/**
 * Renewal failed permanently — subscription canceled.
 */
export function chargeRenewalFinalFailed({
  productName,
  reason,
  paymentMethod,
  reactivateUrl,
  lang = 'EN',
}) {
  const he = isHe(lang);
  const subject = he ? 'המנוי שלך בוטל עקב כשל בחיוב' : 'Your subscription was canceled';
  const heading = he ? 'המנוי בוטל' : 'Subscription canceled';
  const body = he
    ? `<p style="margin:0 0 16px;color:#e5e5e5;font-size:15px;line-height:1.6;">לאחר מספר ניסיונות, לא הצלחנו לחייב את כרטיסך עבור <strong>${productName}</strong>, ולכן המנוי בוטל.</p>
       ${reason ? `<p style="margin:0 0 16px;color:#ef4444;font-size:14px;background:rgba(239,68,68,0.1);padding:10px 12px;border-radius:6px;">סיבה אחרונה: ${reason}</p>` : ''}
       ${cardLine({ pm: paymentMethod, lang })}
       <p style="margin:16px 0 8px;color:#a0a0b0;font-size:14px;">ניתן להפעיל מחדש את המנוי בכל עת באמצעות עדכון אמצעי התשלום.</p>
       <div style="text-align:center;margin:24px 0;"><a href="${reactivateUrl}" style="display:inline-block;background:linear-gradient(135deg,#a855f7,#7c3aed);color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">הפעל מחדש את המנוי</a></div>`
    : `<p style="margin:0 0 16px;color:#e5e5e5;font-size:15px;line-height:1.6;">After several attempts, we couldn't charge your card for <strong>${productName}</strong>. Your subscription has been canceled.</p>
       ${reason ? `<p style="margin:0 0 16px;color:#ef4444;font-size:14px;background:rgba(239,68,68,0.1);padding:10px 12px;border-radius:6px;">Last reason: ${reason}</p>` : ''}
       ${cardLine({ pm: paymentMethod, lang })}
       <p style="margin:16px 0 8px;color:#a0a0b0;font-size:14px;">You can reactivate at any time by updating your payment method.</p>
       <div style="text-align:center;margin:24px 0;"><a href="${reactivateUrl}" style="display:inline-block;background:linear-gradient(135deg,#a855f7,#7c3aed);color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">Reactivate subscription</a></div>`;
  const html = baseShell({
    lang,
    html: `<div style="padding:28px 32px;border-bottom:1px solid #2a2a3a;"><h1 style="margin:0;color:#fff;font-size:22px;font-weight:600;">${heading}</h1></div>
           <div style="padding:24px 32px;">${body}</div>`,
  });
  const text = he
    ? `המנוי שלך עבור ${productName} בוטל לאחר מספר ניסיונות חיוב כושלים.\nהפעל מחדש: ${reactivateUrl}`
    : `Your ${productName} subscription was canceled after several failed charge attempts.\nReactivate: ${reactivateUrl}`;
  return { subject, html, text };
}

/**
 * Card expiring soon (T-30, T-7, expired) — same template, different urgency.
 */
export function cardExpiringReminder({
  paymentMethod,
  expiryDate,
  stage,                  // 'T30' | 'T7' | 'EXPIRED'
  updateCardUrl,
  lang = 'EN',
}) {
  const he = isHe(lang);
  const isExpired = stage === 'EXPIRED';
  const isUrgent = stage === 'T7' || isExpired;

  const subject = isExpired
    ? (he ? 'פג תוקף הכרטיס שלך — עדכן כעת' : 'Your card has expired — update now')
    : isUrgent
      ? (he ? 'הכרטיס שלך עומד לפוג בקרוב — עדכן כעת' : 'Your card expires soon — update now')
      : (he ? 'הכרטיס שלך יפוג בעוד כחודש' : 'Your card expires in about a month');

  const heading = isExpired
    ? (he ? 'הכרטיס פג תוקף' : 'Card expired')
    : (he ? 'הכרטיס עומד לפוג' : 'Card expiring soon');

  const urgencyColor = isExpired ? '#ef4444' : isUrgent ? '#fbbf24' : '#6366f1';

  const body = he
    ? `<p style="margin:0 0 16px;color:#e5e5e5;font-size:15px;line-height:1.6;">${
        isExpired
          ? `הכרטיס השמור ב-GhostSEO פג תוקף ב-${formatDate(expiryDate, lang)}. החיוב הבא של המנוי לא יצליח עד שיעודכן.`
          : `הכרטיס השמור ב-GhostSEO יפוג ב-${formatDate(expiryDate, lang)}. עדכן כעת כדי שהמנוי ימשיך לפעול ללא הפסקה.`
      }</p>
       ${cardLine({ pm: paymentMethod, lang })}
       <div style="text-align:center;margin:24px 0;"><a href="${updateCardUrl}" style="display:inline-block;background:${urgencyColor};color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">עדכן אמצעי תשלום</a></div>`
    : `<p style="margin:0 0 16px;color:#e5e5e5;font-size:15px;line-height:1.6;">${
        isExpired
          ? `The card we have on file expired on ${formatDate(expiryDate, lang)}. Your next subscription charge will fail until it's updated.`
          : `The card we have on file expires on ${formatDate(expiryDate, lang)}. Update it now so your subscription continues without interruption.`
      }</p>
       ${cardLine({ pm: paymentMethod, lang })}
       <div style="text-align:center;margin:24px 0;"><a href="${updateCardUrl}" style="display:inline-block;background:${urgencyColor};color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">Update payment method</a></div>`;

  const html = baseShell({
    lang,
    html: `<div style="padding:28px 32px;border-bottom:1px solid #2a2a3a;"><h1 style="margin:0;color:#fff;font-size:22px;font-weight:600;">${heading}</h1></div>
           <div style="padding:24px 32px;">${body}</div>`,
  });
  const text = he
    ? `${heading} — תאריך תפוגה: ${formatDate(expiryDate, lang)}\nעדכן: ${updateCardUrl}`
    : `${heading} — expires ${formatDate(expiryDate, lang)}\nUpdate: ${updateCardUrl}`;
  return { subject, html, text };
}
