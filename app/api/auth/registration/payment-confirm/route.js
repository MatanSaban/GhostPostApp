import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import {
  getLowProfileResult,
  chargeWithToken,
  buildDocument,
  getBlockedCardReason,
  externalUniqTranIdFromLpId,
} from '@/lib/cardcom';
import { getDraftAccountForUser } from '@/lib/draft-account';
import { notifyAdmins, emailTemplates } from '@/lib/mailer';

const SESSION_COOKIE = 'user_session';

const LABELS = {
  he: { plan: 'תוכנית', monthly: 'מנוי חודשי' },
  en: { plan: 'Plan', monthly: 'Monthly Subscription' },
};

const localizedPlan = (plan, lang) => {
  const langCode = lang === 'en' ? 'EN' : 'HE';
  const translation = plan.translations?.find(t => t.language === langCode);
  const planName = translation?.name || plan.name;
  const labels = LABELS[lang === 'en' ? 'en' : 'he'];
  const productName = lang === 'en'
    ? `${planName} ${labels.plan}`
    : `${labels.plan} ${planName}`;
  return {
    productName,
    productDescription: `${productName} - ${labels.monthly}`,
  };
};

/**
 * POST /api/auth/registration/payment-confirm
 *
 * Two-step charge completion. The frontend has already created the LowProfile
 * with Operation=CreateTokenOnly + JValidateType=2 (J2). At this point the
 * card has been validated against the issuer and CardCom has issued a token,
 * but no money has moved yet. Here we:
 *
 *   1. Pull the J2 result via GetLpResult (server-to-server, can't trust the
 *      iframe postMessage).
 *   2. Inspect TranzactionInfo.PaymentType / CardInfo and refuse debit/gift
 *      cards (no pre-flight filter exists in the LP API for this).
 *   3. Run Transactions/Transaction (DoTransaction) with the token, attaching
 *      the localized TaxInvoiceAndReceipt document. ExternalUniqTranId is
 *      derived deterministically from the LP id so a duplicate confirm POST
 *      gets CardCom's idempotent "original response" instead of a re-charge.
 *   4. Upsert a PaymentMethod row so future addon / recurring charges can
 *      reuse the token without prompting for card data again.
 *   5. Mark draftInterviewData.paymentConfirmed=true so /finalize will accept.
 *
 * Body:
 *  - lowProfileId: string (required)
 *  - language: 'he' | 'en' (default 'he')
 */
