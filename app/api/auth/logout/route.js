import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const SESSION_COOKIE = 'user_session';
const TEMP_REG_COOKIE = 'temp_reg_id';

export async function POST() {
  try {
    const cookieStore = await cookies();
    
    // Clear session cookie
    cookieStore.delete(SESSION_COOKIE);
    
    // Also clear temp registration cookie if exists
    cookieStore.delete(TEMP_REG_COOKIE);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Failed to logout' },
      { status: 500 }
    );
  }
}
