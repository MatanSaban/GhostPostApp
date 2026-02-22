import { PageHeader } from '../components';
import { BacklinksContent } from './components/BacklinksContent';
import { getTranslations } from '@/i18n/server';

export default async function BacklinksPage() {
  const t = await getTranslations();

  return (
    <>
      <PageHeader
        title={t('backlinks.title')}
        subtitle={t('backlinks.subtitle')}
      />

      <BacklinksContent />
    </>
  );
}
