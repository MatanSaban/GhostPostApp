import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

// Verify super admin access
async function verifySuperAdmin() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isSuperAdmin: true },
    });

    if (!user || !user.isSuperAdmin) {
      return null;
    }

    return user;
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

// GET - Fetch all categories
export async function GET(request) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const categories = await prisma.interviewCategory.findMany({
      include: {
        _count: {
          select: { questions: true },
        },
      },
      orderBy: { order: 'asc' },
    });

    const formattedCategories = categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      nameKey: cat.nameKey,
      order: cat.order,
      isActive: cat.isActive,
      questionsCount: cat._count.questions,
    }));

    return NextResponse.json({ categories: formattedCategories });
  } catch (error) {
    console.error('Error fetching categories:', error);
    return NextResponse.json(
      { error: 'Failed to fetch categories' },
      { status: 500 }
    );
  }
}

// POST - Create a new category
export async function POST(request) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await request.json();
    const { name, nameKey, order } = data;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Get max order if not provided
    let categoryOrder = order;
    if (categoryOrder === undefined) {
      const maxOrderCategory = await prisma.interviewCategory.findFirst({
        orderBy: { order: 'desc' },
      });
      categoryOrder = (maxOrderCategory?.order || 0) + 1;
    }

    const newCategory = await prisma.interviewCategory.create({
      data: {
        name,
        nameKey: nameKey || null,
        order: categoryOrder,
      },
    });

    return NextResponse.json({
      message: 'Category created successfully',
      category: {
        id: newCategory.id,
        name: newCategory.name,
        nameKey: newCategory.nameKey,
        order: newCategory.order,
        isActive: newCategory.isActive,
        questionsCount: 0,
      },
    });
  } catch (error) {
    console.error('Error creating category:', error);
    return NextResponse.json(
      { error: 'Failed to create category' },
      { status: 500 }
    );
  }
}
