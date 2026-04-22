import { ThemeProvider } from '@/app/context/theme-context';
import { PageMeta } from '@/app/components/PageMeta';
import { createGenerateMetadata } from '@/lib/seo/metadata';

export const generateMetadata = createGenerateMetadata('/auth');

export default function AuthLayout({ children }) {
  return (
    <ThemeProvider>
      <PageMeta />
      {children}
    </ThemeProvider>
  );
}
