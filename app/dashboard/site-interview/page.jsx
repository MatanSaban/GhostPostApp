import { InterviewContent } from './components';
import { getTranslations } from '@/i18n/server';
import styles from './page.module.css';

export default async function SiteInterviewPage() {
  const t = await getTranslations();

  const interviewSteps = [
    { id: 1, label: t('siteInterview.progressSteps.businessInfo'), status: 'completed', iconName: 'Building2', statusLabel: t('siteInterview.status.complete') },
    { id: 2, label: t('siteInterview.progressSteps.targetAudience'), status: 'completed', iconName: 'Users', statusLabel: t('siteInterview.status.complete') },
    { id: 3, label: t('siteInterview.progressSteps.goals'), status: 'active', iconName: 'Target', statusLabel: t('siteInterview.status.inProgress') },
    { id: 4, label: t('siteInterview.progressSteps.brandVoice'), status: 'pending', iconName: 'Megaphone', statusLabel: t('siteInterview.status.pending') },
    { id: 5, label: t('siteInterview.progressSteps.contentStyle'), status: 'pending', iconName: 'PenTool', statusLabel: t('siteInterview.status.pending') },
  ];

  const sections = [
    {
      title: t('siteInterview.sections.businessInfo.title'),
      status: 'complete',
      statusLabel: t('siteInterview.status.complete'),
      questions: [
        { q: t('siteInterview.sections.businessInfo.q1'), a: t('siteInterview.sections.businessInfo.a1') },
        { q: t('siteInterview.sections.businessInfo.q2'), a: t('siteInterview.sections.businessInfo.a2') },
        { q: t('siteInterview.sections.businessInfo.q3'), a: t('siteInterview.sections.businessInfo.a3') },
      ]
    },
    {
      title: t('siteInterview.sections.seoGoals.title'),
      status: 'complete',
      statusLabel: t('siteInterview.status.complete'),
      questions: [
        { q: t('siteInterview.sections.seoGoals.q1'), a: t('siteInterview.sections.seoGoals.a1') },
        { q: t('siteInterview.sections.seoGoals.q2'), a: t('siteInterview.sections.seoGoals.a2') },
        { q: t('siteInterview.sections.seoGoals.q3'), a: t('siteInterview.sections.seoGoals.a3') },
      ]
    },
    {
      title: t('siteInterview.sections.contentStrategy.title'),
      status: 'in-progress',
      statusLabel: t('siteInterview.status.inProgress'),
      questions: [
        { q: t('siteInterview.sections.contentStrategy.q1'), a: t('siteInterview.sections.contentStrategy.a1') },
        { q: t('siteInterview.sections.contentStrategy.q2'), a: t('siteInterview.sections.contentStrategy.a2') },
        { q: t('siteInterview.sections.contentStrategy.q3'), a: t('siteInterview.sections.contentStrategy.a3'), incomplete: true },
      ]
    },
    {
      title: t('siteInterview.sections.technicalDetails.title'),
      status: 'pending',
      statusLabel: t('siteInterview.status.pending'),
      questions: [
        { q: t('siteInterview.sections.technicalDetails.q1'), a: t('siteInterview.sections.technicalDetails.notAnswered'), incomplete: true },
        { q: t('siteInterview.sections.technicalDetails.q2'), a: t('siteInterview.sections.technicalDetails.notAnswered'), incomplete: true },
        { q: t('siteInterview.sections.technicalDetails.q3'), a: t('siteInterview.sections.technicalDetails.notAnswered'), incomplete: true },
      ]
    }
  ];

  const aiInsights = [
    t('siteInterview.insights.educational'),
    t('siteInterview.insights.practical'),
    t('siteInterview.insights.caseStudies'),
  ];

  const translations = {
    interviewProgress: t('siteInterview.interviewProgress'),
    helpGhost: t('siteInterview.helpGhost'),
    startInterview: t('siteInterview.startInterview'),
    completion: t('siteInterview.completion'),
    goalsObjectives: t('siteInterview.goalsObjectives'),
    businessGoalsQuestion: t('siteInterview.businessGoalsQuestion'),
    goalsPlaceholder: t('siteInterview.goalsPlaceholder'),
    skipForNow: t('siteInterview.skipForNow'),
    nextQuestion: t('siteInterview.nextQuestion'),
    aiInsights: t('siteInterview.aiInsights'),
  };

  return (
    <div className={styles.container}>
      <InterviewContent 
        translations={translations}
        interviewSteps={interviewSteps}
        sections={sections}
        aiInsights={aiInsights}
      />
    </div>
  );
}
