import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const SESSION_COOKIE = 'user_session';

export default async function NotFound() {
  const cookieStore = await cookies();
  const userId = cookieStore.get(SESSION_COOKIE)?.value;

  if (userId) {
    redirect('/dashboard');
  } else {
    redirect('/auth');
  }
}
