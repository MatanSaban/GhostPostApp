import { UserCircle } from 'lucide-react';
import { InterviewContent } from './components';
import { PageHeader } from '../../components';
import { getTranslations } from '@/i18n/server';
import styles from './page.module.css';

import { createGenerateMetadata } from '@/lib/seo/metadata';

export const generateMetadata = createGenerateMetadata('/dashboard/strategy/site-profile');

export default async function SiteInterviewPage() {
  const t = await getTranslations();

  const translations = {
    interviewProgress: t('siteInterview.interviewProgress'),
    helpGhost: t('siteInterview.helpGhost'),
    startInterview: t('siteInterview.startInterview'),
    completion: t('siteInterview.completion'),
    statusComplete: t('siteInterview.status.complete'),
    statusInProgress: t('siteInterview.status.inProgress'),
    statusPending: t('siteInterview.status.pending'),
  };

  return (
    <div className={styles.container}>
      <PageHeader
        icon={<UserCircle size={24} />}
        title={t('strategy.siteProfile.title')}
        subtitle={t('strategy.siteProfile.cardDescription')}
      />
      <InterviewContent translations={translations} />
    </div>
  );
}
