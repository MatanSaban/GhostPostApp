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

// Get single plan
export async function GET(request, { params }) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const plan = await prisma.plan.findUnique({
      where: { id },
      include: {
        _count: { select: { subscriptions: true } },
      },
    });

    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    return NextResponse.json({ plan });
  } catch (error) {
    console.error('Error fetching plan:', error);
    return NextResponse.json({ error: 'Failed to fetch plan' }, { status: 500 });
  }
}

// Update plan
export async function PUT(request, { params }) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { 
      name, 
      slug, 
      description, 
      price, 
      yearlyPrice, 
      features, 
      isActive,
      limitations,
    } = body;

    // Check if plan exists
    const existingPlan = await prisma.plan.findUnique({ where: { id } });
    if (!existingPlan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    // Check if new slug conflicts with another plan
    if (slug && slug !== existingPlan.slug) {
      const slugConflict = await prisma.plan.findUnique({ where: { slug } });
      if (slugConflict) {
        return NextResponse.json({ error: 'Slug already in use' }, { status: 400 });
      }
    }

    const plan = await prisma.plan.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(slug && { slug }),
        ...(description !== undefined && { description }),
        ...(price !== undefined && { price: parseFloat(price) }),
        ...(yearlyPrice !== undefined && { yearlyPrice: yearlyPrice ? parseFloat(yearlyPrice) : null }),
        ...(features !== undefined && { features }),
        ...(isActive !== undefined && { isActive }),
        // All limitations stored as JSON array
        ...(limitations !== undefined && { limitations }),
      },
    });

    return NextResponse.json({ plan, message: 'Plan updated successfully' });
  } catch (error) {
    console.error('Error updating plan:', error);
    return NextResponse.json({ error: 'Failed to update plan' }, { status: 500 });
  }
}

// Delete plan
export async function DELETE(request, { params }) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Check if plan exists and has subscriptions
    const plan = await prisma.plan.findUnique({
      where: { id },
      include: { _count: { select: { subscriptions: true } } },
    });

    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    if (plan._count.subscriptions > 0) {
      // Archive instead of delete if has subscriptions
      await prisma.plan.update({
        where: { id },
        data: { isActive: false },
      });
      return NextResponse.json({ message: 'Plan archived (has active subscriptions)' });
    }

    await prisma.plan.delete({ where: { id } });
    return NextResponse.json({ message: 'Plan deleted successfully' });
  } catch (error) {
    console.error('Error deleting plan:', error);
    return NextResponse.json({ error: 'Failed to delete plan' }, { status: 500 });
  }
}

// Duplicate plan (POST to this route)
export async function POST(request, { params }) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Get original plan
    const originalPlan = await prisma.plan.findUnique({ where: { id } });
    if (!originalPlan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    // Generate unique slug
    let newSlug = `${originalPlan.slug}-copy`;
    let counter = 1;
    while (await prisma.plan.findUnique({ where: { slug: newSlug } })) {
      newSlug = `${originalPlan.slug}-copy-${counter}`;
      counter++;
    }

    // Get highest sort order
    const lastPlan = await prisma.plan.findFirst({ orderBy: { sortOrder: 'desc' } });
    const sortOrder = (lastPlan?.sortOrder || 0) + 1;

    const newPlan = await prisma.plan.create({
      data: {
        name: `${originalPlan.name} (Copy)`,
        slug: newSlug,
        description: originalPlan.description,
        price: originalPlan.price,
        yearlyPrice: originalPlan.yearlyPrice,
        features: originalPlan.features,
        limitations: originalPlan.limitations,
        isActive: false, // Duplicated plans start as inactive
        sortOrder,
      },
    });

    return NextResponse.json({ plan: newPlan, message: 'Plan duplicated successfully' });
  } catch (error) {
    console.error('Error duplicating plan:', error);
    return NextResponse.json({ error: 'Failed to duplicate plan' }, { status: 500 });
  }
}
