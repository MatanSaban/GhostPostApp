import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const SESSION_COOKIE = 'user_session';
const REG_DONE_COOKIE = 'reg_done';

export async function POST() {
  try {
    const cookieStore = await cookies();

    cookieStore.delete(SESSION_COOKIE);
    cookieStore.delete(REG_DONE_COOKIE);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Failed to logout' },
      { status: 500 }
    );
  }
}
