import { createGenerateMetadata } from '@/lib/seo/metadata';

export const generateMetadata = createGenerateMetadata('/dashboard/support');

export default function SupportLayout({ children }) {
  return children;
}
