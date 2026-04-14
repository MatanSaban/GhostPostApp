import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

async function getAuthenticatedUser() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;
    if (!userId) return null;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        isSuperAdmin: true,
      },
    });
    return user;
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

// POST – Bulk create backlink listings (super-admin only)
export async function POST(request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!user.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { listings } = await request.json();

    if (!Array.isArray(listings) || listings.length === 0) {
      return NextResponse.json({ error: 'listings array is required' }, { status: 400 });
    }

    if (listings.length > 500) {
      return NextResponse.json({ error: 'Maximum 500 listings per batch' }, { status: 400 });
    }

    const results = { created: 0, errors: [] };

    // Process each listing individually so we can report per-row errors
    for (let i = 0; i < listings.length; i++) {
      const item = listings[i];

      // Validate required fields
      const missing = [];
      if (!item.domain?.trim()) missing.push('website name');
      if (!item.url?.trim()) missing.push('website URL');
      if (item.price == null || item.price === '') missing.push('price');
      if (!item.language?.trim()) missing.push('language');

      if (missing.length > 0) {
        results.errors.push({ row: i + 1, message: `Missing required fields: ${missing.join(', ')}` });
        continue;
      }

      // Sanitise URL
      let url = item.url.trim();
      if (!/^https?:\/\//i.test(url)) {
        url = 'https://' + url;
      }

      // Extract domain from URL for the domain field
      let domain;
      try {
        domain = new URL(url).hostname.replace(/^www\./, '');
      } catch {
        domain = url.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
      }

      try {
        await prisma.backlinkListing.create({
          data: {
            publisherType: 'PLATFORM',
            domain,
            websiteName: item.domain.trim(),
            title: (item.title || item.domain).trim(),
            description: null,
            sampleUrl: url,
            category: item.category?.trim() || null,
            language: item.language.trim(),
            linkType: 'DOFOLLOW',
            turnaroundDays: 7,
            price: parseFloat(item.price),
            currency: item.currency?.trim() || 'ILS',
            domainAuthority: item.da != null && item.da !== '' ? parseInt(item.da, 10) : null,
            domainRating: item.dr != null && item.dr !== '' ? parseInt(item.dr, 10) : null,
            urlRating: item.ur != null && item.ur !== '' ? parseInt(item.ur, 10) : null,
            monthlyTraffic: item.monthlyTraffic != null && item.monthlyTraffic !== '' ? parseInt(item.monthlyTraffic, 10) : null,
            maxSlots: item.maxSlots != null && item.maxSlots !== '' ? parseInt(item.maxSlots, 10) : null,
            status: 'ACTIVE',
          },
        });
        results.created++;
      } catch (err) {
        results.errors.push({ row: i + 1, message: err.message });
      }
    }

    return NextResponse.json(results, { status: 201 });
  } catch (error) {
    console.error('Error bulk creating backlink listings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
