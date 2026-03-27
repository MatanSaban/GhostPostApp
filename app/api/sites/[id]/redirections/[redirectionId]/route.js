import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * PUT /api/sites/[id]/redirections/[redirectionId]
 * Update a redirection.
 */
export async function PUT(request, { params }) {
  try {
    const { id, redirectionId } = await params;
    const body = await request.json();
    
    const redirection = await prisma.redirection.findFirst({
      where: { id: redirectionId, siteId: id },
    });
    
    if (!redirection) {
      return NextResponse.json({ error: 'Redirection not found' }, { status: 404 });
    }
    
    const updateData = {};
    
    if (body.sourceUrl !== undefined) {
      updateData.sourceUrl = body.sourceUrl.startsWith('/') ? body.sourceUrl : `/${body.sourceUrl}`;
    }
    if (body.targetUrl !== undefined) {
      updateData.targetUrl = body.targetUrl;
    }
    if (body.type !== undefined) {
      const typeMap = { '301': 'PERMANENT', '302': 'TEMPORARY', '307': 'FOUND', 'PERMANENT': 'PERMANENT', 'TEMPORARY': 'TEMPORARY', 'FOUND': 'FOUND' };
      updateData.type = typeMap[String(body.type)] || redirection.type;
    }
    if (body.isActive !== undefined) {
      updateData.isActive = body.isActive;
    }
    
    const updated = await prisma.redirection.update({
      where: { id: redirectionId },
      data: updateData,
    });
    
    return NextResponse.json(updated);
    
  } catch (error) {
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'A redirect for this source URL already exists' },
        { status: 409 }
      );
    }
    console.error('Error updating redirection:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/sites/[id]/redirections/[redirectionId]
 * Delete a redirection.
 */
export async function DELETE(request, { params }) {
  try {
    const { id, redirectionId } = await params;
    
    const redirection = await prisma.redirection.findFirst({
      where: { id: redirectionId, siteId: id },
    });
    
    if (!redirection) {
      return NextResponse.json({ error: 'Redirection not found' }, { status: 404 });
    }
    
    await prisma.redirection.delete({
      where: { id: redirectionId },
    });
    
    return NextResponse.json({ success: true });
    
  } catch (error) {
    console.error('Error deleting redirection:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
