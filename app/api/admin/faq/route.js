import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

async function verifySuperAdmin() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) return null;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isSuperAdmin: true },
    });

    if (!user || !user.isSuperAdmin) return null;
    return user;
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

// GET - Fetch all FAQ items
export async function GET() {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const faqs = await prisma.websiteFaq.findMany({
      orderBy: { order: 'asc' },
    });

    const stats = {
      total: faqs.length,
      active: faqs.filter((f) => f.isActive).length,
      pricing: faqs.filter((f) => f.page === 'pricing' || f.page === 'both').length,
      faqPage: faqs.filter((f) => f.page === 'faq' || f.page === 'both').length,
    };

    return NextResponse.json({ faqs, stats });
  } catch (error) {
    console.error('Error fetching FAQs:', error);
    return NextResponse.json({ error: 'Failed to fetch FAQs' }, { status: 500 });
  }
}

// POST - Create a new FAQ item
export async function POST(request) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await request.json();
    const { content, category, page = 'pricing', isActive = true } = data;

    if (!content || (!content.en && !content.he)) {
      return NextResponse.json(
        { error: 'At least one language translation is required' },
        { status: 400 }
      );
    }

    // Get max order
    const maxOrderFaq = await prisma.websiteFaq.findFirst({
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    const newOrder = (maxOrderFaq?.order ?? -1) + 1;

    const faq = await prisma.websiteFaq.create({
      data: {
        content,
        category: category || null,
        page,
        order: newOrder,
        isActive,
        updatedBy: admin.id,
      },
    });

    return NextResponse.json({ success: true, faq });
  } catch (error) {
    console.error('Error creating FAQ:', error);
    return NextResponse.json({ error: 'Failed to create FAQ' }, { status: 500 });
  }
}

// PATCH - Update a FAQ item
export async function PATCH(request) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await request.json();
    const { id, ...updateData } = data;

    if (!id) {
      return NextResponse.json({ error: 'FAQ ID is required' }, { status: 400 });
    }

    const cleanData = { updatedBy: admin.id };
    if (updateData.content !== undefined) cleanData.content = updateData.content;
    if (updateData.category !== undefined) cleanData.category = updateData.category || null;
    if (updateData.page !== undefined) cleanData.page = updateData.page;
    if (updateData.order !== undefined) cleanData.order = updateData.order;
    if (updateData.isActive !== undefined) cleanData.isActive = updateData.isActive;

    const faq = await prisma.websiteFaq.update({
      where: { id },
      data: cleanData,
    });

    return NextResponse.json({ success: true, faq });
  } catch (error) {
    console.error('Error updating FAQ:', error);
    return NextResponse.json({ error: 'Failed to update FAQ' }, { status: 500 });
  }
}

// DELETE - Delete a FAQ item
export async function DELETE(request) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'FAQ ID is required' }, { status: 400 });
    }

    await prisma.websiteFaq.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting FAQ:', error);
    return NextResponse.json({ error: 'Failed to delete FAQ' }, { status: 500 });
  }
}
