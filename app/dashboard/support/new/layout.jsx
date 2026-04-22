import { createGenerateMetadata } from '@/lib/seo/metadata';

export const generateMetadata = createGenerateMetadata('/dashboard/support/new');

export default function SupportNewLayout({ children }) {
  return children;
}
