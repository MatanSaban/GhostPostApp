import { createGenerateMetadata } from '@/lib/seo/metadata';

export const generateMetadata = createGenerateMetadata('/dashboard/technical-seo/redirections');

export default function RedirectionsLayout({ children }) {
  return children;
}
