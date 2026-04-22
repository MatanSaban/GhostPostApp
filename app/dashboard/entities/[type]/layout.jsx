import { createGenerateMetadata } from '@/lib/seo/metadata';

export const generateMetadata = createGenerateMetadata('/dashboard/entities/[type]');

export default function EntityTypeLayout({ children }) {
  return children;
}
