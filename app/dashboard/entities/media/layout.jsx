import { createGenerateMetadata } from '@/lib/seo/metadata';

export const generateMetadata = createGenerateMetadata('/dashboard/entities/media');

export default function MediaLayout({ children }) {
  return children;
}
