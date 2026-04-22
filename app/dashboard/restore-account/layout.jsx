import { createGenerateMetadata } from '@/lib/seo/metadata';

export const generateMetadata = createGenerateMetadata('/dashboard/restore-account');

export default function RestoreAccountLayout({ children }) {
  return children;
}
