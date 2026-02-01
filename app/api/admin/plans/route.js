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

export async function GET(request) {
  try {
    // Verify super admin access
    const admin = await verifySuperAdmin();
    if (!admin) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Fetch all plans with subscriber counts and translations
    const plans = await prisma.plan.findMany({
      include: {
        _count: {
          select: {
            subscriptions: true,
          },
        },
        translations: true,
      },
      orderBy: {
        sortOrder: 'asc',
      },
    });

    // Format the response
    const formattedPlans = plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      slug: plan.slug,
      description: plan.description,
      monthlyPrice: plan.price,
      yearlyPrice: plan.yearlyPrice ?? plan.price * 10, // Default to 2 months free
      status: plan.isActive ? 'active' : 'archived',
      subscribersCount: plan._count.subscriptions,
      // Features now stored as [{key, label}]
      features: Array.isArray(plan.features) ? plan.features : [],
      // All limitations stored in JSON field
      limitations: plan.limitations || [],
      translations: plan.translations.reduce((acc, t) => {
        acc[t.language] = {
          name: t.name,
          description: t.description,
          features: t.features,
          limitations: t.limitations || [],
        };
        return acc;
      }, {}),
      createdAt: plan.createdAt.toISOString(),
    }));

    // Calculate stats
    const activePlans = plans.filter((p) => p.isActive);
    const totalSubscribers = plans.reduce((sum, p) => sum + p._count.subscriptions, 0);
    const avgPrice =
      activePlans.length > 0
        ? activePlans.reduce((sum, p) => sum + p.price, 0) / activePlans.length
        : 0;

    const stats = {
      totalPlans: activePlans.length,
      totalSubscribers,
      avgPrice,
    };

    return NextResponse.json({
      plans: formattedPlans,
      stats,
    });
  } catch (error) {
    console.error('Error fetching plans:', error);
    return NextResponse.json(
      { error: 'Failed to fetch plans' },
      { status: 500 }
    );
  }
}

// Create a new plan
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
      price, 
      yearlyPrice, 
      features, 
      isActive,
      limitations,
    } = body;

    if (!name || !slug) {
      return NextResponse.json({ error: 'Name and slug are required' }, { status: 400 });
    }

    // Check if slug already exists
    const existingPlan = await prisma.plan.findUnique({ where: { slug } });
    if (existingPlan) {
      return NextResponse.json({ error: 'Plan with this slug already exists' }, { status: 400 });
    }

    // Get highest sort order
    const lastPlan = await prisma.plan.findFirst({ orderBy: { sortOrder: 'desc' } });
    const sortOrder = (lastPlan?.sortOrder || 0) + 1;

    const plan = await prisma.plan.create({
      data: {
        name,
        slug,
        description: description || '',
        price: parseFloat(price) || 0,
        yearlyPrice: yearlyPrice ? parseFloat(yearlyPrice) : null,
        features: features || [],
        isActive: isActive !== false,
        sortOrder,
        // All limitations stored as JSON array
        limitations: limitations || [],
      },
    });

    return NextResponse.json({ plan, message: 'Plan created successfully' });
  } catch (error) {
    console.error('Error creating plan:', error);
    return NextResponse.json({ error: 'Failed to create plan' }, { status: 500 });
  }
}
