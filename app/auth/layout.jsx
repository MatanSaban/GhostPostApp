import { ThemeProvider } from '@/app/context/theme-context';

export const metadata = {
  title: 'Ghost Post - Authentication',
  description: 'Sign in or create an account for Ghost Post Platform',
  icons: {
    icon: '/ghostpost_logo.png',
    shortcut: '/ghostpost_logo.png',
    apple: '/ghostpost_logo.png',
  },
};

export default function AuthLayout({ children }) {
  return (
    <ThemeProvider>
      {children}
    </ThemeProvider>
  );
}
