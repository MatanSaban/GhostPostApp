/**
 * Monthly Report Generation Cron
 * 
 * GET /api/cron/generate-reports
 * 
 * Runs monthly to generate white-label PDF reports for all eligible sites.
 * Should be triggered on the 1st of each month via Vercel Cron or external scheduler.
 */

import { NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import prisma from '@/lib/prisma';
import { generateReportPdf, getDefaultBranding } from '@/lib/reports/pdf-generator';
import { generateTextResponse } from '@/lib/ai/gemini';
import { sendEmail } from '@/lib/mailer';
import { getPlanLimits } from '@/lib/account-utils';

// ─── Security ────────────────────────────────────────────────────────────────
function verifyAuth(request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // dev mode
  return authHeader === `Bearer ${cronSecret}`;
}

// ─── Cloudinary Config ───────────────────────────────────────────────────────
function ensureCloudinaryConfig() {
  const cUrl = process.env.CLOUDINARY_URL;
  if (cUrl) {
    const match = cUrl.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/);
    if (match) {
      cloudinary.config({ cloud_name: match[3], api_key: match[1], api_secret: match[2], secure: true });
      return;
    }
  }
  if (!cloudinary.config().api_key) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }
}

/**
 * Fetch an image URL and convert to base64 data URL for @react-pdf/renderer
 * This ensures external images (like Cloudinary) work properly in PDFs
 */
async function fetchImageAsBase64(imageUrl) {
  if (!imageUrl) return null;
  
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.error(`[CronReports] Failed to fetch image: ${response.status}`);
      return null;
    }
    
    const contentType = response.headers.get('content-type') || 'image/png';
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    
    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    console.error('[CronReports] Error fetching image:', error);
    return null;
  }
}

/**
 * Upload PDF buffer to Cloudinary
 */
async function uploadPdfToCloudinary(buffer, folder, publicId) {
  ensureCloudinaryConfig();
  
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: 'raw',
        format: 'pdf',
        overwrite: true,
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    );
    
    uploadStream.end(buffer);
  });
}

/**
 * Generate AI executive summary
 */
async function generateAiSummary(siteName, currentScore, previousScore, executedActions, locale = 'en', { accountId, siteId } = {}) {
  const delta = currentScore != null && previousScore != null 
    ? currentScore - previousScore 
    : null;
  
  const isHebrew = locale === 'he';
  
  // Language-specific templates
  const templates = {
    en: {
      deltaWithChange: `The site's health score changed by ${delta > 0 ? '+' : ''}${delta} to ${currentScore}.`,
      deltaNoChange: `The site's current health score is ${currentScore ?? 'not available'}.`,
      noActions: 'No automated actions were executed this month.',
      defaultAction: 'SEO optimization',
      prompt: `You are a senior SEO Account Manager for an agency. Write a concise, 4-sentence executive summary for the client about their website "${siteName}".

{deltaText}

We executed these automated actions: {actionsList}

Keep it professional, encouraging, and focused on ROI. Output plain text only, no markdown.`,
      system: 'You are a professional SEO account manager writing monthly reports for clients.',
    },
    he: {
      deltaWithChange: `ציון בריאות האתר השתנה ב-${delta > 0 ? '+' : ''}${delta} ל-${currentScore}.`,
      deltaNoChange: `ציון בריאות האתר הנוכחי הוא ${currentScore ?? 'לא זמין'}.`,
      noActions: 'לא בוצעו פעולות אוטומטיות החודש.',
      defaultAction: 'אופטימיזציית SEO',
      prompt: `אתה מנהל חשבון SEO בכיר בסוכנות. כתוב סיכום מנהלים תמציתי בן 4 משפטים עבור הלקוח על האתר שלו "${siteName}".

{deltaText}

ביצענו את הפעולות האוטומטיות הבאות: {actionsList}

שמור על טון מקצועי ומעודד, עם דגש על ROI. פלט טקסט רגיל בלבד, ללא markdown. כתוב בעברית.`,
      system: 'אתה מנהל חשבון SEO מקצועי הכותב דוחות חודשיים ללקוחות. כתוב בעברית.',
    },
  };
  
  const t = templates[locale] || templates.en;
  
  const deltaText = delta != null ? t.deltaWithChange : t.deltaNoChange;
  
  const actionsList = executedActions?.length > 0
    ? executedActions.slice(0, 10).map(a => a.data?.description || a.descriptionKey || t.defaultAction).join(', ')
    : t.noActions;
  
  const prompt = t.prompt.replace('{deltaText}', deltaText).replace('{actionsList}', actionsList);

  try {
    const summary = await generateTextResponse({
      system: t.system,
      prompt,
      maxTokens: 300,
      temperature: 0.7,
      operation: 'REPORT_SUMMARY',
      metadata: { siteName, currentScore, actionsCount: executedActions?.length || 0, locale },
      accountId,
      siteId,
    });
    
    return summary.trim();
  } catch (error) {
    console.error('[CronReports] AI summary generation failed:', error);
    return null;
  }
}

