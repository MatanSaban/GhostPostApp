import { createGenerateMetadata } from '@/lib/seo/metadata';

export const generateMetadata = createGenerateMetadata('/dashboard/entities/sitemaps/[id]');

export default function SitemapDetailLayout({ children }) {
  return children;
}
