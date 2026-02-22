import { PageHeader } from '../../components';
import { KeywordsContent } from './components/KeywordsContent';
import { getTranslations } from '@/i18n/server';

export default async function KeywordStrategyPage() {
  const t = await getTranslations();

  return (
    <>
      <PageHeader
        title={t('keywordStrategy.title')}
        subtitle={t('keywordStrategy.subtitle')}
      />

      <KeywordsContent />
    </>
  );
}
