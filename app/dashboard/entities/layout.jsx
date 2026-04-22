import { createGenerateMetadata } from '@/lib/seo/metadata';

export const generateMetadata = createGenerateMetadata('/dashboard/entities');

export default function EntitiesLayout({ children }) {
  return children;
}
