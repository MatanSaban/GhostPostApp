import { NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember, memberHasPermission } from '@/lib/auth-permissions';
import { hashToken, SCOPES } from '@/lib/mcp/auth';

const VALID_SCOPES = Object.values(SCOPES);
const DEFAULT_SCOPES = [SCOPES.ISSUES_READ, SCOPES.FIX_READ];
const DEFAULT_DAYS = 90;
const MAX_DAYS = 3650;

// Public shape — NEVER include tokenHash. `name` and `label` carry the same
// value (the UI reads `label`, older callers may read `name`).
function toApi(t) {
  return {
    id: t.id,
    name: t.label,
    label: t.label,
    prefix: t.prefix,
    scopes: t.scopes,
    siteId: t.siteId,
    createdAt: t.createdAt,
    expiresAt: t.expiresAt,
    revokedAt: t.revokedAt,
    lastUsedAt: t.lastUsedAt,
  };
}

// GET - List MCP tokens for the caller's account (hash is never returned)
export async function GET() {
  try {
    const result = await getCurrentAccountMember();
    if (!result.authorized) {
      return NextResponse.json({ error: result.error || 'Unauthorized' }, { status: 401 });
    }
    const member = result.member;
    // SuperAdmin has no account context — nothing to scope the list to.
    if (!member.accountId) {
      return NextResponse.json({ tokens: [] });
    }
    if (!member.isOwner && !memberHasPermission(member, 'SETTINGS_INTEGRATIONS', 'VIEW')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const tokens = await prisma.mcpToken.findMany({
      where: { accountId: member.accountId },
      select: {
        id: true,
        label: true,
        prefix: true,
        scopes: true,
        siteId: true,
        createdAt: true,
        expiresAt: true,
        revokedAt: true,
        lastUsedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ tokens: tokens.map(toApi) });
  } catch (error) {
    console.error('Failed to list MCP tokens:', error);
    return NextResponse.json({ error: 'Failed to list MCP tokens' }, { status: 500 });
  }
}

// POST - Create an MCP token. The plaintext token is returned exactly once
// in this response; only the sha256 hash is stored.
export async function POST(request) {
  try {
    const result = await getCurrentAccountMember();
    if (!result.authorized) {
      return NextResponse.json({ error: result.error || 'Unauthorized' }, { status: 401 });
    }
    const member = result.member;
    if (!member.accountId) {
      return NextResponse.json({ error: 'No account context' }, { status: 400 });
    }
    if (!member.isOwner && !memberHasPermission(member, 'SETTINGS_INTEGRATIONS', 'EDIT')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { name: rawName, label: rawLabel, siteId, scopes: requestedScopes, days } = body || {};
    const name = rawName ?? rawLabel; // UI sends `label`; accept both

    const scopes = Array.isArray(requestedScopes) && requestedScopes.length > 0
      ? requestedScopes.map((s) => String(s).trim())
      : [...DEFAULT_SCOPES];
    const invalid = scopes.filter((s) => !VALID_SCOPES.includes(s));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `Unknown scope(s): ${invalid.join(', ')}` },
        { status: 400 }
      );
    }

    const expiryDays = days === undefined || days === null ? DEFAULT_DAYS : Number(days);
    if (!Number.isInteger(expiryDays) || expiryDays < 1 || expiryDays > MAX_DAYS) {
      return NextResponse.json(
        { error: `days must be an integer between 1 and ${MAX_DAYS}` },
        { status: 400 }
      );
    }

    // Site-bound tokens: the site must belong to the caller's account.
    if (siteId) {
      const site = await prisma.site.findFirst({
        where: { id: siteId, accountId: member.accountId },
        select: { id: true },
      });
      if (!site) {
        return NextResponse.json({ error: 'Site not found in this account' }, { status: 404 });
      }
    }

    const token = `gpmcp_${crypto.randomBytes(24).toString('hex')}`;

    const rec = await prisma.mcpToken.create({
      data: {
        accountId: member.accountId,
        siteId: siteId || null,
        label: name ? String(name).trim() : null,
        prefix: `${token.slice(0, 10)}…`,
        tokenHash: hashToken(token),
        scopes,
        createdBy: member.userId,
        expiresAt: new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000),
      },
    });

    return NextResponse.json({ token, mcpToken: toApi(rec) }, { status: 201 });
  } catch (error) {
    console.error('Failed to create MCP token:', error);
    return NextResponse.json({ error: 'Failed to create MCP token' }, { status: 500 });
  }
}
