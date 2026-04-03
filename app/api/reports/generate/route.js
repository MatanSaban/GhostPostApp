/**
 * White-Label Report Generation API
 * 
 * POST /api/reports/generate
 * 
 * Generates a branded PDF report for a site, uploads to Cloudinary,
 * and saves to ReportArchive.
 */

import { NextResponse } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';
import prisma from '@/lib/prisma';
import { generateReportPdf, getDefaultBranding } from '@/lib/reports/pdf-generator';
import { generateTextResponse } from '@/lib/ai/gemini';
import { getCurrentAccountMember } from '@/lib/auth-permissions';
import { hasPermission, CAPABILITIES } from '@/lib/permissions';
import { getPlanLimits } from '@/lib/account-utils';

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
      console.error(`[ReportGen] Failed to fetch image: ${response.status}`);
      return null;
    }
    
    const contentType = response.headers.get('content-type') || 'image/png';
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    
    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    console.error('[ReportGen] Error fetching image:', error);
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
        type: 'upload',
        format: 'pdf',
        overwrite: true,
        access_mode: 'public',
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
async function generateAiSummary(siteName, currentScore, previousScore, executedActions, locale = 'en') {
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
    });
    
    return summary.trim();
  } catch (error) {
    console.error('[ReportGen] AI summary generation failed:', error);
    return null;
  }
}

/**
 * Get report month string
 */
function getReportMonth(locale = 'en') {
  const now = new Date();
  return now.toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', { month: 'long', year: 'numeric' });
}

/**
 * POST /api/reports/generate
 * 
 * Body: { siteId: string, forceMonth?: string }
 */
export async function POST(request) {
  try {
    // ─── Auth ─────────────────────────────────────────────────────────────────
    const { authorized, member } = await getCurrentAccountMember();
    if (!authorized || !member) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Check permission
    if (!hasPermission(member, 'REPORTS', CAPABILITIES.VIEW)) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }
    
    const body = await request.json();
    const { siteId, forceMonth, locale = 'en' } = body;
    
    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
    }
    
    // ─── Fetch Site & Account ─────────────────────────────────────────────────
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      include: {
        account: {
          include: {
            subscription: {
              include: { plan: true },
            },
          },
        },
      },
    });
    
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }
    
    // Verify account access
    if (site.accountId !== member.accountId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    
    // ─── Check Plan Limitations ───────────────────────────────────────────────
    const plan = site.account?.subscription?.plan;
    const limits = getPlanLimits(plan);
    
    if (!limits.whiteLabelReports) {
      return NextResponse.json({ 
        error: 'White-label reports are not available on your current plan',
        code: 'PLAN_LIMIT_EXCEEDED',
      }, { status: 403 });
    }
    
    // ─── Fetch Report Data ────────────────────────────────────────────────────
    const month = forceMonth || getReportMonth(locale);
    
    // Get last 2 completed audits (for delta calculation)
    const audits = await prisma.siteAudit.findMany({
      where: { 
        siteId,
        status: 'COMPLETED',
      },
      orderBy: { completedAt: 'desc' },
      take: 2,
    });
    
    const currentAudit = audits[0] || null;
    const previousAudit = audits[1] || null;
    
    // Get executed agent actions from last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const executedActions = await prisma.agentInsight.findMany({
      where: {
        siteId,
        status: 'EXECUTED',
        executedAt: { gte: thirtyDaysAgo },
      },
      orderBy: { executedAt: 'desc' },
    });
    
    // ─── Get Branding ─────────────────────────────────────────────────────────
    const whiteLabelConfig = site.account?.whiteLabelConfig || {};
    
    // Fetch and convert logo to base64 for PDF rendering
    const logoBase64 = await fetchImageAsBase64(whiteLabelConfig.agencyLogo);
    
    const branding = {
      ...getDefaultBranding(),
      // Map whiteLabelConfig fields to branding fields
      logoUrl: logoBase64, // Use base64 for PDF compatibility
      agencyName: site.account?.name || '',
      primaryColor: whiteLabelConfig.accentColor || '#7b2cbf',
      replyToEmail: whiteLabelConfig.replyToEmail || '',
    };
    
    // ─── Report Config ────────────────────────────────────────────────────────
    const toolSettings = site.toolSettings || {};
    const reportConfig = toolSettings.reportConfig || {};
    
    // ─── Generate AI Summary ──────────────────────────────────────────────────
    let aiSummary = null;
    if (reportConfig.includeAiSummary !== false) {
      aiSummary = await generateAiSummary(
        site.name,
        currentAudit?.score,
        previousAudit?.score,
        executedActions,
        locale
      );
    }
    
    // ─── Generate PDF ─────────────────────────────────────────────────────────
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
    
    // ─── Upload to Cloudinary ─────────────────────────────────────────────────
    const timestamp = Date.now();
    const sanitizedSiteName = site.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    const publicId = `report-${sanitizedSiteName}-${month.replace(/\s/g, '-').toLowerCase()}-${timestamp}`;
    
    const pdfUrl = await uploadPdfToCloudinary(
      pdfBuffer,
      `reports/${site.accountId}`,
      publicId
    );
    
    // ─── Save to Archive ──────────────────────────────────────────────────────
    const recipients = reportConfig.recipients || [];
    const deliveryMode = reportConfig.deliveryMode || 'DRAFT';
    
    const archive = await prisma.reportArchive.create({
      data: {
        siteId,
        accountId: site.accountId,
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
        },
      },
    });
    
    console.log(`[ReportGen] Generated report ${archive.id} for site ${site.name} (${month})`);
    
    return NextResponse.json({
      success: true,
      reportId: archive.id,
      pdfUrl,
      month,
      status: 'DRAFT',
      metadata: archive.metadata,
    });
    
  } catch (error) {
    console.error('[ReportGen] Error:', error);
    return NextResponse.json({ 
      error: 'Failed to generate report',
      details: error.message,
    }, { status: 500 });
  }
}

/**
 * GET /api/reports/generate?siteId=xxx
 * 
 * Get report generation status and history
 */
export async function GET(request) {
  try {
    const { authorized, member } = await getCurrentAccountMember();
    if (!authorized || !member) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    
    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
    }
    
    // Verify site access
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { accountId: true },
    });
    
    if (!site || site.accountId !== member.accountId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    
    // Get recent reports
    const reports = await prisma.reportArchive.findMany({
      where: { siteId },
      orderBy: { generatedAt: 'desc' },
      take: 12, // Last 12 months
    });
    
    return NextResponse.json({ reports });
    
  } catch (error) {
    console.error('[ReportGen] GET Error:', error);
    return NextResponse.json({ error: 'Failed to fetch reports' }, { status: 500 });
  }
}
