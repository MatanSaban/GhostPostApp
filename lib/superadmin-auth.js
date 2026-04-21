import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

const SESSION_COOKIE = 'user_session';

/**
 * Verify the requesting user is a SuperAdmin.
 * Reads the user_session cookie, looks up the user, and returns
 * a minimal user object iff isSuperAdmin === true.
 *
 * Returns null when unauthenticated, user not found, inactive,
 * or not a SuperAdmin. Callers should respond with 401 in that case.
 *
 * NOTE: This intentionally checks the *real* admin cookie, not any
 * impersonation cookie - admin endpoints must always run as the admin.
 *
 * @returns {Promise<{id:string, email:string, firstName:string|null, lastName:string|null}|null>}
 */
export async function verifySuperAdmin() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get(SESSION_COOKIE)?.value;

    if (!userId) return null;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        isSuperAdmin: true,
      },
    });

    if (!user || !user.isActive || !user.isSuperAdmin) return null;

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  } catch (error) {
    console.error('[superadmin-auth] verify error:', error);
    return null;
  }
}
