import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { SESSION_TTL_MS } from '@/lib/impersonation';

export const SESSION_COOKIE = 'user_session';
export const IMPERSONATION_COOKIE = 'impersonation_session';

/**
 * Routes that admins must NEVER be allowed to perform while impersonating, even
 * with FULL scope. These represent privilege-escalation surfaces — anything
 * that would let the impersonator extend their access, lock the user out, or
 * cover their tracks.
 *
 * Patterns are tested with `path.startsWith(prefix)`; each entry can opt into
 * matching specific HTTP methods. `methods: '*'` blocks everything.
 *
 * NOTE: This denylist is consulted by `enforceImpersonationScope()`. Routes
 * call that helper themselves (or we add it to a few obvious ones in Slice F);
 * a global middleware-based check is intentionally out-of-scope here so we can
 * keep the resolver focused and side-effect-free.
 */
export const FULL_SCOPE_DENYLIST = [
  // The user's own impersonation surface — admin can't issue or revoke their
  // own access to extend a session.
  { prefix: '/api/support/impersonation-grants', methods: '*' },

  // Auth-sensitive surfaces — password, email, 2FA, account deletion.
  { prefix: '/api/auth/account/set-password', methods: '*' },
  { prefix: '/api/auth/account/create', methods: '*' },
  { prefix: '/api/account/delete', methods: '*' },
  { prefix: '/api/account/transfer', methods: '*' },

  // Logout would kill the user's real session as a side-effect; the admin
  // should end their impersonation explicitly via /api/admin/impersonation/end.
  { prefix: '/api/auth/logout', methods: '*' },
];

/**
 * For READ_ONLY scope: ALL state-changing methods are blocked, with the sole
 * exception of `/api/admin/impersonation/end` so the admin can terminate
 * their own session.
 */
const READ_ONLY_ALLOWED_MUTATING_PREFIXES = ['/api/admin/impersonation/end'];

/**
 * Read the active impersonation session, if any, for the current request.
 *
 * Returns `null` when:
 *   - no impersonation cookie is set
 *   - cookie value doesn't match a real session row
 *   - session is ended, expired, or its grant is no longer ACTIVE/USED
 *   - the real session cookie doesn't match the recorded adminUserId
 *     (defense against a stolen impersonation cookie being replayed by a
 *     non-admin or by a different admin)
 *
 * The returned object is the minimal context callers need to enforce scope
 * and resolve the *target* user/account.
 */
export async function getActiveImpersonation() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(IMPERSONATION_COOKIE)?.value;
    const realUserId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!token || !realUserId) return null;

    const session = await prisma.impersonationSession.findUnique({
      where: { sessionToken: token },
      include: {
        grant: { select: { id: true, status: true, expiresAt: true } },
      },
    });

    if (!session) return null;

    // Stolen-cookie check: only the original admin can use their impersonation
    // cookie. If the real session belongs to a different user, ignore it.
    if (session.adminUserId !== realUserId) return null;

    if (session.endedAt) return null;
    const now = Date.now();
    if (new Date(session.expiresAt).getTime() <= now) return null;

    // Even if the session itself hasn't ended, a revoked or expired grant
    // should immediately invalidate it. Belt-and-suspenders with the cron.
    const grant = session.grant;
    if (!grant) return null;
    if (grant.status === 'REVOKED' || grant.status === 'EXPIRED') return null;
    if (new Date(grant.expiresAt).getTime() <= now) return null;

    return {
      sessionId: session.id,
      grantId: session.grantId,
      adminUserId: session.adminUserId,
      targetUserId: session.targetUserId,
      targetAccountId: session.targetAccountId,
      scope: session.scope,
      startedAt: session.startedAt,
      expiresAt: session.expiresAt,
    };
  } catch (error) {
    console.error('[impersonation-context] getActiveImpersonation error:', error);
    return null;
  }
}

/**
 * Touch the session's expiry (sliding window) up to a hard cap. Call this on
 * each authorized request so an actively-used session doesn't time out
 * mid-task, but an idle session does.
 */
export async function bumpImpersonationActivity(sessionId) {
  try {
    const next = new Date(Date.now() + SESSION_TTL_MS);
    await prisma.impersonationSession.update({
      where: { id: sessionId },
      data: { expiresAt: next },
      select: { id: true },
    });
  } catch (err) {
    // Don't fail the request just because we couldn't extend the timer.
    console.warn('[impersonation-context] bump failed:', err?.message);
  }
}

/**
 * End an impersonation session and clear its cookie.
 * Idempotent: safe to call repeatedly.
 */
