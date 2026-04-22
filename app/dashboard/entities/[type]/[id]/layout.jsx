import { createGenerateMetadata } from '@/lib/seo/metadata';

export const generateMetadata = createGenerateMetadata('/dashboard/entities/[type]/[id]');

export default function EntityDetailLayout({ children }) {
  return children;
}
