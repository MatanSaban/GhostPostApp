import { createTransport } from 'nodemailer';

let transporter = null;

// RTL languages
const RTL_LANGUAGES = ['HE', 'AR'];

/**
 * Check if a language code is RTL
 */
export function isRtlLanguage(lang) {
  return RTL_LANGUAGES.includes(lang?.toUpperCase());
}

/**
 * Get or create a nodemailer transporter
 * Uses Gmail SMTP by default, but can be configured for other providers
 */
export function getMailer() {
  if (transporter) return transporter;
  
  const { GMAIL_USER, GMAIL_PASS, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  
  // Use custom SMTP if configured, otherwise use Gmail
  if (SMTP_HOST) {
    transporter = createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT || '587', 10),
      secure: SMTP_PORT === '465',
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });
  } else if (GMAIL_USER && GMAIL_PASS) {
    transporter = createTransport({
      service: 'gmail',
      pool: true,
      maxConnections: 3,
      maxMessages: 100,
      auth: {
        user: GMAIL_USER,
        pass: GMAIL_PASS,
      },
    });
  } else {
    console.warn('⚠️ Email not configured. Set GMAIL_USER/GMAIL_PASS or SMTP_* environment variables.');
    return null;
  }
  
  return transporter;
}

/**
 * Send an email
 * @param {Object} options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} [options.html] - HTML content
 * @param {string} [options.text] - Plain text content
 * @param {string} [options.from] - Override sender email
 */
export async function sendEmail({ to, subject, html, text, from }) {
  const mailer = getMailer();
  
  if (!mailer) {
    console.log(`📧 [EMAIL NOT CONFIGURED] Would send to: ${to}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   Content: ${text || html?.substring(0, 100)}...`);
    return { success: false, error: 'Email not configured' };
  }
  
  const fromName = process.env.EMAIL_FROM_NAME || 'Ghost Post';
  const fromAddress = from || process.env.EMAIL_FROM_ADDRESS || process.env.GMAIL_USER || 'no-reply@ghostpost.com';
  const sender = `"${fromName}" <${fromAddress}>`;
  
  try {
    const result = await mailer.sendMail({
      from: sender,
      to,
      subject,
      text: text || html?.replace(/<[^>]+>/g, '') || '',
      html,
    });
    
    console.log(`✅ Email sent to ${to}: ${subject}`);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error(`❌ Failed to send email to ${to}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Fire-and-forget email sending
 * Returns immediately, logs errors
 */
export function queueEmail(options) {
  sendEmail(options).catch(e => console.error('queueEmail failed:', e));
}

/**
 * Email translations
 */
const emailTranslations = {
  EN: {
    invitation: {
      subject: (accountName) => `You've been invited to join ${accountName} on Ghost Post`,
      youreInvited: "You're Invited!",
      invitedBy: (inviterName, accountName, roleName) => 
        `<strong>${inviterName}</strong> has invited you to join <strong>${accountName}</strong> on Ghost Post as a <strong>${roleName}</strong>.`,
      invitedByNoName: (accountName, roleName) => 
        `You have been invited to join <strong>${accountName}</strong> on Ghost Post as a <strong>${roleName}</strong>.`,
      clickButton: 'Click the button below to accept the invitation and get started:',
      acceptInvitation: 'Accept Invitation',
      ignoreNote: "If you didn't expect this invitation, you can safely ignore this email.",
      expiresNote: 'This invitation link will expire in 7 days.',
      textInvite: (accountName, inviterName, roleName) => 
        `You've been invited to join ${accountName} on Ghost Post!\n\n${inviterName} has invited you as a ${roleName}.`,
    },
    otp: {
      subject: 'Your Ghost Post Verification Code',
      verificationCode: 'Verification Code',
      useCode: 'Use this code to verify your account:',
      expiresIn: (time) => `This code expires in ${time}.`,
      ignoreNote: "If you didn't request this code, please ignore this email.",
    },
  },
  HE: {
    invitation: {
      subject: (accountName) => `הוזמנת להצטרף ל-${accountName} ב-Ghost Post`,
      youreInvited: 'הוזמנת!',
      invitedBy: (inviterName, accountName, roleName) => 
        `<strong>${inviterName}</strong> הזמין/ה אותך להצטרף ל-<strong>${accountName}</strong> ב-Ghost Post כ-<strong>${roleName}</strong>.`,
      invitedByNoName: (accountName, roleName) => 
        `הוזמנת להצטרף ל-<strong>${accountName}</strong> ב-Ghost Post כ-<strong>${roleName}</strong>.`,
      clickButton: 'לחץ/י על הכפתור למטה כדי לקבל את ההזמנה ולהתחיל:',
      acceptInvitation: 'קבל הזמנה',
      ignoreNote: 'אם לא ציפית להזמנה זו, ניתן להתעלם מהודעה זו.',
      expiresNote: 'קישור ההזמנה יפוג תוך 7 ימים.',
      textInvite: (accountName, inviterName, roleName) => 
        `הוזמנת להצטרף ל-${accountName} ב-Ghost Post!\n\n${inviterName} הזמין אותך כ-${roleName}.`,
    },
    otp: {
      subject: 'קוד האימות שלך ב-Ghost Post',
      verificationCode: 'קוד אימות',
      useCode: 'השתמש/י בקוד זה לאימות החשבון:',
      expiresIn: (time) => `קוד זה יפוג בעוד ${time}.`,
      ignoreNote: 'אם לא ביקשת קוד זה, ניתן להתעלם מהודעה זו.',
    },
  },
};