/**
 * Get email translations
 */
function getEmailTranslations(locale = 'en') {
  const translations = {
    en: {
      subject: '{siteName} Performance Report - {month}',
      title: 'Your SEO Performance Report is Ready',
      greeting: 'Hello,',
      body: 'Your monthly SEO performance report for <strong>{siteName}</strong> is now available. This report covers <strong>{month}</strong>.',
      downloadButton: 'Download Report (PDF)',
      generatedBy: 'Generated by',
      defaultAgencyName: 'Your SEO Agency',
    },
    he: {
      subject: 'דוח ביצועים {siteName} - {month}',
      title: 'דוח ביצועי ה-SEO שלך מוכן',
      greeting: 'שלום,',
      body: 'דוח ביצועי ה-SEO החודשי עבור <strong>{siteName}</strong> זמין כעת. דוח זה מכסה את <strong>{month}</strong>.',
      downloadButton: 'הורד דוח (PDF)',
      generatedBy: 'נוצר על ידי',
      defaultAgencyName: 'סוכנות ה-SEO שלך',
    },
  };
  return translations[locale] || translations.en;
}

/**
 * Generate email HTML for report delivery
 */
function generateReportEmailHtml({ branding, siteName, month, pdfUrl, locale = 'en' }) {
  const t = getEmailTranslations(locale);
  const primaryColor = branding?.primaryColor || '#7b2cbf';
  const agencyName = branding?.agencyName || t.defaultAgencyName;
  const direction = locale === 'he' ? 'rtl' : 'ltr';
  const textAlign = locale === 'he' ? 'right' : 'left';
  
  // Replace placeholders
  const bodyText = t.body.replace('{siteName}', siteName).replace('{month}', month);
  
  return `
<!DOCTYPE html>
<html dir="${direction}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5; direction: ${direction};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background-color: ${primaryColor}; padding: 30px; text-align: center;">
              ${branding?.logoUrl 
                ? `<img src="${branding.logoUrl}" alt="${agencyName}" style="max-width: 150px; max-height: 50px;" />`
                : `<h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">${agencyName}</h1>`
              }
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px; text-align: ${textAlign};">
              <h2 style="color: #1a1a2e; margin: 0 0 20px; font-size: 22px; font-weight: 600;">
                ${t.title}
              </h2>
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                ${bodyText}
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <a href="${pdfUrl}" 
                       style="display: inline-block; background-color: ${primaryColor}; color: #ffffff; 
                              text-decoration: none; padding: 14px 32px; border-radius: 8px; 
                              font-size: 16px; font-weight: 600;">
                      ${t.downloadButton}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f9fafb; padding: 20px 30px; border-top: 1px solid #e5e7eb;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0; text-align: center;">
                ${t.generatedBy} ${agencyName}
                ${branding?.replyToEmail ? ` | ${branding.replyToEmail}` : ''}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Get report month string
 */
function getReportMonth(locale = 'en') {
  const now = new Date();
  // Get previous month (since we're generating at start of new month)
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return prevMonth.toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', { month: 'long', year: 'numeric' });
}

/**
 * Process a single site for report generation
 */
