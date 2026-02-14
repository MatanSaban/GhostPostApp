import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { deductAiCredits } from '@/lib/account-utils';
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import { makePluginRequest } from '@/lib/wp-api-client';

const SESSION_COOKIE = 'user_session';
const FIX_CREDIT_COST = 2;

// Issue types that can be auto-fixed
const FIXABLE_ISSUES = [
  'audit.issues.noTitle',
  'audit.issues.noMetaDescription',
  'audit.issues.metaDescriptionShort',
  'audit.issues.noCanonical',
  'audit.issues.imagesNoAlt',
  'audit.issues.missingOG',
  'audit.issues.titleTooShort',
];

const fixSchema = z.object({
  metaTitle: z.string().optional().describe('Suggested SEO meta title (50-60 chars)'),
  metaDescription: z.string().optional().describe('Suggested SEO meta description (120-160 chars)'),
  canonical: z.string().optional().describe('Suggested canonical URL'),
  ogTitle: z.string().optional().describe('Open Graph title'),
  ogDescription: z.string().optional().describe('Open Graph description'),
  altTexts: z.array(z.object({
    imageUrl: z.string(),
    altText: z.string(),
  })).optional().describe('Alt text suggestions for images'),
  explanation: z.string().describe('Brief explanation of the fix applied'),
});

async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) return null;
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        accountMemberships: {
          select: { accountId: true },
        },
      },
    });
  } catch {
    return null;
  }
}

/**
 * POST: AI Quick Fix for a specific SEO issue
 *
 * Body: { auditId, siteId, issueType, pageUrl }
 *
 * Cost: 2 AI Credits
 * Uses Gemini to generate the fix, then pushes via WP plugin if connected.
 */
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { auditId, siteId, issueType, pageUrl } = await request.json();

    if (!auditId || !siteId || !issueType || !pageUrl) {
      return NextResponse.json(
        { error: 'auditId, siteId, issueType, and pageUrl are required' },
        { status: 400 }
      );
    }

    // Verify issue is fixable
    if (!FIXABLE_ISSUES.includes(issueType)) {
      return NextResponse.json(
        { error: 'This issue type cannot be auto-fixed' },
        { status: 400 }
      );
    }

    // Verify site access
    const accountIds = user.accountMemberships.map(m => m.accountId);
    const site = await prisma.site.findFirst({
      where: { id: siteId, accountId: { in: accountIds } },
      select: { id: true, url: true, name: true, accountId: true, connectionStatus: true },
    });
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Deduct credits
    const deduction = await deductAiCredits(site.accountId, FIX_CREDIT_COST, {
      userId: user.id,
      siteId,
      source: 'audit_quick_fix',
      description: `AI Quick Fix: ${issueType} on ${pageUrl}`,
    });

    if (!deduction.success) {
      console.warn('[QuickFix] Credit deduction failed:', deduction.error);
      return NextResponse.json(
        { error: deduction.error || 'Credit deduction failed', code: 'INSUFFICIENT_CREDITS', resourceKey: 'aiCredits' },
        { status: 402 }
      );
    }

    // Get the audit to understand context
    const audit = await prisma.siteAudit.findFirst({
      where: { id: auditId, siteId },
    });

    const pageResult = audit?.pageResults?.find(pr => pr.url === pageUrl);
    const currentTitle = pageResult?.title || '';
    const currentDesc = pageResult?.metaDescription || '';

    // Generate fix using Gemini
    const prompt = buildFixPrompt(issueType, pageUrl, site.name, currentTitle, currentDesc);

    const result = await generateObject({
      model: google('gemini-2.0-flash'),
      schema: fixSchema,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    });

    const fix = result.object;

    // Attempt to push the fix via WordPress plugin
    let pushed = false;
    let pushError = null;

    if (site.connectionStatus === 'connected') {
      try {
        const seoData = {};
        if (fix.metaTitle) seoData.title = fix.metaTitle;
        if (fix.metaDescription) seoData.description = fix.metaDescription;
        if (fix.ogTitle) seoData.og_title = fix.ogTitle;
        if (fix.ogDescription) seoData.og_description = fix.ogDescription;

        if (Object.keys(seoData).length > 0) {
          // Find the WP post for this URL
          const pathName = new URL(pageUrl).pathname.replace(/^\/|\/$/g, '');
          await makePluginRequest(site, `/seo-fix`, 'POST', {
            slug: pathName || 'homepage',
            url: pageUrl,
            seoData,
            altTexts: fix.altTexts || [],
          });
          pushed = true;
        }
      } catch (err) {
        pushError = err.message;
        console.warn('[FixIssue] Plugin push failed:', err.message);
      }
    }

    return NextResponse.json({
      success: true,
      fix,
      pushed,
      pushError,
      creditsUsed: FIX_CREDIT_COST,
      remainingBalance: deduction.balance,
      creditsUpdated: { used: deduction.usedTotal },
    });
  } catch (error) {
    console.error('[API/audit/fix-issue] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function buildFixPrompt(issueType, pageUrl, siteName, currentTitle, currentDesc) {
  const context = `Website: ${siteName || 'Unknown'}\nPage URL: ${pageUrl}\nCurrent Title: "${currentTitle}"\nCurrent Meta Description: "${currentDesc}"`;

  switch (issueType) {
    case 'audit.issues.noTitle':
    case 'audit.issues.titleTooShort':
      return `${context}\n\nGenerate an SEO-optimized meta title for this page (50-60 chars). The title should accurately describe the page content and include the brand name.`;

    case 'audit.issues.noMetaDescription':
    case 'audit.issues.metaDescriptionShort':
      return `${context}\n\nGenerate an SEO-optimized meta description for this page (120-160 chars). It should be compelling, contain relevant keywords, and include a call-to-action.`;

    case 'audit.issues.noCanonical':
      return `${context}\n\nSuggest the correct canonical URL for this page. Usually it's the clean version of the current URL without query parameters.`;

    case 'audit.issues.imagesNoAlt':
      return `${context}\n\nGenerate descriptive, SEO-friendly alt texts for images on this page. Focus on accessibility and including relevant keywords.`;

    case 'audit.issues.missingOG':
      return `${context}\n\nGenerate Open Graph tags (og:title and og:description) for this page. They should be engaging for social media sharing.`;

    default:
      return `${context}\n\nGenerate an SEO fix for the issue: ${issueType}`;
  }
}
