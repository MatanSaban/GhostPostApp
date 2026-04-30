/**
 * Coupon redemption helpers — server-side bookkeeping for add-on-coupon
 * redemptions. Three payment routes need this:
 *   - /api/payment/confirm           (new card, post-charge)
 *   - /api/payment/charge-saved-card (saved card, post-charge)
 *   - /api/payment/free-with-coupon  (100% discount, no charge)
 *
 * They all share the same validation rules; only their failure semantics
 * differ — see the two exported wrappers.
 */

import { isCouponApplicableToAddOn } from './coupon-applicability';

class CouponRedemptionError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'CouponRedemptionError';
    this.code = code;
  }
}

/**
 * Strict re-validation + redemption write. Throws CouponRedemptionError
 * (with .code) on any validation failure so a strict caller (free-with-coupon)
 * can convert it to a 400 response. Use the BestEffort wrapper below from the
 * post-charge routes where rejecting would mean the user paid but got nothing.
 *
 * @param {PrismaClient} prismaClient
 * @param {Object} args
 * @param {string} args.couponCode      Code as the client sent it (any case).
 * @param {{ id: string, type: string }} args.addOn  AddOn being purchased.
 * @param {{ id: string }} args.addOnPurchase        AddOnPurchase row already created.
 * @param {string} args.accountId
 * @param {string|null} [args.subscriptionId]
 * @returns {Promise<Object>} the Coupon row whose redemption was recorded.
 */
export async function validateAndRedeemAddOnCoupon(prismaClient, args) {
  const { couponCode, addOn, addOnPurchase, accountId, subscriptionId = null } = args;

  if (!couponCode || typeof couponCode !== 'string') {
    throw new CouponRedemptionError('Coupon code is required', 'COUPON_INVALID');
  }

  const code = couponCode.toUpperCase().trim();
  const coupon = await prismaClient.coupon.findUnique({
    where: { code },
    include: { _count: { select: { redemptions: true } } },
  });

  if (!coupon || !coupon.isActive) {
    throw new CouponRedemptionError('Invalid coupon code', 'COUPON_INVALID');
  }

  const now = new Date();
  if (coupon.validFrom && now < coupon.validFrom) {
    throw new CouponRedemptionError('Coupon not yet active', 'COUPON_NOT_YET_ACTIVE');
  }
  if (coupon.validUntil && now > coupon.validUntil) {
    throw new CouponRedemptionError('Coupon has expired', 'COUPON_EXPIRED');
  }
  if (coupon.maxRedemptions && coupon._count.redemptions >= coupon.maxRedemptions) {
    throw new CouponRedemptionError('Coupon usage limit reached', 'COUPON_USAGE_LIMIT');
  }

  const accountRedemptions = await prismaClient.couponRedemption.count({
    where: { couponId: coupon.id, accountId },
  });
  if (accountRedemptions >= (coupon.maxPerAccount || 1)) {
    throw new CouponRedemptionError('Coupon already used by this account', 'COUPON_MAX_PER_ACCOUNT');
  }

  const scope = isCouponApplicableToAddOn(coupon, { id: addOn.id, type: addOn.type });
  if (!scope.applies) {
    throw new CouponRedemptionError('Coupon not applicable to this add-on', 'COUPON_NOT_APPLICABLE');
  }

  await prismaClient.couponRedemption.create({
    data: {
      couponId: coupon.id,
      accountId,
      subscriptionId,
      addOnPurchaseId: addOnPurchase.id,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      recurringPriceSchedule: Array.isArray(coupon.recurringPriceSchedule)
        ? coupon.recurringPriceSchedule
        : [],
      floorOrderToZero: !!coupon.floorOrderToZero,
      // limitationOverrides/extraFeatures are plan-channel only; add-on
      // redemptions snapshot empty arrays for consistency.
      limitationOverrides: [],
      extraFeatures: [],
      durationMonths: null,
      status: 'ACTIVE',
    },
  });

  return coupon;
}

/**
 * Best-effort wrapper — runs the strict redemption flow and swallows failures.
 * Use from the post-charge payment routes (confirm / charge-saved-card): the
 * user already paid, so a coupon-record failure must not block delivering the
 * add-on. Validation failures get logged and returned in `result.error.code`
 * so the caller can include them in audit metadata if desired.
 *
 * @returns {Promise<{ coupon: Object|null, error: { code: string, message: string }|null }>}
 */
export async function redeemAddOnCouponBestEffort(prismaClient, args) {
  if (!args?.couponCode) return { coupon: null, error: null };
  try {
    const coupon = await validateAndRedeemAddOnCoupon(prismaClient, args);
    return { coupon, error: null };
  } catch (err) {
    const code = err?.code || 'COUPON_REDEMPTION_FAILED';
    console.warn('[coupon-redemption] best-effort redeem failed:', {
      code,
      message: err?.message,
      addOnId: args?.addOn?.id,
      accountId: args?.accountId,
    });
    return { coupon: null, error: { code, message: err?.message || 'Failed' } };
  }
}

export { CouponRedemptionError };
