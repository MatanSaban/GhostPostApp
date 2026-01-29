import { redirect } from 'next/navigation';

export default async function AcceptInviteRedirect({ searchParams }) {
  const params = await searchParams;
  const token = params?.token || '';
  
  // Redirect to the actual accept-invite page in the auth folder
  if (token) {
    redirect(`/auth/accept-invite?token=${token}`);
  } else {
    redirect('/auth/accept-invite');
  }
}
