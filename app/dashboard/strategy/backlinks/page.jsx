import { Link2 } from 'lucide-react';
import { PageHeader } from '../../components';
import { BacklinksAuditContent } from './components/BacklinksAuditContent';
import { getTranslations } from '@/i18n/server';

import { createGenerateMetadata } from '@/lib/seo/metadata';

export const generateMetadata = createGenerateMetadata('/dashboard/strategy/backlinks');

export default async function BacklinkAuditPage() {
  const t = await getTranslations();

  return (
    <>
      <PageHeader
        icon={<Link2 size={24} />}
        title={t('backlinkAudit.title')}
        subtitle={t('backlinkAudit.subtitle')}
        dataOnboarding="page-backlink-audit"
      />

      <BacklinksAuditContent />
    </>
  );
}
