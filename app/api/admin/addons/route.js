import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifySuperAdmin } from '@/lib/auth';

// GET all add-ons
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const activeOnly = searchParams.get('active') !== 'false';

    const where = {
      ...(activeOnly && { isActive: true }),
      ...(type && { type }),
    };

    const addOns = await prisma.addOn.findMany({
      where,
      include: {
        translations: true,
        _count: {
          select: { purchases: { where: { status: 'ACTIVE' } } },
        },
      },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }],
    });

    return NextResponse.json({ addOns });
  } catch (error) {
    console.error('Error fetching add-ons:', error);
    return NextResponse.json(
      { error: 'Failed to fetch add-ons' },
      { status: 500 }
    );
  }
}

// Create a new add-on (admin only)
export async function POST(request) {
  try {
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
    } = body;

    if (!name || !slug || !type) {
      return NextResponse.json(
        { error: 'Name, slug, and type are required' },
        { status: 400 }
      );
    }

    // Validate type
    const validTypes = ['SEATS', 'SITES', 'AI_CREDITS', 'STORAGE', 'KEYWORDS', 'CONTENT'];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Check if slug already exists
    const existing = await prisma.addOn.findUnique({ where: { slug } });
    if (existing) {
      return NextResponse.json(
        { error: 'Add-on with this slug already exists' },
        { status: 400 }
      );
    }

    // Get highest sort order for this type
    const lastAddOn = await prisma.addOn.findFirst({
      where: { type },
      orderBy: { sortOrder: 'desc' },
    });
    const sortOrder = (lastAddOn?.sortOrder || 0) + 1;

    const addOn = await prisma.addOn.create({
      data: {
        name,
        slug,
        description: description || '',
        type,
        price: parseFloat(price) || 0,
        currency: currency || 'USD',
        billingType: billingType || 'RECURRING',
        quantity: quantity ? parseInt(quantity) : null,
        isActive: isActive !== false,
        sortOrder,
      },
      include: {
        translations: true,
      },
    });

    return NextResponse.json({ addOn, message: 'Add-on created successfully' });
  } catch (error) {
    console.error('Error creating add-on:', error);
    return NextResponse.json(
      { error: 'Failed to create add-on' },
      { status: 500 }
    );
  }
}