export async function POST(request) {
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
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
      },
    });

    if (!user) {
      cookieStore.delete(SESSION_COOKIE);
      return NextResponse.json(
        { error: 'Registration not found. Please start over.' },
        { status: 404 }
      );
    }

    const draftAccount = await getDraftAccountForUser(user.id);
    if (!draftAccount) {
      return NextResponse.json(
        { error: 'No draft account found. Please start over.' },
        { status: 404 }
      );
    }

    if (!draftAccount.draftSelectedPlanId) {
      return NextResponse.json(
        { error: 'No plan selected' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { lowProfileId, language = 'he' } = body;

    if (!lowProfileId) {
      return NextResponse.json(
        { error: 'LowProfile ID is required' },
        { status: 400 }
      );
    }

    // Step 1: pull the authoritative J2 result.
    let lpResult;
    try {
      lpResult = await getLowProfileResult(lowProfileId);
    } catch (err) {
      console.error('CardCom GetLpResult failed:', err);
      return NextResponse.json(
        { error: 'Could not verify payment session with CardCom' },
        { status: 502 }
      );
    }

    const tranzInfo = lpResult?.TranzactionInfo;
    const tokenInfo = lpResult?.TokenInfo;

    // Per docs: LP-level ResponseCode 0 means the deal completed; on the
    // transaction, J2 success is 701, J5 success is 700, and a real charge
    // (won't happen at this step but kept for safety) is 0.
    const lpOk = lpResult?.ResponseCode === 0;
    const validateOk = tranzInfo?.ResponseCode === 701 || tranzInfo?.ResponseCode === 0;

    if (!lpOk || !validateOk) {
      console.warn('Payment validation failed:', { lpResult });
      return NextResponse.json({
        error: tranzInfo?.Description || lpResult?.Description || 'Card validation failed',
      }, { status: 400 });
    }

    // Step 2: refuse debit / gift cards before we charge.
    const blocked = getBlockedCardReason(tranzInfo);
    if (blocked) {
      return NextResponse.json({
        error: 'This card is not supported for subscription payments. Please use a credit card.',
        code: blocked.code,
      }, { status: 400 });
    }

    if (!tokenInfo?.Token) {
      console.error('CardCom did not return a token:', { lpResult });
      return NextResponse.json(
        { error: 'Could not save card for future charges' },
        { status: 502 }
      );
    }

    // The LP was created with the discounted amount; J2 echoes it back.
    const amount = tranzInfo?.Amount;
    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: 'Invalid charge amount' },
        { status: 400 }
      );
    }

    // Build the localized invoice document for the actual charge.
    const plan = await prisma.plan.findUnique({
      where: { id: draftAccount.draftSelectedPlanId },
      include: { translations: true },
    });

    if (!plan) {
      return NextResponse.json(
        { error: 'Plan not found' },
        { status: 404 }
      );
    }

    const { productDescription } = localizedPlan(plan, language);
    const customerName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;

    const document = buildDocument({
      customerName: tranzInfo.CardOwnerName || customerName,
      customerEmail: tranzInfo.CardOwnerEmail || user.email,
      customerPhone: tranzInfo.CardOwnerPhone || user.phoneNumber || '',
      language,
      products: [{
        description: productDescription,
        quantity: 1,
        unitCost: amount,
      }],
    });

    // CardCom expects card expiry in MMYY for DoTransaction.
    const mm = String(tokenInfo.CardMonth ?? '').padStart(2, '0');
    const yy = String(tokenInfo.CardYear ?? '').slice(-2).padStart(2, '0');
    const cardExpirationMMYY = `${mm}${yy}`;

    // Step 3: actually charge the token. ExternalUniqTranId derived from LP
    // id makes accidental retries idempotent.
    let chargeResult;
    try {
      chargeResult = await chargeWithToken({
        token: tokenInfo.Token,
        cardExpirationMMYY,
        amount,
        currency: 'USD',
        externalUniqTranId: externalUniqTranIdFromLpId(lowProfileId),
        cardOwnerInformation: {
          Phone: tranzInfo.CardOwnerPhone || user.phoneNumber || '',
          FullName: tranzInfo.CardOwnerName || customerName,
          // Fallback matches the original direct-doTransaction call from the
          // frontend; some terminal configs reject empty IdentityNumber.
          IdentityNumber: tranzInfo.CardOwnerIdentityNumber || '000000000',
          CardOwnerEmail: tranzInfo.CardOwnerEmail || user.email,
        },
        document,
      });
    } catch (err) {
      console.error('CardCom DoTransaction failed:', err);
      return NextResponse.json(
        { error: 'Failed to charge the card' },
        { status: 502 }
      );
    }

    // Code 0 = charged, code 608 = duplicate (we returned the original
    // response thanks to ExternalUniqUniqTranIdResponse=true).
    const chargeOk = chargeResult?.ResponseCode === 0 || chargeResult?.ResponseCode === 608;
    if (!chargeOk) {
      console.warn('Charge failed:', { chargeResult });
      return NextResponse.json({
        error: chargeResult?.Description || 'Card charge failed',
      }, { status: 400 });
    }

    // Step 4: persist the token. Upsert against (accountId, token) so a
    // second confirm with the same LP doesn't error on the unique constraint.
    try {
      const last4 = tranzInfo.Last4CardDigitsString
        || (tranzInfo.Last4CardDigits != null ? String(tranzInfo.Last4CardDigits).padStart(4, '0') : null);

      await prisma.paymentMethod.upsert({
        where: {
          accountId_token: { accountId: draftAccount.id, token: tokenInfo.Token },
        },
        update: {
          // Keep the metadata fresh in case CardCom returned updated values.
          tokenExpDate: tokenInfo.TokenExDate || '',
          cardYear: tokenInfo.CardYear || 0,
          cardMonth: tokenInfo.CardMonth || 0,
          cardLast4: last4,
          cardBrand: tranzInfo.Brand || null,
          cardInfo: tranzInfo.CardInfo || null,
          paymentType: tranzInfo.PaymentType || null,
          ownerName: tranzInfo.CardOwnerName || null,
          ownerPhone: tranzInfo.CardOwnerPhone || null,
          ownerEmail: tranzInfo.CardOwnerEmail || null,
          ownerTaxId: tranzInfo.CardOwnerIdentityNumber || null,
        },
        create: {
          accountId: draftAccount.id,
          provider: 'CARDCOM',
          token: tokenInfo.Token,
          tokenExpDate: tokenInfo.TokenExDate || '',
          cardYear: tokenInfo.CardYear || 0,
          cardMonth: tokenInfo.CardMonth || 0,
          cardLast4: last4,
          cardBrand: tranzInfo.Brand || null,
          cardInfo: tranzInfo.CardInfo || null,
          paymentType: tranzInfo.PaymentType || null,
          ownerName: tranzInfo.CardOwnerName || null,
          ownerPhone: tranzInfo.CardOwnerPhone || null,
          ownerEmail: tranzInfo.CardOwnerEmail || null,
          ownerTaxId: tranzInfo.CardOwnerIdentityNumber || null,
          isDefault: true,
        },
      });
    } catch (err) {
      // The charge succeeded; failure to persist the PaymentMethod is a
      // soft error (user just won't get one-click reuse for future
      // purchases). Surface the issue in logs but don't fail the request.
      console.error('PaymentMethod persist failed (charge already succeeded):', err);
    }

    // Step 5: mark draft account as payment-confirmed so /finalize accepts.
    const existingInterview = draftAccount.draftInterviewData || {};
    await prisma.account.update({
      where: { id: draftAccount.id },
      data: {
        draftInterviewData: {
          ...existingInterview,
          paymentConfirmed: true,
          paymentLowProfileId: lowProfileId,
          paymentTransactionId: chargeResult?.TranzactionId || null,
          paymentConfirmedAt: new Date().toISOString(),
        },
      },
    });

    try {
      notifyAdmins(emailTemplates.adminNewPayment({
        kind: 'registration',
        amount,
        currency: 'USD',
        user,
        account: { id: draftAccount.id, name: draftAccount.name },
        planName: plan.name,
        productName: productDescription,
        transactionId: chargeResult?.TranzactionId || null,
        couponCode: draftAccount.draftCouponCode || null,
      }));
    } catch (e) {
      console.error('[Reg Payment Confirm] admin notification failed:', e);
    }

    return NextResponse.json({
      success: true,
      message: 'Payment verified and charged successfully',
    });
  } catch (error) {
    console.error('Registration payment confirm error:', error);
    return NextResponse.json(
      { error: 'Failed to confirm payment' },
      { status: 500 }
    );
  }
}
