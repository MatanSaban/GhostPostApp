/**
 * POST /api/account/request-addon
 *
 * Server action: non-billing user requests an add-on upgrade from the owner.
 * Sends email + in-app notification to all users with BILLING_MANAGE or isOwner.
 *
 * Body: { resourceKey: string, accountId: string }
 */

import { NextResponse } from 'next/server';
import { getCurrentAccountMember } from '@/lib/auth-permissions';
import prisma from '@/lib/prisma';
import { queueEmail } from '@/lib/mailer';

export async function POST(request) {
  try {
    const { authorized, member, error: authError } = await getCurrentAccountMember();
    if (!authorized || !member?.accountId) {
      return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
    }

    const { resourceKey, accountId } = await request.json();
    const targetAccountId = accountId || member.accountId;

    if (!resourceKey) {
      return NextResponse.json(
        { error: 'Missing resourceKey' },
        { status: 400 }
      );
    }

    // ── Find billing managers / owners ───────────────────────
    const billingMembers = await prisma.accountMember.findMany({
      where: {
        accountId: targetAccountId,
        status: 'ACTIVE',
        OR: [
          { isOwner: true },
          { role: { permissions: { has: 'ACCOUNT_BILLING_MANAGE' } } },
        ],
      },
      include: {
        user: { select: { email: true, firstName: true, lastName: true } },
      },
    });

    if (billingMembers.length === 0) {
      return NextResponse.json(
        { error: 'No billing managers found for this account' },
        { status: 404 }
      );
    }

    // ── Get requesting user name ─────────────────────────────
    const requester = await prisma.user.findUnique({
      where: { id: member.userId },
      select: { firstName: true, lastName: true, email: true },
    });

    const requesterName = [requester?.firstName, requester?.lastName]
      .filter(Boolean)
      .join(' ') || requester?.email || 'A team member';

    // Resource labels for email
    const RESOURCE_LABELS = {
      siteAudits: 'Site Audits',
      maxSites: 'Websites',
      maxMembers: 'Team Members',
      aiCredits: 'AI Credits',
      maxKeywords: 'Keywords',
      maxContent: 'Content Items',
    };

    const resourceLabel = RESOURCE_LABELS[resourceKey] || resourceKey;

    // ── Get account name ─────────────────────────────────────
    const account = await prisma.account.findUnique({
      where: { id: targetAccountId },
      select: { name: true },
    });

    // ── Send emails to all billing managers ──────────────────
    for (const member of billingMembers) {
      if (!member.user?.email) continue;

      const recipientName = member.user.firstName || 'Admin';
      const billingUrl = `${process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?tab=billing`;

      queueEmail({
        to: member.user.email,
        subject: `${requesterName} is requesting more ${resourceLabel}`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto;">
            <h2 style="color: #1a1a1a; font-size: 18px;">Upgrade Request</h2>
            <p style="color: #4b5563; line-height: 1.6;">
              Hi ${recipientName},
            </p>
            <p style="color: #4b5563; line-height: 1.6;">
              <strong>${requesterName}</strong> tried to use a feature on
              <strong>${account?.name || 'your account'}</strong> but the
              <strong>${resourceLabel}</strong> limit has been reached.
            </p>
            <p style="color: #4b5563; line-height: 1.6;">
              You can add more capacity by purchasing an add-on or upgrading your plan.
            </p>
            <a href="${billingUrl}"
               style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #7b2cbf, #9d4edd); color: #fff; text-decoration: none; border-radius: 8px; font-weight: 500; margin-top: 8px;">
              Manage Billing
            </a>
            <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
              Ghost Post • ${account?.name || ''}
            </p>
          </div>
        `,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Your request has been sent to the account admin.',
      notifiedCount: billingMembers.filter(m => m.user?.email).length,
    });
  } catch (error) {
    console.error('[API/account/request-addon] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
