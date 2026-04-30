/**
 * Coupon applicability helper — single source of truth for whether a coupon
 * applies to a given target (plan checkout vs add-on purchase).
 *
 * Scope arrays on Coupon:
 *   - applicablePlanIds:    specific Plan ids (plan channel)
 *   - applicableAddOnIds:   specific AddOn ids (add-on channel)
 *   - applicableAddOnTypes: AddOnType enum strings (add-on channel)
 *
 * A coupon's "channel" = which kind of purchase it applies to. The rules:
 *   - All three arrays empty       → applies to everything (legacy behavior).
 *   - Only the plan array is set   → plan-only coupon (refuses add-ons).
 *   - Only the add-on arrays set   → add-on-only coupon (refuses plans).
 *   - Plan and add-on arrays set   → applies in both channels for matching items.
 *
 * Returns { applies: boolean, errorCode?: string }.
 */

function arr(x) {
  return Array.isArray(x) ? x : [];
}

function hasPlanScope(coupon) {
  return arr(coupon?.applicablePlanIds).length > 0;
}

function hasAddOnScope(coupon) {
  return (
    arr(coupon?.applicableAddOnIds).length > 0 ||
    arr(coupon?.applicableAddOnTypes).length > 0
  );
}

/**
 * Is this coupon applicable to a plan checkout?
 * @param {Object} coupon
 * @param {string} planId  Plan id being purchased.
 */
export function isCouponApplicableToPlan(coupon, planId) {
  if (!coupon) return { applies: false, errorCode: 'invalid' };
  // Add-on-only coupon → can't be used at plan checkout.
  if (!hasPlanScope(coupon) && hasAddOnScope(coupon)) {
    return { applies: false, errorCode: 'notApplicable' };
  }
  if (hasPlanScope(coupon) && (!planId || !arr(coupon.applicablePlanIds).includes(planId))) {
    return { applies: false, errorCode: 'notApplicable' };
  }
  return { applies: true };
}

/**
 * Is this coupon applicable to a specific add-on purchase?
 * @param {Object} coupon
 * @param {{ id?: string, type?: string }} addOn  AddOn being purchased.
 */
export function isCouponApplicableToAddOn(coupon, addOn) {
  if (!coupon) return { applies: false, errorCode: 'invalid' };
  // Plan-only coupon (plan ids set, no add-on scope) → not for add-ons.
  if (hasPlanScope(coupon) && !hasAddOnScope(coupon)) {
    return { applies: false, errorCode: 'notApplicable' };
  }
  const ids = arr(coupon.applicableAddOnIds);
  const types = arr(coupon.applicableAddOnTypes);
  if (ids.length > 0 && (!addOn?.id || !ids.includes(addOn.id))) {
    return { applies: false, errorCode: 'notApplicable' };
  }
  if (types.length > 0 && (!addOn?.type || !types.includes(addOn.type))) {
    return { applies: false, errorCode: 'notApplicable' };
  }
  return { applies: true };
}
