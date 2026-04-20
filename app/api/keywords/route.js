import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { analyzeKeywordIntentsBatch } from '@/lib/ai/keyword-intent.js';
import { enforceCredits, enforceResourceLimit } from '@/lib/account-limits';
import { AI_OPERATIONS } from '@/lib/ai/credits';
import { getCachedKeywords } from '@/lib/cache/keywords.js';
import { invalidateKeywords } from '@/lib/cache/invalidate.js';

const SESSION_COOKIE = 'user_session';

async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!userId) return null;
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isSuperAdmin: true, email: true },
  });
}

// GET - Fetch keywords for a site
export async function GET(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');

    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
    }

    // Verify user has access to this site
    const siteWhere = user.isSuperAdmin
        ? { id: siteId }
        : { id: siteId, account: { members: { some: { userId: user.id } } } };
      const site = await prisma.site.findFirst({
        where: siteWhere,
      select: { id: true, accountId: true },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found or no access' }, { status: 404 });
    }

    const keywords = await getCachedKeywords(siteId, site.accountId);

    // Find related SiteEntity posts by matching keyword.url
    const keywordsWithUrls = keywords.filter(k => k.url);
    const urlList = keywordsWithUrls.map(k => k.url);
    
    let siteEntitiesMap = new Map();
    if (urlList.length > 0) {
      // Get posts entity type — skip if disabled so keyword data doesn't link
      // to entities the user has toggled off.
      const postsType = await prisma.siteEntityType.findFirst({
        where: { siteId, slug: 'posts', isEnabled: true },
        select: { id: true },
      });

      if (postsType) {
        const siteEntities = await prisma.siteEntity.findMany({
          where: {
            siteId,
            entityTypeId: postsType.id,
            url: { in: urlList },
          },
          select: {
            id: true,
            title: true,
            url: true,
            slug: true,
          },
        });
        
        for (const entity of siteEntities) {
          siteEntitiesMap.set(entity.url, entity);
        }
      }
    }

    // Enrich keywords with related post info
    const enrichedKeywords = keywords.map(kw => {
      const relatedEntity = kw.url ? siteEntitiesMap.get(kw.url) : null;
      
      return {
        ...kw,
        relatedPost: relatedEntity ? {
          id: relatedEntity.id,
          title: relatedEntity.title,
          url: relatedEntity.url,
        } : null,
      };
    });

    return NextResponse.json({ keywords: enrichedKeywords });
  } catch (error) {
    console.error('[Keywords API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Add keyword(s) manually
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { siteId, keywords: keywordsInput } = await request.json();

    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400 });
    }

    // Verify user has access to this site
    const siteWhere = user.isSuperAdmin
        ? { id: siteId }
        : { id: siteId, account: { members: { some: { userId: user.id } } } };
      const site = await prisma.site.findFirst({
        where: siteWhere,
      select: { id: true, accountId: true },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found or no access' }, { status: 404 });
    }

    // Enforce keyword limit from plan
    const limitCheck = await enforceResourceLimit(site.accountId, 'maxKeywords');
    if (!limitCheck.allowed) {
      return NextResponse.json(limitCheck, { status: 403 });
    }

    // Normalize input: accept string or array
    const keywordsList = Array.isArray(keywordsInput)
      ? keywordsInput.map(k => k.trim()).filter(Boolean)
      : [keywordsInput?.trim()].filter(Boolean);

    if (keywordsList.length === 0) {
      return NextResponse.json({ error: 'At least one keyword is required' }, { status: 400 });
    }

    // Deduplicate against existing keywords
    const existing = await prisma.keyword.findMany({
      where: { siteId },
      select: { keyword: true },
    });
    const existingSet = new Set(existing.map(k => k.keyword.toLowerCase().trim()));

    const uniqueKeywords = keywordsList.filter(kw => !existingSet.has(kw.toLowerCase()));

    if (uniqueKeywords.length === 0) {
      return NextResponse.json({ error: 'All keywords already exist', duplicates: true }, { status: 409 });
    }

    // Enforce AI credit limit before analysis
    const creditCost = uniqueKeywords.length * AI_OPERATIONS.KEYWORD_INTENT_ANALYSIS.credits;
    const creditCheck = await enforceCredits(site.accountId, creditCost);
    if (!creditCheck.allowed) {
      return NextResponse.json(
        { error: creditCheck.error, code: 'INSUFFICIENT_CREDITS' },
        { status: 402 }
      );
    }

    // Analyze intents using AI (trackAIUsage fires inside generateStructuredResponse)
    let intentResults = new Map();
    try {
      intentResults = await analyzeKeywordIntentsBatch(
        uniqueKeywords,
        {},
        { accountId: site.accountId, userId: user.id, siteId }
      );
    } catch (aiError) {
      console.warn('[Keywords API] AI intent analysis failed, continuing without intents:', aiError.message);
    }

    const newKeywords = uniqueKeywords.map(kw => {
      const aiResult = intentResults.get(kw);
      return {
        siteId,
        keyword: kw,
        status: 'TRACKING',
        tags: ['manual'],
        intents: aiResult?.intents || [],
      };
    });

    await prisma.keyword.createMany({ data: newKeywords });

    // Fetch freshly created keywords to return
    const created = await prisma.keyword.findMany({
      where: {
        siteId,
        keyword: { in: newKeywords.map(k => k.keyword) },
      },
      orderBy: { createdAt: 'desc' },
    });

    invalidateKeywords(siteId);

    return NextResponse.json({ keywords: created, count: created.length });
  } catch (error) {
    console.error('[Keywords API] POST Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH - Update keyword (status, intent, etc.)
export async function PATCH(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { keywordId, status, intents, analyzeIntent } = await request.json();

    if (!keywordId) {
      return NextResponse.json({ error: 'keywordId is required' }, { status: 400 });
    }

    // Verify keyword exists and user has access
    const keyword = await prisma.keyword.findFirst({
        where: user.isSuperAdmin ? { id: keywordId } : { id: keywordId, site: { account: { members: { some: { userId: user.id } } } } },
      select: { id: true, siteId: true, keyword: true, site: { select: { accountId: true } } },
    });

    if (!keyword) {
      return NextResponse.json({ error: 'Keyword not found or no access' }, { status: 404 });
    }

    // Build update data
    const updateData = {};
    
    if (status !== undefined) {
      const validStatuses = ['TRACKING', 'TARGETING', 'RANKING', 'ARCHIVED'];
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      updateData.status = status;
    }

    // AI Intent Analysis
    if (analyzeIntent === true) {
      const creditCost = AI_OPERATIONS.KEYWORD_INTENT_ANALYSIS.credits;
      const creditCheck = await enforceCredits(keyword.site.accountId, creditCost);
      if (!creditCheck.allowed) {
        return NextResponse.json(
          { error: creditCheck.error, code: 'INSUFFICIENT_CREDITS' },
          { status: 402 }
        );
      }

      try {
        const intentResults = await analyzeKeywordIntentsBatch(
          [keyword.keyword],
          {},
          { accountId: keyword.site.accountId, userId: user.id, siteId: keyword.siteId }
        );
        const result = intentResults.get(keyword.keyword);
        if (result?.intents?.length > 0) {
          updateData.intents = result.intents;
        }
      } catch (aiError) {
        console.error('[Keywords API] AI analysis failed:', aiError.message);
        return NextResponse.json({ error: 'AI analysis failed' }, { status: 500 });
      }
    } else if (intents !== undefined) {
      const validIntents = ['INFORMATIONAL', 'NAVIGATIONAL', 'TRANSACTIONAL', 'COMMERCIAL'];
      // Validate intents array
      if (!Array.isArray(intents)) {
        return NextResponse.json({ error: 'intents must be an array' }, { status: 400 });
      }
      // Filter to only valid intents
      const validatedIntents = intents.filter(i => validIntents.includes(i));
      updateData.intents = validatedIntents;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const updated = await prisma.keyword.update({
      where: { id: keywordId },
      data: updateData,
    });

    invalidateKeywords(keyword.siteId);

    const response = { keyword: updated };
    if (analyzeIntent === true) {
      response.creditsUsed = AI_OPERATIONS.KEYWORD_INTENT_ANALYSIS.credits;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('[Keywords API] PATCH Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Remove a keyword
export async function DELETE(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const keywordId = searchParams.get('keywordId');

    if (!keywordId) {
      return NextResponse.json({ error: 'keywordId is required' }, { status: 400 });
    }

    // Verify keyword exists and user has access
    const keyword = await prisma.keyword.findFirst({
        where: user.isSuperAdmin ? { id: keywordId } : { id: keywordId, site: { account: { members: { some: { userId: user.id } } } } },
      select: { id: true, siteId: true },
    });

    if (!keyword) {
      return NextResponse.json({ error: 'Keyword not found or no access' }, { status: 404 });
    }

    await prisma.keyword.delete({
      where: { id: keywordId },
    });

    invalidateKeywords(keyword.siteId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Keywords API] DELETE Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
