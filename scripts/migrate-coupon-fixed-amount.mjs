/**
 * One-time migration: FIXED_AMOUNT → FIXED_DISCOUNT.
 *
 * The old DiscountType enum used FIXED_AMOUNT for "$X off the order". The
 * three-way refactor (B1) renames that to FIXED_DISCOUNT and introduces
 * FIXED_PRICE for "$X final price". The Prisma enum keeps FIXED_AMOUNT as a
 * legacy alias so old rows still parse, but the admin UI only authors against
 * the new names — so any existing FIXED_AMOUNT rows in DB are fine but they'd
 * show up under FIXED_DISCOUNT in the form anyway.
 *
 * This script flips them to FIXED_DISCOUNT so the DB matches the UI.
 *
 * Run once per environment after deploying the schema change:
 *   node scripts/migrate-coupon-fixed-amount.mjs
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Coupons.
  const couponCount = await prisma.coupon.updateMany({
    where: { discountType: 'FIXED_AMOUNT' },
    data: { discountType: 'FIXED_DISCOUNT' },
  });

  // Snapshot of the type lives on each redemption too, so historic
  // redemptions stay accurate.
  const redemptionCount = await prisma.couponRedemption.updateMany({
    where: { discountType: 'FIXED_AMOUNT' },
    data: { discountType: 'FIXED_DISCOUNT' },
  });

  console.log(`Migrated ${couponCount.count} coupon row(s) from FIXED_AMOUNT to FIXED_DISCOUNT.`);
  console.log(`Migrated ${redemptionCount.count} couponRedemption row(s).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
