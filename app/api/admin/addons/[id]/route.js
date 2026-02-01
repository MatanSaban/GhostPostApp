import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifySuperAdmin } from '@/lib/auth';

// GET single add-on
export async function GET(request, { params }) {
  try {
    const { id } = await params;

    const addOn = await prisma.addOn.findUnique({
      where: { id },
      include: {
        translations: true,
        _count: {
          select: { purchases: { where: { status: 'ACTIVE' } } },
        },
      },
    });

    if (!addOn) {
      return NextResponse.json({ error: 'Add-on not found' }, { status: 404 });
    }

    return NextResponse.json({ addOn });
  } catch (error) {
    console.error('Error fetching add-on:', error);
    return NextResponse.json(
      { error: 'Failed to fetch add-on' },
      { status: 500 }
    );
  }
}

// Update add-on
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
      type,
      price,
      currency,
      billingType,
      quantity,
      isActive,
      sortOrder,
    } = body;

    // Check if add-on exists
    const existing = await prisma.addOn.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Add-on not found' }, { status: 404 });
    }

    // Check if new slug conflicts
    if (slug && slug !== existing.slug) {
      const slugConflict = await prisma.addOn.findUnique({ where: { slug } });
      if (slugConflict) {
        return NextResponse.json(
          { error: 'Slug already in use' },
          { status: 400 }
        );
      }
    }

    const addOn = await prisma.addOn.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(slug && { slug }),
        ...(description !== undefined && { description }),
        ...(type && { type }),
        ...(price !== undefined && { price: parseFloat(price) }),
        ...(currency && { currency }),
        ...(billingType && { billingType }),
        ...(quantity !== undefined && { quantity: quantity ? parseInt(quantity) : null }),
        ...(isActive !== undefined && { isActive }),
        ...(sortOrder !== undefined && { sortOrder: parseInt(sortOrder) }),
      },
      include: {
        translations: true,
      },
    });

    return NextResponse.json({ addOn, message: 'Add-on updated successfully' });
  } catch (error) {
    console.error('Error updating add-on:', error);
    return NextResponse.json(
      { error: 'Failed to update add-on' },
      { status: 500 }
    );
  }
}

// Delete add-on
export async function DELETE(request, { params }) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Check if add-on exists and has active purchases
    const addOn = await prisma.addOn.findUnique({
      where: { id },
      include: {
        _count: {
          select: { purchases: { where: { status: 'ACTIVE' } } },
        },
      },
    });

    if (!addOn) {
      return NextResponse.json({ error: 'Add-on not found' }, { status: 404 });
    }

    if (addOn._count.purchases > 0) {
      // Archive instead of delete if has active purchases
      await prisma.addOn.update({
        where: { id },
        data: { isActive: false },
      });
      return NextResponse.json({
        message: 'Add-on archived (has active purchases)',
      });
    }

    // Delete translations first
    await prisma.addOnTranslation.deleteMany({ where: { addOnId: id } });
    
    // Delete the add-on
    await prisma.addOn.delete({ where: { id } });

    return NextResponse.json({ message: 'Add-on deleted successfully' });
  } catch (error) {
    console.error('Error deleting add-on:', error);
    return NextResponse.json(
      { error: 'Failed to delete add-on' },
      { status: 500 }
    );
  }
}
