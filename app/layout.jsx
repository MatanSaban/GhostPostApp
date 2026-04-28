import './globals.css';
import { cookies } from 'next/headers';
import { ThemeProvider } from '@/app/context/theme-context';
import { LocaleProvider } from '@/app/context/locale-context';
import { UserProvider } from '@/app/context/user-context';
import { SiteProvider } from '@/app/context/site-context';
import { BackgroundTasksProvider } from '@/app/context/background-tasks-context';
import { LimitGuardProvider } from '@/app/context/limit-guard-context';
import { NotificationsProvider } from '@/app/context/notifications-context';
import { AgentProvider } from '@/app/context/agent-context';
import { SiteLocaleSync } from '@/app/components/SiteLocaleSync';
import { BackgroundTasksNotification } from '@/app/components/ui/background-tasks-notification';
import { locales, defaultLocale, getDirection } from '@/i18n/config';
import { buildRootMetadata, defaultViewport } from '@/lib/seo/metadata';

export async function generateMetadata() {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get('ghostseo-locale');
  const locale = localeCookie?.value && locales.includes(localeCookie.value)
    ? localeCookie.value
    : defaultLocale;
  return buildRootMetadata({ locale });
}

export const viewport = defaultViewport;

export default async function RootLayout({ children }) {
  // Read locale from cookie server-side
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get('ghostseo-locale');
  const locale = localeCookie?.value && locales.includes(localeCookie.value) 
    ? localeCookie.value 
    : defaultLocale;
  const direction = getDirection(locale);

  return (
    <html lang={locale} dir={direction} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&family=Rubik:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>
        <LocaleProvider>
          <ThemeProvider>
            <UserProvider>
              <LimitGuardProvider>
              <SiteProvider>
                <BackgroundTasksProvider>
                  <NotificationsProvider>
                    <AgentProvider>
                    <SiteLocaleSync />
                    {children}
                    <BackgroundTasksNotification />
                    </AgentProvider>
                  </NotificationsProvider>
                </BackgroundTasksProvider>
              </SiteProvider>
              </LimitGuardProvider>
            </UserProvider>
          </ThemeProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
