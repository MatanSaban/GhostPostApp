import { Link as LinkIcon } from 'lucide-react';
import { PageHeader } from '../components';
import { BacklinksContent } from './components/BacklinksContent';
import { getTranslations } from '@/i18n/server';

import { createGenerateMetadata } from '@/lib/seo/metadata';

export const generateMetadata = createGenerateMetadata('/dashboard/backlinks');

export default async function BacklinksPage() {
  const t = await getTranslations();

  return (
    <>
      <PageHeader
        icon={LinkIcon}
        title={t('backlinks.title')}
        subtitle={t('backlinks.subtitle')}
      />

      <BacklinksContent />
    </>
  );
}