async function processReportForSite(site, account, branding) {
  // Get locale from account settings or default to 'en'
  const locale = account?.settings?.locale || 'en';
  const month = getReportMonth(locale);
  const emailTranslations = getEmailTranslations(locale);
  
  try {
    // Check if report already exists for this month
    const existingReport = await prisma.reportArchive.findFirst({
      where: {
        siteId: site.id,
        month,
      },
    });
    
    if (existingReport) {
      console.log(`[CronReports] Report already exists for ${site.name} - ${month}`);
      return { skipped: true, reason: 'already_exists' };
    }
    
    // Get report config from site settings
    const reportConfig = site.toolSettings?.reportConfig || {};
    
    // Get last 2 completed audits
    const audits = await prisma.siteAudit.findMany({
      where: { 
        siteId: site.id,
        status: 'COMPLETED',
      },
      orderBy: { completedAt: 'desc' },
      take: 2,
    });
    
    const currentAudit = audits[0] || null;
    const previousAudit = audits[1] || null;
    
    // Get executed actions from last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const executedActions = await prisma.agentInsight.findMany({
      where: {
        siteId: site.id,
        status: 'EXECUTED',
        executedAt: { gte: thirtyDaysAgo },
      },
      orderBy: { executedAt: 'desc' },
    });
    
    // Generate AI summary if enabled
    let aiSummary = null;
    if (reportConfig.includeAiSummary !== false) {
      aiSummary = await generateAiSummary(
        site.name,
        currentAudit?.score,
        previousAudit?.score,
        executedActions,
        locale,
        { accountId: account.id, siteId: site.id }
      );
    }
    
    // Generate PDF
    const pdfBuffer = await generateReportPdf({
      branding,
      siteName: site.name,
      siteUrl: site.url,
      month,
      aiSummary,
      currentScore: currentAudit?.score,
      previousScore: previousAudit?.score,
      categoryScores: currentAudit?.categoryScores,
      previousCategoryScores: previousAudit?.categoryScores,
      executedActions: reportConfig.includeAgentActions !== false ? executedActions : [],
      locale,
    });
    
    // Upload to Cloudinary
    const timestamp = Date.now();
    const sanitizedSiteName = site.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    const publicId = `report-${sanitizedSiteName}-${month.replace(/\s/g, '-').toLowerCase()}-${timestamp}`;
    
    const pdfUrl = await uploadPdfToCloudinary(
      pdfBuffer,
      `reports/${account.id}`,
      publicId
    );
    
    // Save to archive
    const recipients = reportConfig.recipients || [];
    const deliveryMode = reportConfig.deliveryMode || 'DRAFT';
    
    const archive = await prisma.reportArchive.create({
      data: {
        siteId: site.id,
        accountId: account.id,
        pdfUrl,
        recipients,
        status: 'DRAFT',
        month,
        metadata: {
          score: currentAudit?.score,
          delta: currentAudit?.score != null && previousAudit?.score != null
            ? currentAudit.score - previousAudit.score
            : null,
          actionsCount: executedActions.length,
          deliveryMode,
          locale,
        },
      },
    });
    
    // Auto-send if delivery mode is AUTO
    if (deliveryMode === 'AUTO' && recipients.length > 0) {
      const emailHtml = generateReportEmailHtml({
        branding,
        siteName: site.name,
        month,
        pdfUrl,
        locale,
      });
      
      // Generate subject with translations
      const emailSubject = emailTranslations.subject
        .replace('{siteName}', site.name)
        .replace('{month}', month);
      
      let allSent = true;
      for (const recipient of recipients) {
        try {
          await sendEmail({
            to: recipient,
            subject: emailSubject,
            html: emailHtml,
            from: branding.replyToEmail || undefined,
          });
        } catch (error) {
          console.error(`[CronReports] Failed to send to ${recipient}:`, error);
          allSent = false;
        }
      }
      
      // Update status
      await prisma.reportArchive.update({
        where: { id: archive.id },
        data: {
          status: allSent ? 'SENT' : 'ERROR',
          sentAt: allSent ? new Date() : undefined,
          error: allSent ? null : 'Some emails failed to send',
        },
      });
      
      return { success: true, sent: true, reportId: archive.id };
    }
    
    return { success: true, sent: false, reportId: archive.id };
    
  } catch (error) {
    console.error(`[CronReports] Error processing site ${site.name}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * GET /api/cron/generate-reports
 */
export async function GET(request) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  console.log('[CronReports] Starting monthly report generation...');
  
  try {
    // Find all accounts with white-label reports enabled in their plan
    const accounts = await prisma.account.findMany({
      where: {
        isActive: true,
        subscription: {
          status: 'ACTIVE',
        },
      },
      include: {
        subscription: {
          include: { plan: true },
        },
        sites: {
          where: { isActive: true },
        },
      },
    });
    
    const results = {
      processed: 0,
      generated: 0,
      sent: 0,
      skipped: 0,
      errors: 0,
    };
    
    for (const account of accounts) {
      // Check plan allows white-label reports
      const limits = getPlanLimits(account.subscription?.plan);
      if (!limits.whiteLabelReports) {
        continue;
      }
      
      // Get branding - map whiteLabelConfig fields to branding fields
      const whiteLabelConfig = account.whiteLabelConfig || {};
      
      // Fetch and convert logo to base64 for PDF rendering (once per account)
      const logoBase64 = await fetchImageAsBase64(whiteLabelConfig.agencyLogo);
      
      const branding = {
        ...getDefaultBranding(),
        logoUrl: logoBase64, // Use base64 for PDF compatibility
        agencyName: account.name || '',
        primaryColor: whiteLabelConfig.accentColor || '#7b2cbf',
        replyToEmail: whiteLabelConfig.replyToEmail || '',
      };
      
      // Process each site
      for (const site of account.sites) {
        const reportConfig = site.toolSettings?.reportConfig;
        
        // Skip if reporting not enabled for this site
        if (!reportConfig?.enabled) {
          continue;
        }
        
        results.processed++;
        
        const result = await processReportForSite(site, account, branding);
        
        if (result.skipped) {
          results.skipped++;
        } else if (result.success) {
          results.generated++;
          if (result.sent) {
            results.sent++;
          }
        } else {
          results.errors++;
        }
      }
    }
    
    console.log(`[CronReports] Completed: ${JSON.stringify(results)}`);
    
    return NextResponse.json({
      success: true,
      ...results,
    });
    
  } catch (error) {
    console.error('[CronReports] Error:', error);
    return NextResponse.json({ 
      error: 'Failed to generate reports',
      details: error.message,
    }, { status: 500 });
  }
}
