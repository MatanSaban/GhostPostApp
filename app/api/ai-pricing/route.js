import { NextResponse } from 'next/server';
import { getAiPricing } from '@/lib/actions/ai-pricing';

export async function GET() {
  try {
    const pricing = await getAiPricing();
    return NextResponse.json(pricing);
  } catch (error) {
    console.error('[API /ai-pricing] Error:', error.message);
    return NextResponse.json({ error: 'Failed to fetch pricing' }, { status: 500 });
  }
}
