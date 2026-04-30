import { NextResponse, after } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { getNextFirstOfMonth } from '@/lib/proration';
import { getDraftAccountForUser } from '@/lib/draft-account';
import { migrateDraftEntityScanToSite } from '@/lib/entity-scan-migration';
import { notifyAdmins, queueEmail, emailTemplates } from '@/lib/mailer';

const SESSION_COOKIE = 'user_session';
const REG_DONE_COOKIE = 'reg_done';

/**
 * POST /api/auth/registration/finalize
 *
 * Activates the draft user + account created at the start of registration.
 * Unlike the old flow, we do NOT create a new User/Account here - both already
 * exist. We just flip the draft flag, clear draft scratch fields, create the
 * Subscription + CouponRedemption + Site, and mark the user as COMPLETED.
 */
export async function POST() {
  try {
    const cookieStore = await cookies();
    const sessionUserId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!sessionUserId) {
      return NextResponse.json(
        { error: 'No registration in progress' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: sessionUserId },
    });

    if (!user) {
      cookieStore.delete(SESSION_COOKIE);
      return NextResponse.json(
        { error: 'Registration not found. Please start over.' },
        { status: 404 }
      );
    }

    if (user.registrationStep === 'COMPLETED') {
      return NextResponse.json(
        { error: 'Registration already completed' },
        { status: 409 }
      );
    }

    if (!user.emailVerified && !user.phoneVerified) {
      return NextResponse.json(
        { error: 'Email or phone verification required' },
        { status: 400 }
      );
    }

    const draftAccount = await getDraftAccountForUser(user.id);

    if (!draftAccount) {
      return NextResponse.json(
        { error: 'No draft account found. Please start over.' },
        { status: 404 }
      );
    }

    if (!draftAccount.name || !draftAccount.slug || draftAccount.slug.startsWith('draft-')) {
      return NextResponse.json(
        { error: 'Account setup required' },
        { status: 400 }
      );
    }

    if (!draftAccount.draftSelectedPlanId) {
      return NextResponse.json(
        { error: 'Plan selection required' },
        { status: 400 }
      );
    }

    const interviewData = draftAccount.draftInterviewData || {};
    const couponCode = draftAccount.draftCouponCode || null;

    const plan = await prisma.plan.findUnique({
      where: { id: draftAccount.draftSelectedPlanId },
    });

    if (!plan) {
      return NextResponse.json(
        { error: 'Selected plan not found' },
        { status: 404 }
      );
    }

    // Trial eligibility: paid plan offers a trial AND the account never used one.
    // Skips the paymentConfirmed gate because no card was collected up front
    // (the wizard hits /payment-skip-for-trial which sets paymentConfirmed=true
    // anyway, but we preserve the branch for defense in depth).
    const willStartTrial = plan.trialDays > 0 && !draftAccount.hasUsedTrial;

    if (!willStartTrial && !interviewData.paymentConfirmed) {
      return NextResponse.json(
        { error: 'Payment confirmation required' },
        { status: 400 }
      );
    }

    // Compute trial timestamps once (outside the transaction) so we can
    // also reuse them when sending the welcome email below.
    const finalizeNow = new Date();
    const trialEndAt = willStartTrial
      ? new Date(finalizeNow.getTime() + plan.trialDays * 86400000)
      : null;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Activate the account: clear draft flag, clear draft fields,
      //    fill in billing/general email. When starting a trial, also
      //    flip hasUsedTrial=true so the same account can never claim
      //    another free trial.
      const account = await tx.account.update({
        where: { id: draftAccount.id },
        data: {
          isDraft: false,
          draftInterviewData: null,
          draftSelectedPlanId: null,
          draftCouponCode: null,
          billingEmail: user.email,
          generalEmail: user.email,
          ...(willStartTrial && { hasUsedTrial: true }),
        },
      });

      // 2. Mark the user as completed.
      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: {
          registrationStep: 'COMPLETED',
          isActive: true,
        },
      });

      // 3. Create the subscription. Trial subscriptions get
      //    status=TRIALING, currentPeriodEnd=trialEndAt; the
      //    trial-lifecycle cron flips them to ACTIVE on the Free plan
      //    (or whichever plan is flagged isFreeFallback) at expiry.
      const subscription = await tx.subscription.create({
        data: {
          accountId: account.id,
          planId: plan.id,
          status: willStartTrial ? 'TRIALING' : 'ACTIVE',
          billingInterval: 'MONTHLY',
          currentPeriodStart: finalizeNow,
          currentPeriodEnd: willStartTrial ? trialEndAt : getNextFirstOfMonth(finalizeNow),
          ...(willStartTrial && {
            trialStartedAt: finalizeNow,
            trialEndAt,
          }),
        },
      });

      // 4. Redeem coupon if present.
      if (couponCode) {
        const coupon = await tx.coupon.findUnique({
          where: { code: couponCode },
          include: { _count: { select: { redemptions: true } } },
        });

        if (coupon && coupon.isActive) {
          const now = new Date();
          const isValid = (!coupon.validFrom || now >= coupon.validFrom)
            && (!coupon.validUntil || now <= coupon.validUntil)
            && (!coupon.maxRedemptions || coupon._count.redemptions < coupon.maxRedemptions)
            && (!coupon.applicablePlanIds?.length || coupon.applicablePlanIds.includes(plan.id));

          if (isValid) {
            // When a recurringPriceSchedule is present (B2), the schedule
            // itself governs each cycle's price for the life of the
            // subscription, so expiresAt stays null. durationMonths only
            // applies to old-style schedule-less coupons.
            const hasRecurringSchedule = Array.isArray(coupon.recurringPriceSchedule)
              && coupon.recurringPriceSchedule.length > 0;
            const expiresAt = (!hasRecurringSchedule && coupon.durationMonths)
              ? new Date(Date.now() + coupon.durationMonths * 30 * 24 * 60 * 60 * 1000)
              : null;

            await tx.couponRedemption.create({
              data: {
                couponId: coupon.id,
                accountId: account.id,
                subscriptionId: subscription.id,
                discountType: coupon.discountType,
                discountValue: coupon.discountValue,
                // Snapshot the schedule + price-floor flag at redemption time
                // so the recurring billing engine keeps charging the price
                // the user agreed to even if the admin edits the coupon
                // later.
                recurringPriceSchedule: Array.isArray(coupon.recurringPriceSchedule) ? coupon.recurringPriceSchedule : [],
                floorOrderToZero: !!coupon.floorOrderToZero,
                limitationOverrides: coupon.limitationOverrides || [],
                extraFeatures: coupon.extraFeatures || [],
                durationMonths: coupon.durationMonths,
                expiresAt,
                status: 'ACTIVE',
              },
            });

            console.log('[Finalize] Applied coupon:', { code: coupon.code, accountId: account.id });
          }
        }
      }

      // 5. Allocate plan Ai-GCoins.
      const { getLimitFromPlan } = await import('@/lib/account-utils');
      const planAiCredits = getLimitFromPlan(plan.limitations, 'aiCredits', 0) || 0;

      if (planAiCredits > 0) {
        await tx.account.update({
          where: { id: account.id },
          data: { aiCreditsBalance: planAiCredits },
        });

        await tx.aiCreditsLog.create({
          data: {
            accountId: account.id,
            type: 'CREDIT',
            amount: planAiCredits,
            balance: planAiCredits,
            source: 'plan_activation',
            description: `Initial Ai-GCoins from ${plan.name} plan`,
          },
        });
      }

      // 6. Create site from interview data.
      let site = null;
      const websiteUrl = interviewData.websiteUrl;

      if (websiteUrl) {
        const { generateSiteKey, generateSiteSecret, DEFAULT_SITE_PERMISSIONS } = await import('@/lib/site-keys');

        let normalizedUrl = websiteUrl.trim();
        if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
          normalizedUrl = 'https://' + normalizedUrl;
        }
        normalizedUrl = normalizedUrl.replace(/\/+$/, '');

        const normalizedForCompare = normalizedUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '').toLowerCase();
        const existingSites = await tx.site.findMany({
          where: { accountId: account.id, isActive: true },
          select: { url: true },
        });
        const isDuplicate = existingSites.some(s => {
          const existing = (s.url || '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '').toLowerCase();
          return existing === normalizedForCompare;
        });

        if (!isDuplicate) {
          let siteName = account.name;
          try {
            const urlObj = new URL(normalizedUrl);
            siteName = urlObj.hostname.replace('www.', '');
          } catch {
            // Keep account name as fallback
          }

          const platform = interviewData.analysis?.platform?.name?.toLowerCase() || null;
          const siteKey = generateSiteKey();
          const siteSecret = generateSiteSecret();

          site = await tx.site.create({
            data: {
              accountId: account.id,
              name: siteName,
              url: normalizedUrl,
              platform,
              isActive: true,
              connectionStatus: 'PENDING',
              siteKey,
              siteSecret,
              sitePermissions: DEFAULT_SITE_PERMISSIONS,
            },
          });

          await tx.accountMember.updateMany({
            where: {
              accountId: account.id,
              userId: user.id,
            },
            data: { lastSelectedSiteId: site.id },
          });

          console.log('[Finalize] Created site:', { siteId: site.id, url: normalizedUrl });
        } else {
          console.log('[Finalize] Skipped duplicate site:', { url: normalizedUrl, accountId: account.id });
        }
      }

      return { user: updatedUser, account, site };
    });

    // Migrate the entity scan that was collected during onboarding (if any)
    // onto the freshly-created Site. Scheduled via Next.js `after()` so it
    // runs after the response is sent (the user lands on the dashboard
    // without waiting) but is still guaranteed to complete by the runtime
    // - unlike a fire-and-forget Promise, which can be cut off when the
    // serverless instance suspends.
    if (result.site && interviewData.entityScan) {
      after(async () => {
        try {
          await migrateDraftEntityScanToSite({
            entityScan: interviewData.entityScan,
            site: result.site,
            account: result.account,
            locale: interviewData.selectedLanguage || 'en',
          });
        } catch (e) {
          console.error('[Finalize] Entity scan migration failed:', e);
        }
      });
    }

    try {
      notifyAdmins(emailTemplates.adminNewUser({
        user: {
          id: result.user.id,
          email: result.user.email,
          firstName: result.user.firstName,
          lastName: result.user.lastName,
          phoneNumber: result.user.phoneNumber,
        },
        account: { id: result.account.id, name: result.account.name },
        plan: { name: plan.name },
        site: result.site ? { url: result.site.url } : null,
        couponCode,
      }));
    } catch (e) {
      console.error('[Finalize] admin notification failed:', e);
    }

    // Send the user-facing welcome email (paid OR trial variant). Localized
    // to selectedLanguage, falling back to the account's defaultLanguage,
    // then EN. Fire-and-forget — we do not block the response on SMTP.
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '';
      const lang = result.user.selectedLanguage || result.account.defaultLanguage || 'EN';
      const userName = result.user.firstName || result.user.email;
      queueEmail({
        to: result.user.email,
        ...emailTemplates.welcome({
          userName,
          planName: plan.name,
          trialEndAt,
          addPaymentUrl: `${baseUrl}/dashboard/settings?tab=payment-methods`,
          dashboardUrl: `${baseUrl}/dashboard`,
          lang,
        }),
      });
    } catch (e) {
      console.error('[Finalize] welcome email failed:', e);
    }

    // Mark the session as a completed (non-draft) user so middleware allows it
    // everywhere.
    cookieStore.set(REG_DONE_COOKIE, '1', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });

    return NextResponse.json({
      success: true,
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
      },
      account: {
        id: result.account.id,
        name: result.account.name,
        slug: result.account.slug,
      },
      site: result.site ? {
        id: result.site.id,
        name: result.site.name,
        url: result.site.url,
      } : null,
    });
  } catch (error) {
    console.error('Finalize registration error:', error);
    return NextResponse.json(
      { error: 'Failed to complete registration' },
      { status: 500 }
    );
  }
}
