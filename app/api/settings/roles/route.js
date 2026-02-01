import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember, memberHasPermission } from '@/lib/auth-permissions';

// GET - Fetch all roles for the account
export async function GET(request) {
  try {
    const result = await getCurrentAccountMember();
    if (!result.authorized) {
      return NextResponse.json({ error: result.error || 'Unauthorized' }, { status: 401 });
    }

    const member = result.member;

    // Check permission - use SETTINGS_ROLES for viewing roles settings
    if (!member.isOwner && !memberHasPermission(member, 'SETTINGS_ROLES', 'VIEW')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const roles = await prisma.role.findMany({
      where: { accountId: member.accountId },
      include: {
        _count: {
          select: { members: true },
        },
      },
      orderBy: [
        { isSystemRole: 'desc' },
        { name: 'asc' },
      ],
    });

    const formattedRoles = roles.map(role => ({
      id: role.id,
      key: role.key,
      name: role.name,
      description: role.description,
      permissions: role.permissions,
      isSystemRole: role.isSystemRole,
      membersCount: role._count.members,
      createdAt: role.createdAt.toISOString(),
      updatedAt: role.updatedAt.toISOString(),
    }));

    return NextResponse.json({ roles: formattedRoles });
  } catch (error) {
    console.error('Error fetching roles:', error);
    return NextResponse.json({ error: 'Failed to fetch roles' }, { status: 500 });
  }
}

// POST - Create a new role
export async function POST(request) {
  try {
    const result = await getCurrentAccountMember();
    if (!result.authorized) {
      return NextResponse.json({ error: result.error || 'Unauthorized' }, { status: 401 });
    }

    const member = result.member;

    // Check permission
    if (!member.isOwner && !memberHasPermission(member, 'SETTINGS_ROLES', 'EDIT')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { key, name, description, permissions = [] } = body;

    if (!key || typeof key !== 'string' || key.trim().length === 0) {
      return NextResponse.json({ error: 'Role key is required' }, { status: 400 });
    }

    // Validate key format (English only, lowercase, alphanumeric with underscores/hyphens)
    const keyRegex = /^[a-z0-9_-]+$/;
    if (!keyRegex.test(key.trim())) {
      return NextResponse.json({ error: 'Role key must contain only lowercase English letters, numbers, underscores, and hyphens' }, { status: 400 });
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Role name is required' }, { status: 400 });
    }

    // Check for duplicate key
    const existingKeyRole = await prisma.role.findFirst({
      where: {
        accountId: member.accountId,
        key: key.trim(),
      },
    });

    if (existingKeyRole) {
      return NextResponse.json({ error: 'A role with this key already exists' }, { status: 400 });
    }

    // Check for duplicate name
    const existingRole = await prisma.role.findFirst({
      where: {
        accountId: member.accountId,
        name: name.trim(),
      },
    });

    if (existingRole) {
      return NextResponse.json({ error: 'A role with this name already exists' }, { status: 400 });
    }

    const newRole = await prisma.role.create({
      data: {
        account: { connect: { id: member.accountId } },
        key: key.trim(),
        name: name.trim(),
        description: description?.trim() || null,
        permissions,
        isSystemRole: false,
      },
    });

    return NextResponse.json({
      role: {
        id: newRole.id,
        key: newRole.key,
        name: newRole.name,
        description: newRole.description,
        permissions: newRole.permissions,
        isSystemRole: newRole.isSystemRole,
        membersCount: 0,
        createdAt: newRole.createdAt.toISOString(),
        updatedAt: newRole.updatedAt.toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating role:', error);
    return NextResponse.json({ error: 'Failed to create role' }, { status: 500 });
  }
}
