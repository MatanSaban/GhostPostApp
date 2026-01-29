import { NextResponse } from 'next/server';
import { getCurrentAccountMember } from '@/lib/auth-permissions';

/**
 * GET - Get current user's permissions for the selected account
 * Returns the user's role, permissions array, and helper flags
 */
export async function GET() {
  try {
    const { authorized, member, error } = await getCurrentAccountMember();

    if (!authorized) {
      return NextResponse.json({ error }, { status: 401 });
    }

    // Check if user is owner (either by role name or isOwner flag)
    const isOwner = member.isOwner || member.role?.name?.toLowerCase() === 'owner';

    return NextResponse.json({
      role: member.role ? {
        id: member.role.id,
        name: member.role.name,
        permissions: member.role.permissions || [],
      } : null,
      isOwner,
      permissions: isOwner ? ['*'] : (member.role?.permissions || []),
    });
  } catch (error) {
    console.error('Error fetching user permissions:', error);
    return NextResponse.json({ error: 'Failed to fetch permissions' }, { status: 500 });
  }
}
