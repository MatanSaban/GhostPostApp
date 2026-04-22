import { createGenerateMetadata } from '@/lib/seo/metadata';

export const generateMetadata = createGenerateMetadata('/dashboard/technical-seo/site-audit');

export default function SiteAuditLayout({ children }) {
  return children;
}
