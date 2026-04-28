/**
 * Coupon pricing helpers — single source of truth for how a coupon's
 * discountType/discountValue/floorOrderToZero combine with an order amount.
 *
 * All amounts in USD, pre-VAT. Callers add VAT after applying the coupon.
 *
 * Discount types (Coupon.discountType enum):
 *   - PERCENTAGE     : discountValue = percent off (50 = 50% off)
 *   - FIXED_DISCOUNT : discountValue = USD subtracted from the order
 *   - FIXED_PRICE    : discountValue = USD final price (replaces total)
 *   - FIXED_AMOUNT   : legacy, treated identically to FIXED_DISCOUNT so
 *                      old DB rows continue to work
 */

const round2 = (n) => Math.round((n || 0) * 100) / 100;

/**
 * Apply a coupon to a pre-VAT order amount.
 *
 * @param {number} orderUsd  Pre-VAT order subtotal in USD
 * @param {Object|null} coupon  Coupon row (or the validate-endpoint shape)
 * @returns {{
 *   applies: boolean,         // false → don't apply, show error to user
 *   finalUsd: number,         // pre-VAT amount AFTER coupon (or original if !applies)
 *   discountUsd: number,      // pre-VAT amount the user saved (0 if !applies)
 *   error?: string,           // error code when applies=false
 * }}
 */
export function applyCouponToOrder(orderUsd, coupon) {
  const base = round2(orderUsd);
  if (!coupon) {
    return { applies: false, finalUsd: base, discountUsd: 0 };
  }

  const value = round2(coupon.discountValue || 0);
  // Treat the legacy FIXED_AMOUNT as FIXED_DISCOUNT so old rows still apply.
  const type = coupon.discountType === 'FIXED_AMOUNT' ? 'FIXED_DISCOUNT' : coupon.discountType;

  if (type === 'PERCENTAGE') {
    const discount = round2(base * (value / 100));
    return {
      applies: true,
      finalUsd: Math.max(0, round2(base - discount)),
      discountUsd: discount,
    };
  }

  if (type === 'FIXED_DISCOUNT') {
    const discount = Math.min(value, base);
    return {
      applies: true,
      finalUsd: Math.max(0, round2(base - discount)),
      discountUsd: discount,
    };
  }

  if (type === 'FIXED_PRICE') {
    if (value > base) {
      if (coupon.floorOrderToZero) {
        return { applies: true, finalUsd: 0, discountUsd: base };
      }
      return {
        applies: false,
        finalUsd: base,
        discountUsd: 0,
        error: 'COUPON_NOT_APPLICABLE',
      };
    }
    return {
      applies: true,
      finalUsd: value,
      discountUsd: round2(base - value),
    };
  }

  return { applies: false, finalUsd: base, discountUsd: 0 };
}

/**
 * Convenience: returns just the user-facing discount in USD (0 if the
 * coupon doesn't apply at this order size). For UI badges that don't
 * need the full result.
 */
export function couponDiscountUsd(orderUsd, coupon) {
  return applyCouponToOrder(orderUsd, coupon).discountUsd;
}

/**
 * Whether a discountType is the legacy alias. Useful for migration jobs.
 */
export function isLegacyFixedAmount(discountType) {
  return discountType === 'FIXED_AMOUNT';
}

/**
 * Compute the pre-VAT USD price for a recurring cycle when the coupon has a
 * recurringPriceSchedule.
 *
 * @param {Array<{months:number|null, amount:number}>} schedule  As stored on Coupon.
 * @param {number} cycleIndex  1 = first recurring charge (i.e. charge #2 of
 *   the subscription, since charge #1 is signup-time), 2 = second recurring
 *   charge, etc. The signup-time charge does NOT consult this schedule.
 * @param {number} planPriceUsd  Plan's monthly price (used as fallback when
 *   the schedule is empty / exhausted with finite segments).
 * @returns {{ amountUsd: number, source: 'schedule'|'frozen-last'|'plan' }}
 *   - 'schedule': matched a defined segment.
 *   - 'frozen-last': schedule was finite and exhausted; we froze the last
 *     segment's price per spec ("after the schedule, run until cancel").
 *   - 'plan': no schedule at all → recurring price is the plan price.
 */
export function priceForRecurringCycle(schedule, cycleIndex, planPriceUsd) {
  const safe = Array.isArray(schedule) ? schedule.filter((s) => s && typeof s.amount === 'number') : [];
  if (safe.length === 0) {
    return { amountUsd: round2(planPriceUsd || 0), source: 'plan' };
  }

  let cumulative = 0;
  for (const seg of safe) {
    if (seg.months == null) {
      // Forever segment — applies to all remaining cycles.
      return { amountUsd: round2(seg.amount), source: 'schedule' };
    }
    const upper = cumulative + Math.max(0, seg.months);
    if (cycleIndex <= upper) {
      return { amountUsd: round2(seg.amount), source: 'schedule' };
    }
    cumulative = upper;
  }

  // Schedule exhausted with all-finite segments → freeze at the last one.
  const last = safe[safe.length - 1];
  return { amountUsd: round2(last.amount), source: 'frozen-last' };
}
