import { Globe } from 'lucide-react';
import { PageHeader } from '../components';
import { MyWebsitesContent } from './components/MyWebsitesContent';
import { getTranslations } from '@/i18n/server';

import { createGenerateMetadata } from '@/lib/seo/metadata';

export const generateMetadata = createGenerateMetadata('/dashboard/my-websites');

export default async function MyWebsitesPage() {
  const t = await getTranslations();

  return (
    <>
      <PageHeader
        icon={Globe}
        title={t('myWebsites.title')}
        subtitle={t('myWebsites.subtitle')}
        dataOnboarding="page-my-websites"
      />

      <MyWebsitesContent />
    </>
  );
}
