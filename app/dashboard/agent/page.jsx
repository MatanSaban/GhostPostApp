import { getTranslations, getLocaleInfo } from '@/i18n/server';
import AgentPageContent from './AgentPageContent';

export default async function AgentPage() {
  const t = await getTranslations();
  const { dictionary } = await getLocaleInfo();

  const translations = {
    title: t('agent.title'),
    subtitle: t('agent.viewAll'),
    runAnalysis: t('agent.runAnalysis'),
    running: t('agent.running'),
    noInsights: t('agent.noInsights'),
    lastRun: t('agent.lastRun'),
    pendingApproval: t('agent.pendingApproval'),
    approve: t('agent.approve'),
    reject: t('agent.reject'),
    dismiss: t('agent.dismiss'),
    execute: t('agent.execute'),
    filterAll: t('common.all') || 'All',
    // Stat labels
    totalInsights: t('agent.totalInsights'),
    pendingReview: t('agent.pendingReview'),
    recentRuns: t('agent.recentRuns'),
    noInsightsFound: t('agent.noInsightsFound'),
    loadMore: t('agent.loadMore'),
    refresh: t('agent.refresh'),
    // Time ago
    minutesAgo: t('agent.minutesAgo'),
    hoursAgo: t('agent.hoursAgo'),
    daysAgo: t('agent.daysAgo'),
    // Pass nested objects for category/type/priority labels
    agent: dictionary.agent,
    entities: dictionary.entities,
  };

  return <AgentPageContent translations={translations} />;
}
