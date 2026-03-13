import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember, memberHasPermission } from '@/lib/auth-permissions';

/**
 * GET - Get all members assigned to a site
 * Returns both assigned members and available members (not yet assigned)
 */
export async function GET(request, { params }) {
  try {
    const result = await getCurrentAccountMember();
    if (!result.authorized) {
      return NextResponse.json({ error: result.error || 'Unauthorized' }, { status: 401 });
    }

    const member = result.member;
    const { id: siteId } = await params;

    // Check permission - need SETTINGS_TEAM_VIEW to view site team
    if (!member.isOwner && !memberHasPermission(member, 'SETTINGS_TEAM', 'VIEW')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Verify the site belongs to the account
    const site = await prisma.site.findFirst({
      where: {
        id: siteId,
        accountId: member.accountId,
      },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Get all account members (excluding removed and the owner)
    const allAccountMembers = await prisma.accountMember.findMany({
      where: {
        accountId: member.accountId,
        status: { not: 'REMOVED' },
        isOwner: false, // Owners have access to all sites, no need to assign
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            image: true,
          },
        },
        role: {
          select: {
            id: true,
            name: true,
          },
        },
        siteMembers: {
          where: { siteId },
          select: {
            id: true,
            assignedAt: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    // Format the response - separate assigned and available members
    const assignedMembers = [];
    const availableMembers = [];

    for (const m of allAccountMembers) {
      const memberData = {
        id: m.id,
        userId: m.userId,
        status: m.status,
        email: m.user?.email || m.inviteEmail,
        firstName: m.user?.firstName || null,
        lastName: m.user?.lastName || null,
        image: m.user?.image || null,
        role: m.role,
      };

      if (m.siteMembers.length > 0) {
        assignedMembers.push({
          ...memberData,
          siteMemberId: m.siteMembers[0].id,
          assignedAt: m.siteMembers[0].assignedAt?.toISOString() || null,
        });
      } else {
        availableMembers.push(memberData);
      }
    }

    return NextResponse.json({
      assignedMembers,
      availableMembers,
      site: {
        id: site.id,
        name: site.name,
      },
    });
  } catch (error) {
    console.error('Error fetching site members:', error);
    return NextResponse.json({ error: 'Failed to fetch site members' }, { status: 500 });
  }
}

/**
 * POST - Assign a member to the site
 */
export async function POST(request, { params }) {
  try {
    const result = await getCurrentAccountMember();
    if (!result.authorized) {
      return NextResponse.json({ error: result.error || 'Unauthorized' }, { status: 401 });
    }

    const member = result.member;
    const { id: siteId } = await params;
    const body = await request.json();
    const { accountMemberId } = body;

    // Check permission - need SETTINGS_TEAM_EDIT to manage site team
    if (!member.isOwner && !memberHasPermission(member, 'SETTINGS_TEAM', 'EDIT')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!accountMemberId) {
      return NextResponse.json({ error: 'accountMemberId is required' }, { status: 400 });
    }

    // Verify the site belongs to the account
    const site = await prisma.site.findFirst({
      where: {
        id: siteId,
        accountId: member.accountId,
      },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Verify the account member exists and belongs to the same account
    const accountMember = await prisma.accountMember.findFirst({
      where: {
        id: accountMemberId,
        accountId: member.accountId,
        status: { not: 'REMOVED' },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        role: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!accountMember) {
      return NextResponse.json({ error: 'Account member not found' }, { status: 404 });
    }

    // Don't allow assigning owners - they have access to all sites
    if (accountMember.isOwner) {
      return NextResponse.json({ error: 'Owners have access to all sites' }, { status: 400 });
    }

    // Check if already assigned
    const existingAssignment = await prisma.siteMember.findFirst({
      where: {
        siteId,
        accountMemberId,
      },
    });

    if (existingAssignment) {
      return NextResponse.json({ error: 'Member is already assigned to this site' }, { status: 400 });
    }

    // Create the site member assignment
    const siteMember = await prisma.siteMember.create({
      data: {
        siteId,
        accountMemberId,
        assignedBy: member.userId,
      },
    });

    return NextResponse.json({
      success: true,
      siteMember: {
        id: siteMember.id,
        accountMemberId: siteMember.accountMemberId,
        assignedAt: siteMember.assignedAt.toISOString(),
        member: {
          id: accountMember.id,
          userId: accountMember.userId,
          email: accountMember.user?.email || accountMember.inviteEmail,
          firstName: accountMember.user?.firstName || null,
          lastName: accountMember.user?.lastName || null,
          role: accountMember.role,
        },
      },
    });
  } catch (error) {
    console.error('Error assigning site member:', error);
    return NextResponse.json({ error: 'Failed to assign member' }, { status: 500 });
  }
}
