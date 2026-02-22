/**
 * Proration Utility
 * 
 * All subscriptions align to the 1st of each month.
 * - New subscription mid-month: charge prorated amount for remaining days.
 * - Upgrade: credit unused days on old plan, charge remaining days on new plan.
 * - Downgrade: credit unused days on old plan, charge remaining days on new plan.
 * 
 * Formula:
 *   dailyRate = monthlyPrice / daysInMonth
 *   prorated  = dailyRate * remainingDays
 */

/**
 * Get the number of days in a given month/year.
 */
export function daysInMonth(year, month) {
  // month is 0-indexed (0 = Jan, 11 = Dec)
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Get the 1st of the next month from a given date.
 * If the date is already the 1st, returns the 1st of the following month.
 */
export function getNextFirstOfMonth(date = new Date()) {
  const d = new Date(date);
  // Move to next month's 1st
  if (d.getDate() === 1 && d.getHours() === 0 && d.getMinutes() === 0) {
    // Already at midnight on the 1st — this IS the billing date
    d.setMonth(d.getMonth() + 1);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  d.setMonth(d.getMonth() + 1);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Calculate how many days remain from `date` until the 1st of next month.
 * Includes the current day (partial day counts as 1).
 */
export function daysRemaining(date = new Date()) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth();
  const totalDays = daysInMonth(year, month);
  const currentDay = d.getDate();
  return totalDays - currentDay + 1; // +1 to include today
}

/**
 * Calculate how many days have been used this month (from the 1st until `date`, inclusive).
 */
export function daysUsed(date = new Date()) {
  return new Date(date).getDate();
}

/**
 * Calculate prorated amount for a new subscription starting mid-month.
 * 
 * @param {number} monthlyPrice - Full monthly price
 * @param {Date} [startDate] - When the subscription starts (default: now)
 * @returns {{ proratedAmount: number, remainingDays: number, totalDays: number, dailyRate: number, nextBillingDate: Date }}
 */
export function calculateNewSubscriptionProration(monthlyPrice, startDate = new Date()) {
  const d = new Date(startDate);
  const year = d.getFullYear();
  const month = d.getMonth();
  const totalDays = daysInMonth(year, month);
  const remaining = daysRemaining(d);
  const dailyRate = monthlyPrice / totalDays;
  const proratedAmount = Math.round(dailyRate * remaining * 100) / 100; // round to 2 decimals
  const nextBillingDate = getNextFirstOfMonth(d);

  return {
    proratedAmount,
    remainingDays: remaining,
    totalDays,
    dailyRate: Math.round(dailyRate * 100) / 100,
    nextBillingDate,
    fullMonthlyPrice: monthlyPrice,
  };
}

/**
 * Calculate proration for upgrading or downgrading a plan.
 * 
 * Logic:
 *  1. Days used this month on current plan → credit = 0 (already paid)
 *  2. Days remaining this month (including today)
 *  3. Credit for unused days on current plan = currentDailyRate * remainingDays
 *  4. Charge for remaining days on new plan  = newDailyRate * remainingDays
 *  5. Net amount = charge - credit
 *     - Positive = user pays the difference (upgrade)
 *     - Negative = user gets credit (downgrade) — we set to 0, credit applied to next billing
 * 
 * @param {number} currentMonthlyPrice - Current plan's monthly price
 * @param {number} newMonthlyPrice - New plan's monthly price
 * @param {Date} [changeDate] - When the change happens (default: now)
 * @returns {{ netAmount, creditAmount, chargeAmount, remainingDays, totalDays, isUpgrade, currentDailyRate, newDailyRate, nextBillingDate }}
 */
export function calculatePlanChangeProration(
  currentMonthlyPrice,
  newMonthlyPrice,
  changeDate = new Date()
) {
  const d = new Date(changeDate);
  const year = d.getFullYear();
  const month = d.getMonth();
  const totalDays = daysInMonth(year, month);
  const remaining = daysRemaining(d);
  const used = daysUsed(d);

  const currentDailyRate = currentMonthlyPrice / totalDays;
  const newDailyRate = newMonthlyPrice / totalDays;

  // Credit for unused portion of current plan
  const creditAmount = Math.round(currentDailyRate * remaining * 100) / 100;

  // Charge for remaining portion on new plan
  const chargeAmount = Math.round(newDailyRate * remaining * 100) / 100;

  // Net = what the user pays now
  const rawNet = chargeAmount - creditAmount;
  const netAmount = Math.round(Math.max(0, rawNet) * 100) / 100;

  // If negative, store the credit for next billing cycle
  const unusedCredit = rawNet < 0 ? Math.round(Math.abs(rawNet) * 100) / 100 : 0;

  const isUpgrade = newMonthlyPrice > currentMonthlyPrice;
  const nextBillingDate = getNextFirstOfMonth(d);

  return {
    netAmount,         // What to charge now (0 if downgrade credit exceeds charge)
    creditAmount,      // Credit for unused current plan days
    chargeAmount,      // Cost of new plan for remaining days
    unusedCredit,      // Credit to apply to next billing (downgrade scenario)
    remainingDays: remaining,
    daysUsed: used,
    totalDays,
    isUpgrade,
    currentDailyRate: Math.round(currentDailyRate * 100) / 100,
    newDailyRate: Math.round(newDailyRate * 100) / 100,
    nextBillingDate,
    currentMonthlyPrice,
    newMonthlyPrice,
  };
}
