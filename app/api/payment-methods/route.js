import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { getOwnedAccount } from '@/lib/account-utils';

const SESSION_COOKIE = 'user_session';

async function getAuthAccount() {
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!userId) return null;
  return await getOwnedAccount(userId);
}

/**
 * GET /api/payment-methods
 *
 * List the current account's saved payment methods. Used by the Settings →
 * Payment Methods tab and by the addon-purchase saved-card picker.
 */
export async function GET() {
  try {
    const account = await getAuthAccount();
    if (!account) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const methods = await prisma.paymentMethod.findMany({
      where: { accountId: account.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    return NextResponse.json({
      paymentMethods: methods.map((pm) => ({
        id: pm.id,
        nickname: pm.nickname || null,
        cardLast4: pm.cardLast4 || null,
        cardBrand: pm.cardBrand || null,
        cardYear: pm.cardYear,
        cardMonth: pm.cardMonth,
        // Frontend uses these for the "this card can't be used for
        // subscription / recurring" badge in the picker.
        cardInfo: pm.cardInfo,
        paymentType: pm.paymentType,
        isDefault: pm.isDefault,
        createdAt: pm.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('List payment methods error:', error);
    return NextResponse.json({ error: 'Failed to list payment methods' }, { status: 500 });
  }
}
