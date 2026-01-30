import { NextResponse } from 'next/server';
import { makePluginRequest } from '@/lib/wp-api-client';

/**
 * POST /api/sites/[id]/tools/clear-queue
 * Clear completed/failed items from the WebP conversion queue
 */
export async function POST(req, { params }) {
  try {
    const { id } = await params;

    const result = await makePluginRequest(id, 'media/clear-queue', 'POST');

    return NextResponse.json(result);
  } catch (error) {
    console.error('Clear queue error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to clear queue' },
      { status: 500 }
    );
  }
}