// Role translations
const roleTranslations = {
  EN: { Owner: 'Owner', Admin: 'Admin', Editor: 'Editor', Viewer: 'Viewer', User: 'User' },
  HE: { Owner: 'בעלים', Admin: 'מנהל', Editor: 'עורך', Viewer: 'צופה', User: 'משתמש' },
};

/**
 * Get translations for a language
 */
function getTranslations(lang = 'EN') {
  const normalizedLang = lang?.toUpperCase() || 'EN';
  return emailTranslations[normalizedLang] || emailTranslations.EN;
}

/**
 * Get role translation
 */
function translateRole(roleName, lang = 'EN') {
  const normalizedLang = lang?.toUpperCase() || 'EN';
  const roles = roleTranslations[normalizedLang] || roleTranslations.EN;
  return roles[roleName] || roleName;
}

/**
 * Get base email styles
 */
function getEmailStyles(isRtl) {
  return {
    direction: isRtl ? 'rtl' : 'ltr',
    textAlign: isRtl ? 'right' : 'left',
  };
}

/**
 * Email templates
 */
export const emailTemplates = {
  /**
   * Account invitation email
   */
  invitation: ({ accountName, inviterName, inviteUrl, roleName, language = 'EN' }) => {
    const t = getTranslations(language).invitation;
    const isRtl = isRtlLanguage(language);
    const translatedRole = translateRole(roleName, language);
    const styles = getEmailStyles(isRtl);
    
    const inviteText = inviterName 
      ? t.invitedBy(inviterName, accountName, translatedRole)
      : t.invitedByNoName(accountName, translatedRole);
    
    return {
      subject: t.subject(accountName),
      html: `
        <!DOCTYPE html>
        <html lang="${language.toLowerCase()}" dir="${isRtl ? 'rtl' : 'ltr'}">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #0a0a0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #0a0a0f;">
            <tr>
              <td style="padding: 40px 20px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 520px; margin: 0 auto;">
                  <!-- Logo -->
                  <tr>
                    <td style="text-align: center; padding-bottom: 32px;">
                      <div style="display: inline-block; background: linear-gradient(135deg, #a855f7 0%, #7c3aed 50%, #6366f1 100%); padding: 16px 24px; border-radius: 12px;">
                        <span style="color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">Ghost Post</span>
                      </div>
                    </td>
                  </tr>
                  
                  <!-- Main Card -->
                  <tr>
                    <td>
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background: linear-gradient(180deg, #1a1a24 0%, #12121a 100%); border-radius: 16px; border: 1px solid #2a2a3a; overflow: hidden;">
                        <!-- Header with gradient -->
                        <tr>
                          <td style="background: linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(99, 102, 241, 0.15) 100%); padding: 32px 32px 24px; border-bottom: 1px solid #2a2a3a;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; text-align: center; direction: ${styles.direction};">
                              ${t.youreInvited}
                            </h1>
                          </td>
                        </tr>
                        
                        <!-- Content -->
                        <tr>
                          <td style="padding: 32px; direction: ${styles.direction}; text-align: ${styles.textAlign};">
                            <p style="margin: 0 0 24px; color: #e5e5e5; font-size: 16px; line-height: 1.7;">
                              ${inviteText}
                            </p>
                            <p style="margin: 0 0 32px; color: #a0a0b0; font-size: 15px; line-height: 1.6;">
                              ${t.clickButton}
                            </p>
                            
                            <!-- CTA Button -->
                            <div style="text-align: center; margin: 32px 0;">
                              <a href="${inviteUrl}" style="display: inline-block; background: linear-gradient(135deg, #a855f7 0%, #7c3aed 50%, #6366f1 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 10px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 20px rgba(168, 85, 247, 0.4);">
                                ${t.acceptInvitation}
                              </a>
                            </div>
                            
                            <p style="margin: 24px 0 0; color: #6b6b7b; font-size: 14px; line-height: 1.5;">
                              ${t.ignoreNote}
                            </p>
                          </td>
                        </tr>
                        
                        <!-- Footer -->
                        <tr>
                          <td style="padding: 20px 32px; background: rgba(0, 0, 0, 0.3); border-top: 1px solid #2a2a3a;">
                            <p style="margin: 0; color: #505060; font-size: 13px; text-align: center;">
                              ${t.expiresNote}
                            </p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  
                  <!-- Bottom branding -->
                  <tr>
                    <td style="padding-top: 32px; text-align: center;">
                      <p style="margin: 0; color: #404050; font-size: 12px;">
                        © ${new Date().getFullYear()} Ghost Post. All rights reserved.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
      text: t.textInvite(accountName, inviterName || 'Someone', translatedRole) + `\n\nAccept: ${inviteUrl}\n\n${t.expiresNote}`,
    };
  },

  /**
   * OTP verification email
   */
  otp: ({ code, expiresIn = '10 minutes', language = 'EN' }) => {
    const t = getTranslations(language).otp;
    const isRtl = isRtlLanguage(language);
    const styles = getEmailStyles(isRtl);
    
    return {
      subject: t.subject,
      html: `
        <!DOCTYPE html>
        <html lang="${language.toLowerCase()}" dir="${isRtl ? 'rtl' : 'ltr'}">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #0a0a0f; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #0a0a0f;">
            <tr>
              <td style="padding: 40px 20px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 520px; margin: 0 auto;">
                  <!-- Logo -->
                  <tr>
                    <td style="text-align: center; padding-bottom: 32px;">
                      <div style="display: inline-block; background: linear-gradient(135deg, #a855f7 0%, #7c3aed 50%, #6366f1 100%); padding: 16px 24px; border-radius: 12px;">
                        <span style="color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">Ghost Post</span>
                      </div>
                    </td>
                  </tr>
                  
                  <!-- Main Card -->
                  <tr>
                    <td>
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background: linear-gradient(180deg, #1a1a24 0%, #12121a 100%); border-radius: 16px; border: 1px solid #2a2a3a; overflow: hidden;">
                        <!-- Header -->
                        <tr>
                          <td style="background: linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(99, 102, 241, 0.15) 100%); padding: 32px 32px 24px; border-bottom: 1px solid #2a2a3a;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; text-align: center; direction: ${styles.direction};">
                              ${t.verificationCode}
                            </h1>
                          </td>
                        </tr>
                        
                        <!-- Content -->
                        <tr>
                          <td style="padding: 32px; text-align: center; direction: ${styles.direction};">
                            <p style="margin: 0 0 24px; color: #a0a0b0; font-size: 16px;">
                              ${t.useCode}
                            </p>
                            
                            <!-- OTP Code Box -->
                            <div style="background: rgba(168, 85, 247, 0.1); border: 2px solid rgba(168, 85, 247, 0.3); padding: 24px; border-radius: 12px; margin: 24px 0;">
                              <span style="font-size: 40px; font-weight: 700; letter-spacing: 12px; color: #a855f7; font-family: monospace;">${code}</span>
                            </div>
                            
                            <p style="margin: 24px 0 0; color: #6b6b7b; font-size: 14px;">
                              ${t.expiresIn(expiresIn)}
                            </p>
                          </td>
                        </tr>
                        
                        <!-- Footer -->
                        <tr>
                          <td style="padding: 20px 32px; background: rgba(0, 0, 0, 0.3); border-top: 1px solid #2a2a3a;">
                            <p style="margin: 0; color: #505060; font-size: 13px; text-align: center;">
                              ${t.ignoreNote}
                            </p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  
                  <!-- Bottom branding -->
                  <tr>
                    <td style="padding-top: 32px; text-align: center;">
                      <p style="margin: 0; color: #404050; font-size: 12px;">
                        © ${new Date().getFullYear()} Ghost Post. All rights reserved.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
      text: `${t.useCode} ${code}\n\n${t.expiresIn(expiresIn)}\n\n${t.ignoreNote}`,
    };
  },
};