export async function endImpersonationSession({ sessionId, reason = 'admin_ended' }) {
  try {
    if (sessionId) {
      await prisma.impersonationSession.updateMany({
        where: { id: sessionId, endedAt: null },
        data: { endedAt: new Date(), endReason: reason },
      });
    }
  } catch (err) {
    console.error('[impersonation-context] endImpersonationSession error:', err);
  }
}

/**
 * Enforce scope rules for an in-flight request. Returns:
 *   { allowed: true }                                  — request may proceed
 *   { allowed: false, reason: string, status: number } — caller should reject
 *
 * @param {object} ctx           Result of `getActiveImpersonation()`
 * @param {string} method        HTTP method (uppercase)
 * @param {string} path          URL path (e.g., '/api/sites/123')
 */
export function enforceImpersonationScope(ctx, method, path) {
  if (!ctx) return { allowed: true };
  const upper = (method || 'GET').toUpperCase();

  // FULL-scope denylist always applies, regardless of method/scope.
  for (const entry of FULL_SCOPE_DENYLIST) {
    if (path.startsWith(entry.prefix)) {
      const blocks =
        entry.methods === '*' ||
        (Array.isArray(entry.methods) && entry.methods.includes(upper));
      if (blocks) {
        return {
          allowed: false,
          status: 403,
          reason: 'This action is not available while support is signed in as you.',
        };
      }
    }
  }

  if (ctx.scope === 'READ_ONLY') {
    if (upper === 'GET' || upper === 'HEAD' || upper === 'OPTIONS') {
      return { allowed: true };
    }
    const allowed = READ_ONLY_ALLOWED_MUTATING_PREFIXES.some((p) => path.startsWith(p));
    if (!allowed) {
      return {
        allowed: false,
        status: 403,
        reason: 'Read-only impersonation cannot make changes.',
      };
    }
  }

  return { allowed: true };
}

/**
 * Append a row to the per-session audit log. Best-effort — never throws.
 * Mutations are recorded automatically by `gateImpersonation()`; reads are
 * recorded only when the caller asks for it (would otherwise be very noisy).
 */
export async function recordImpersonationAction({
  sessionId,
  method,
  path,
  statusCode = null,
  bodyPreview = null,
}) {
  if (!sessionId || !method || !path) return;
  try {
    await prisma.impersonationAction.create({
      data: {
        sessionId,
        method: String(method).toUpperCase().slice(0, 16),
        path: String(path).slice(0, 512),
        statusCode: statusCode ?? null,
        bodyPreview: bodyPreview ? String(bodyPreview).slice(0, 1024) : null,
      },
      select: { id: true },
    });
  } catch (err) {
    console.warn('[impersonation-context] action log failed:', err?.message);
  }
}

/**
 * Convenience wrapper for route handlers: resolves the active impersonation
 * (if any) and immediately rejects the request when the request would violate
 * scope or hit the denylist. Returns:
 *
 *   { response: NextResponse }  — caller should `return response` immediately
 *   { ctx }                     — request may proceed; `ctx` is the active
 *                                 impersonation (or null if none)
 *
 * Side effects when `ctx` is non-null:
 *   - mutating methods (POST/PUT/PATCH/DELETE) are recorded to the audit log
 *     before the handler runs, so admins can't make a request "vanish" from
 *     history by failing it mid-flight
 *   - the session's sliding expiry is bumped
 *
 * Routes adopt this incrementally — start with high-risk surfaces (impersonation
 * grant management, billing, account deletion) and expand from there.
 */
export async function gateImpersonation(request) {
  const ctx = await getActiveImpersonation();
  if (!ctx) return { ctx: null };

  const url = new URL(request.url);
  const method = (request.method || 'GET').toUpperCase();
  const decision = enforceImpersonationScope(ctx, method, url.pathname);

  if (!decision.allowed) {
    // Record the *attempt* — denied actions are part of the audit trail.
    recordImpersonationAction({
      sessionId: ctx.sessionId,
      method,
      path: url.pathname,
      statusCode: decision.status,
      bodyPreview: 'BLOCKED: ' + decision.reason,
    });
    return {
      response: NextResponse.json(
        { error: decision.reason, code: 'IMPERSONATION_BLOCKED' },
        { status: decision.status },
      ),
    };
  }

  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    recordImpersonationAction({
      sessionId: ctx.sessionId,
      method,
      path: url.pathname,
    });
  }
  bumpImpersonationActivity(ctx.sessionId);
  return { ctx };
}
