import { createGenerateMetadata } from '@/lib/seo/metadata';

export const generateMetadata = createGenerateMetadata('/dashboard/support/[id]');

export default function SupportDetailLayout({ children }) {
  return children;
}
