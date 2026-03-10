import { InterviewContent } from './components';
import { getTranslations } from '@/i18n/server';
import styles from './page.module.css';

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
      <InterviewContent translations={translations} />
    </div>
  );
}
