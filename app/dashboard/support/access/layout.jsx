import { createGenerateMetadata } from '@/lib/seo/metadata';

export const generateMetadata = createGenerateMetadata('/dashboard/support/access');

export default function SupportAccessLayout({ children }) {
  return children;
}
