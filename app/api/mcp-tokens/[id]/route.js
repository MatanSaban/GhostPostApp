import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentAccountMember, memberHasPermission } from '@/lib/auth-permissions';

// DELETE - Revoke an MCP token (sets revokedAt; the row is kept for audit)
export async function DELETE(request, { params }) {
  try {
    const result = await getCurrentAccountMember();
    if (!result.authorized) {
      return NextResponse.json({ error: result.error || 'Unauthorized' }, { status: 401 });
    }
    const member = result.member;
    if (!member.accountId) {
      return NextResponse.json({ error: 'No account context' }, { status: 400 });
    }
    if (!member.isOwner && !memberHasPermission(member, 'SETTINGS_INTEGRATIONS', 'EDIT')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    // Scope the lookup to the caller's account — never revoke across accounts.
    const token = await prisma.mcpToken.findFirst({
      where: { id, accountId: member.accountId },
      select: { id: true, revokedAt: true },
    });
    if (!token) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 });
    }

    // Idempotent: an already-revoked token keeps its original revokedAt.
    if (token.revokedAt) {
      return NextResponse.json({ ok: true, revokedAt: token.revokedAt });
    }

    const updated = await prisma.mcpToken.update({
      where: { id: token.id },
      data: { revokedAt: new Date() },
    });

    return NextResponse.json({ ok: true, revokedAt: updated.revokedAt });
  } catch (error) {
    console.error('Failed to revoke MCP token:', error);
    return NextResponse.json({ error: 'Failed to revoke MCP token' }, { status: 500 });
  }
}
