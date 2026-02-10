import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

// GET - Get account by ID
export async function GET(request, { params }) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;

    // Verify user has access to this account
    const membership = await prisma.accountMember.findFirst({
      where: {
        userId,
        accountId: id,
      },
      include: {
        role: true,
      },
    });

    // Also check if user is superadmin
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isSuperAdmin: true },
    });

    if (!membership && !user?.isSuperAdmin) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const account = await prisma.account.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        logo: true,
        website: true,
        industry: true,
        timezone: true,
        defaultLanguage: true,
        billingEmail: true,
        generalEmail: true,
        isActive: true,
        aiCreditsBalance: true,
        createdAt: true,
      },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    return NextResponse.json({ account });
  } catch (error) {
    console.error('Error fetching account:', error);
    return NextResponse.json({ error: 'Failed to fetch account' }, { status: 500 });
  }
}

// PUT - Update account
export async function PUT(request, { params }) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;

    // Verify user has permission to edit this account
    const membership = await prisma.accountMember.findFirst({
      where: {
        userId,
        accountId: id,
      },
      include: {
        role: {
          select: {
            permissions: true,
          },
        },
      },
    });

    // Also check if user is superadmin
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isSuperAdmin: true },
    });

    const isSuperAdmin = user?.isSuperAdmin;
    const hasEditPermission = membership?.role?.permissions?.includes('ACCOUNT_EDIT');

    if (!isSuperAdmin && !hasEditPermission) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    const body = await request.json();
    const { name, website, industry, timezone, defaultLanguage, billingEmail, generalEmail } = body;

    // Validate required fields
    if (name !== undefined && (!name || typeof name !== 'string')) {
      return NextResponse.json({ error: 'Invalid account name' }, { status: 400 });
    }

    // Build update data
    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (website !== undefined) updateData.website = website?.trim() || null;
    if (industry !== undefined) updateData.industry = industry || null;
    if (timezone !== undefined) updateData.timezone = timezone;
    if (defaultLanguage !== undefined) updateData.defaultLanguage = defaultLanguage;
    if (billingEmail !== undefined) updateData.billingEmail = billingEmail?.trim() || '';
    if (generalEmail !== undefined) updateData.generalEmail = generalEmail?.trim() || '';

    const updatedAccount = await prisma.account.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        slug: true,
        logo: true,
        website: true,
        industry: true,
        timezone: true,
        defaultLanguage: true,
        billingEmail: true,
        generalEmail: true,
        isActive: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ account: updatedAccount });
  } catch (error) {
    console.error('Error updating account:', error);
    return NextResponse.json({ error: 'Failed to update account' }, { status: 500 });
  }
}
