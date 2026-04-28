import { Network } from 'lucide-react';
import { PageHeader } from '../../components';
import { ClustersView } from './components';
import { getTranslations } from '@/i18n/server';

import { createGenerateMetadata } from '@/lib/seo/metadata';

export const generateMetadata = createGenerateMetadata('/dashboard/strategy/clusters');

export default async function ClustersPage() {
  const t = await getTranslations();

  const translations = {
    title: t('clusters.title'),
    subtitle: t('clusters.subtitle'),
    rediscover: t('clusters.rediscover'),
    rediscovering: t('clusters.rediscovering'),
    noClusters: t('clusters.noClusters'),
    noClustersHint: t('clusters.noClustersHint'),
    noResults: t('clusters.noResults'),
    discoverNow: t('clusters.discoverNow'),
    noPillar: t('clusters.noPillar'),
    members: t('clusters.members'),
    memberOne: t('clusters.memberOne'),
    confidence: t('clusters.confidence'),
    filters: {
      all: t('clusters.filters.all'),
      discovered: t('clusters.filters.discovered'),
      confirmed: t('clusters.filters.confirmed'),
      rejected: t('clusters.filters.rejected'),
    },
    status: {
      DISCOVERED: t('clusters.status.DISCOVERED'),
      CONFIRMED: t('clusters.status.CONFIRMED'),
      REJECTED: t('clusters.status.REJECTED'),
    },
    actions: {
      confirm: t('clusters.actions.confirm'),
      reject: t('clusters.actions.reject'),
      edit: t('clusters.actions.edit'),
      save: t('clusters.actions.save'),
      cancel: t('clusters.actions.cancel'),
      setPillar: t('clusters.actions.setPillar'),
    },
    edit: {
      title: t('clusters.edit.title'),
      nameLabel: t('clusters.edit.nameLabel'),
      namePlaceholder: t('clusters.edit.namePlaceholder'),
      keywordLabel: t('clusters.edit.keywordLabel'),
      keywordPlaceholder: t('clusters.edit.keywordPlaceholder'),
      pillarLabel: t('clusters.edit.pillarLabel'),
      pillarHint: t('clusters.edit.pillarHint'),
      noPillarOption: t('clusters.edit.noPillarOption'),
    },
    errors: {
      loadFailed: t('clusters.errors.loadFailed'),
      updateFailed: t('clusters.errors.updateFailed'),
      discoverFailed: t('clusters.errors.discoverFailed'),
    },
  };

  return (
    <>
      <PageHeader
        icon={<Network size={24} />}
        title={t('clusters.title')}
        subtitle={t('clusters.subtitle')}
        dataOnboarding="page-clusters"
      />
      <ClustersView translations={translations} />
    </>
  );
}
