import { createGenerateMetadata } from '@/lib/seo/metadata';

export const generateMetadata = createGenerateMetadata('/dashboard/notifications');

export default function NotificationsLayout({ children }) {
  return children;
}
