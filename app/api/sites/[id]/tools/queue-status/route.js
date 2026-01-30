import { NextResponse } from 'next/server';
import { makePluginRequest } from '@/lib/wp-api-client';

/**
 * GET /api/sites/[id]/tools/queue-status
 * Get the current WebP conversion queue status
 */
export async function GET(req, { params }) {
  try {
    const { id } = await params;

    const result = await makePluginRequest(id, 'media/queue-status', 'GET');

    return NextResponse.json(result);
  } catch (error) {
    console.error('Queue status error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get queue status' },
      { status: 500 }
    );
  }
}
