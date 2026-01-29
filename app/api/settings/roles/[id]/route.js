import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember, memberHasPermission } from '@/lib/auth-permissions';

// GET - Fetch a specific role
export async function GET(request, { params }) {
  try {
    const result = await getCurrentAccountMember();
    if (!result.authorized) {
      return NextResponse.json({ error: result.error || 'Unauthorized' }, { status: 401 });
    }

    const member = result.member;

    if (!member.isOwner && !memberHasPermission(member, 'SETTINGS_ROLES', 'VIEW')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    const role = await prisma.role.findFirst({
      where: {
        id,
        accountId: member.accountId,
      },
      include: {
        _count: {
          select: { members: true },
        },
      },
    });

    if (!role) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    return NextResponse.json({
      role: {
        id: role.id,
        name: role.name,
        description: role.description,
        permissions: role.permissions,
        isSystemRole: role.isSystemRole,
        membersCount: role._count.members,
        createdAt: role.createdAt.toISOString(),
        updatedAt: role.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error fetching role:', error);
    return NextResponse.json({ error: 'Failed to fetch role' }, { status: 500 });
  }
}

// PUT - Update a role
export async function PUT(request, { params }) {
  try {
    const result = await getCurrentAccountMember();
    if (!result.authorized) {
      return NextResponse.json({ error: result.error || 'Unauthorized' }, { status: 401 });
    }

    const member = result.member;

    if (!member.isOwner && !memberHasPermission(member, 'SETTINGS_ROLES', 'EDIT')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, description, permissions } = body;

    // Find the role
    const existingRole = await prisma.role.findFirst({
      where: {
        id,
        accountId: member.accountId,
      },
    });

    if (!existingRole) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    // Check for duplicate name (if name is being changed)
    if (name && name.trim() !== existingRole.name) {
      const duplicateRole = await prisma.role.findFirst({
        where: {
          accountId: member.accountId,
          name: name.trim(),
          id: { not: id },
        },
      });

      if (duplicateRole) {
        return NextResponse.json({ error: 'A role with this name already exists' }, { status: 400 });
      }
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (permissions !== undefined) updateData.permissions = permissions;

    const updatedRole = await prisma.role.update({
      where: { id },
      data: updateData,
      include: {
        _count: {
          select: { members: true },
        },
      },
    });

    return NextResponse.json({
      role: {
        id: updatedRole.id,
        name: updatedRole.name,
        description: updatedRole.description,
        permissions: updatedRole.permissions,
        isSystemRole: updatedRole.isSystemRole,
        membersCount: updatedRole._count.members,
        createdAt: updatedRole.createdAt.toISOString(),
        updatedAt: updatedRole.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error updating role:', error);
    return NextResponse.json({ error: 'Failed to update role' }, { status: 500 });
  }
}

// DELETE - Delete a role
export async function DELETE(request, { params }) {
  try {
    const result = await getCurrentAccountMember();
    if (!result.authorized) {
      return NextResponse.json({ error: result.error || 'Unauthorized' }, { status: 401 });
    }

    const member = result.member;

    if (!member.isOwner && !memberHasPermission(member, 'SETTINGS_ROLES', 'EDIT')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    // Find the role
    const role = await prisma.role.findFirst({
      where: {
        id,
        accountId: member.accountId,
      },
      include: {
        _count: {
          select: { members: true },
        },
      },
    });

    if (!role) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    // Prevent deletion of system roles
    if (role.isSystemRole) {
      return NextResponse.json({ error: 'Cannot delete system roles' }, { status: 400 });
    }

    // Prevent deletion if role has members
    if (role._count.members > 0) {
      return NextResponse.json(
        { error: 'Cannot delete role with assigned members. Please reassign members first.' },
        { status: 400 }
      );
    }

    await prisma.role.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting role:', error);
    return NextResponse.json({ error: 'Failed to delete role' }, { status: 500 });
  }
}
