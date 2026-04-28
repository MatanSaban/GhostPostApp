import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { getOwnedAccount } from '@/lib/account-utils';

const SESSION_COOKIE = 'user_session';
const NICKNAME_MAX = 50;

async function getAuthAccount() {
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!userId) return null;
  return await getOwnedAccount(userId);
}

async function getOwnedPaymentMethod(account, id) {
  const pm = await prisma.paymentMethod.findUnique({ where: { id } });
  if (!pm || pm.accountId !== account.id) return null;
  return pm;
}

/**
 * PATCH /api/payment-methods/[id]
 *
 * Body (any subset):
 *   nickname  : string|null  // up to 50 chars; null clears it
 *   isDefault : true         // promotes this card to default; demotes others
 */
export async function PATCH(request, { params }) {
  try {
    const account = await getAuthAccount();
    if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const pm = await getOwnedPaymentMethod(account, id);
    if (!pm) return NextResponse.json({ error: 'Payment method not found' }, { status: 404 });

    const body = await request.json();
    const updates = {};

    if ('nickname' in body) {
      if (body.nickname === null || body.nickname === '') {
        updates.nickname = null;
      } else {
        const nickname = String(body.nickname).trim().slice(0, NICKNAME_MAX);
        if (!nickname) {
          updates.nickname = null;
        } else {
          updates.nickname = nickname;
        }
      }
    }

    // Setting isDefault is the only meaningful boolean operation here — you
    // can't "un-default" a card directly, you switch the default to another
    // card.
    if (body.isDefault === true) {
      // Atomically demote all other cards on this account, then promote this one.
      await prisma.$transaction([
        prisma.paymentMethod.updateMany({
          where: { accountId: account.id, NOT: { id: pm.id } },
          data: { isDefault: false },
        }),
        prisma.paymentMethod.update({
          where: { id: pm.id },
          data: { isDefault: true, ...updates },
        }),
      ]);
    } else if (Object.keys(updates).length > 0) {
      await prisma.paymentMethod.update({
        where: { id: pm.id },
        data: updates,
      });
    }

    const fresh = await prisma.paymentMethod.findUnique({ where: { id: pm.id } });
    return NextResponse.json({
      paymentMethod: {
        id: fresh.id,
        nickname: fresh.nickname || null,
        cardLast4: fresh.cardLast4 || null,
        cardBrand: fresh.cardBrand || null,
        cardYear: fresh.cardYear,
        cardMonth: fresh.cardMonth,
        cardInfo: fresh.cardInfo,
        paymentType: fresh.paymentType,
        isDefault: fresh.isDefault,
        createdAt: fresh.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Update payment method error:', error);
    return NextResponse.json({ error: 'Failed to update payment method' }, { status: 500 });
  }
}

/**
 * DELETE /api/payment-methods/[id]
 *
 * Removes a saved card. If it was the default and others exist, the most
 * recently created remaining card is promoted to default.
 *
 * NOTE: this only deletes our local copy of the token. CardCom retains the
 * token on its side; we just stop using it. If you need to fully revoke at
 * CardCom, that's a separate API call we don't make here.
 */
export async function DELETE(_request, { params }) {
  try {
    const account = await getAuthAccount();
    if (!account) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const pm = await getOwnedPaymentMethod(account, id);
    if (!pm) return NextResponse.json({ error: 'Payment method not found' }, { status: 404 });

    const wasDefault = pm.isDefault;

    await prisma.paymentMethod.delete({ where: { id: pm.id } });

    if (wasDefault) {
      const replacement = await prisma.paymentMethod.findFirst({
        where: { accountId: account.id },
        orderBy: { createdAt: 'desc' },
      });
      if (replacement) {
        await prisma.paymentMethod.update({
          where: { id: replacement.id },
          data: { isDefault: true },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete payment method error:', error);
    return NextResponse.json({ error: 'Failed to delete payment method' }, { status: 500 });
  }
}
