import { createGenerateMetadata } from '@/lib/seo/metadata';

export const generateMetadata = createGenerateMetadata('/dashboard/visual-editor');

export default function VisualEditorLayout({ children }) {
  return children;
}
