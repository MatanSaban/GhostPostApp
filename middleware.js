import { NextResponse } from "next/server";

const LOCALE_COOKIE = "ghostseo-locale";
const SESSION_COOKIE = "user_session";
const REG_DONE_COOKIE = "reg_done";

/**
 * Get default locale based on domain
 * app.ghostpost.co.il → Hebrew (he)
 * app.ghostpost.com → English (en)
 */
function getDefaultLocaleForDomain(host) {
  if (host?.includes("ghostpost.co.il")) {
    return "he";
  }
  return "en";
}

// Paths a draft (mid-registration) user is allowed to visit. Everything else
// bounces them back to /auth/register so they can finish.
function isDraftAllowedPath(pathname) {
  if (pathname.startsWith("/auth/register")) return true;
  if (pathname.startsWith("/auth/logout")) return true;
  return false;
}

export function middleware(request) {
  const { pathname } = request.nextUrl;

  const sessionCookie = request.cookies.get(SESSION_COOKIE);
  const regDoneCookie = request.cookies.get(REG_DONE_COOKIE);

  // Draft guard: a sessioned user whose registration hasn't completed yet
  // can only access /auth/register (and logout).
  if (sessionCookie && regDoneCookie?.value !== "1" && !isDraftAllowedPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/register";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();

  // Locale cookie seeding.
  const localeCookie = request.cookies.get(LOCALE_COOKIE);
  if (!localeCookie) {
    const host = request.headers.get("host") || "";
    const defaultLocale = getDefaultLocaleForDomain(host);

    response.cookies.set(LOCALE_COOKIE, defaultLocale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1 year
      sameSite: "lax",
    });
  }

  return response;
}

export const config = {
  matcher: [
    // Only match paths that need middleware processing
    "/((?!_next|api|static|.*\\..*).*)",
  ],
};
