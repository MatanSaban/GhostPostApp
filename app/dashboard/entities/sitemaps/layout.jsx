import { createGenerateMetadata } from '@/lib/seo/metadata';

export const generateMetadata = createGenerateMetadata('/dashboard/entities/sitemaps');

export default function SitemapsLayout({ children }) {
  return children;
}
