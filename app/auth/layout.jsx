import { ThemeProvider } from '@/app/context/theme-context';

export const metadata = {
  title: 'Ghost Post - Authentication',
  description: 'Sign in or create an account for Ghost Post Platform',
};

export default function AuthLayout({ children }) {
  return (
    <ThemeProvider>
      {children}
    </ThemeProvider>
  );
}
