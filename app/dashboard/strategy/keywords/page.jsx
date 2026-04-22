import { Search } from 'lucide-react';
import { PageHeader } from '../../components';
import { KeywordsContent } from './components/KeywordsContent';
import { getTranslations } from '@/i18n/server';

import { createGenerateMetadata } from '@/lib/seo/metadata';

export const generateMetadata = createGenerateMetadata('/dashboard/strategy/keywords');

export default async function KeywordStrategyPage() {
  const t = await getTranslations();

  return (
    <>
      <PageHeader
        icon={Search}
        title={t('keywordStrategy.title')}
        subtitle={t('keywordStrategy.subtitle')}
        dataOnboarding="page-keywords"
      />

      <KeywordsContent />
    </>
  );
}
