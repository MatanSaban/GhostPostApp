import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember } from '@/lib/auth-permissions';
import { gateImpersonation } from '@/lib/impersonation-context';
import {
  IMPERSONATION_SCOPES,
  TTL_PRESETS,
  DEFAULT_TTL_KEY,
  MAX_REASON_LEN,
  MIN_REASON_LEN,
  generateImpersonationCode,
  hashImpersonationCode,
  codePrefixOf,
  ttlMsFromKey,
  normalizeImpersonationCode,
} from '@/lib/impersonation';

const MAX_ACTIVE_GRANTS_PER_USER = 5;

function clientIp(request) {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return request.headers.get('x-real-ip') || null;
}

/**
 * GET /api/support/impersonation-grants
 * List the caller's grants (active + recently used/expired/revoked).
 *
 * Returns metadata only - never the plaintext code or its hash.
 */
export async function GET() {
  try {
    const auth = await getCurrentAccountMember();
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
    }

    const grants = await prisma.impersonationGrant.findMany({
      where: { userId: auth.member.userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        codePrefix: true,
        scope: true,
        reason: true,
        expiresAt: true,
        maxUses: true,
        usedCount: true,
        status: true,
        revokedAt: true,
        revokedReason: true,
        createdAt: true,
        sessions: {
          orderBy: { startedAt: 'desc' },
          take: 5,
          select: {
            id: true,
            startedAt: true,
            endedAt: true,
            expiresAt: true,
            endReason: true,
            scope: true,
            adminUser: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
      },
    });

    return NextResponse.json({ grants });
  } catch (error) {
    console.error('[API/support/impersonation-grants] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/support/impersonation-grants
 * Body: { scope?: 'READ_ONLY'|'FULL', ttl?: '15m'|'1h'|'4h'|'24h', reason?: string }
 *
 * Creates a fresh grant and returns the plaintext code exactly once.
 * The plaintext is never persisted; we store sha256(code) + a 4-char prefix.
 */
export async function POST(request) {
  try {
    // Hard-block this surface during impersonation (denylist), so an admin
    // who's signed in as a user can't extend their own access by minting a
    // new code on the user's behalf.
    const gate = await gateImpersonation(request);
    if (gate.response) return gate.response;

    const auth = await getCurrentAccountMember();
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
    }

    const member = auth.member;

    // SuperAdmins generating an impersonation code for *themselves* makes no sense
    // (they'd just be granting themselves access to themselves) - and could be
    // abused to mask audit trails. Block it explicitly.
    if (auth.isSuperAdmin) {
      return NextResponse.json(
        { error: 'SuperAdmins cannot generate impersonation codes' },
        { status: 403 },
      );
    }

    // Cap how many ACTIVE grants a single user can hold to limit blast radius
    // if their session is hijacked (attacker can't churn out codes endlessly).
    const activeCount = await prisma.impersonationGrant.count({
      where: { userId: member.userId, status: 'ACTIVE' },
    });
    if (activeCount >= MAX_ACTIVE_GRANTS_PER_USER) {
      return NextResponse.json(
        { error: `You already have ${activeCount} active codes. Revoke one before issuing a new one.` },
        { status: 429 },
      );
    }

    const payload = await request.json().catch(() => ({}));

    const scope = IMPERSONATION_SCOPES.includes(payload.scope) ? payload.scope : 'READ_ONLY';
    const ttlKey = payload.ttl && TTL_PRESETS[payload.ttl] ? payload.ttl : DEFAULT_TTL_KEY;
    const ttlMs = ttlMsFromKey(ttlKey);

    let reason = typeof payload.reason === 'string' ? payload.reason.trim() : '';
    if (reason.length > MAX_REASON_LEN) reason = reason.slice(0, MAX_REASON_LEN);
    if (reason.length > 0 && reason.length < MIN_REASON_LEN) {
      return NextResponse.json(
        { error: `Reason must be at least ${MIN_REASON_LEN} characters when provided` },
        { status: 400 },
      );
    }

    // Tiny chance of a hash collision since codes are random - retry a few times.
    let attempts = 0;
    let created = null;
    let plaintext = null;

    while (attempts < 5 && !created) {
      attempts += 1;
      plaintext = generateImpersonationCode();
      const codeHash = hashImpersonationCode(plaintext);
      const codePrefix = codePrefixOf(plaintext);

      try {
        created = await prisma.impersonationGrant.create({
          data: {
            userId: member.userId,
            accountId: member.accountId,
            codeHash,
            codePrefix,
            scope,
            reason: reason || null,
            expiresAt: new Date(Date.now() + ttlMs),
            maxUses: 1,
            usedCount: 0,
            status: 'ACTIVE',
            createdIp: clientIp(request),
          },
          select: {
            id: true,
            codePrefix: true,
            scope: true,
            reason: true,
            expiresAt: true,
            maxUses: true,
            usedCount: true,
            status: true,
            createdAt: true,
          },
        });
      } catch (err) {
        // Prisma unique-constraint code on codeHash collision - retry with a
        // freshly-rolled code. Anything else: bail.
        if (err?.code !== 'P2002') throw err;
        plaintext = null;
      }
    }

    if (!created || !plaintext) {
      return NextResponse.json(
        { error: 'Failed to allocate an impersonation code. Please try again.' },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        grant: created,
        // Plaintext is returned ONCE. The client should display it and warn
        // the user that it cannot be recovered.
        code: plaintext,
        canonicalCode: normalizeImpersonationCode(plaintext),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('[API/support/impersonation-grants] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
