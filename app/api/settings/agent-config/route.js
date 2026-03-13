import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

const DEFAULT_AGENT_CONFIG = {
  enabled: true,
  modules: {
    content: true,
    traffic: true,
    keywords: true,
    competitors: true,
    technical: true,
  },
  notifyOnNewInsights: true,
};

async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) return null;

    return await prisma.user.findUnique({
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

// GET - Get agent config for a site
export async function GET(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    if (!siteId) {
      return NextResponse.json({ error: 'Site ID is required' }, { status: 400 });
    }

    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, accountId: true, toolSettings: true },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Verify user has access to this site's account
    const hasAccess = user.accountMemberships.some(m => m.accountId === site.accountId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const toolSettings = site.toolSettings || {};
    const agentConfig = { ...DEFAULT_AGENT_CONFIG, ...toolSettings.agentConfig };

    return NextResponse.json({ agentConfig });
  } catch (error) {
    console.error('[agent-config GET]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Update agent config for a site
export async function PUT(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { siteId, agentConfig } = body;

    if (!siteId) {
      return NextResponse.json({ error: 'Site ID is required' }, { status: 400 });
    }

    if (!agentConfig || typeof agentConfig !== 'object') {
      return NextResponse.json({ error: 'Invalid agent config' }, { status: 400 });
    }

    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, accountId: true, toolSettings: true },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const hasAccess = user.accountMemberships.some(m => m.accountId === site.accountId);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Sanitize: only allow known fields
    const sanitized = {
      enabled: Boolean(agentConfig.enabled),
      modules: {
        content: Boolean(agentConfig.modules?.content),
        traffic: Boolean(agentConfig.modules?.traffic),
        keywords: Boolean(agentConfig.modules?.keywords),
        competitors: Boolean(agentConfig.modules?.competitors),
        technical: Boolean(agentConfig.modules?.technical),
      },
      notifyOnNewInsights: Boolean(agentConfig.notifyOnNewInsights),
    };

    const existingToolSettings = site.toolSettings || {};
    const updatedToolSettings = {
      ...existingToolSettings,
      agentConfig: sanitized,
    };

    await prisma.site.update({
      where: { id: siteId },
      data: { toolSettings: updatedToolSettings },
    });

    return NextResponse.json({ agentConfig: sanitized });
  } catch (error) {
    console.error('[agent-config PUT]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
