import { PageHeader } from '../components';
import { MyWebsitesContent } from './components/MyWebsitesContent';
import { getTranslations } from '@/i18n/server';

export default async function MyWebsitesPage() {
  const t = await getTranslations();

  return (
    <>
      <PageHeader
        title={t('myWebsites.title')}
        subtitle={t('myWebsites.subtitle')}
      />

      <MyWebsitesContent />
    </>
  );
}
