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
      rootsOnly: t('clusters.filters.rootsOnly'),
    },
    viewMode: {
      list: t('clusters.viewMode.list'),
      graph: t('clusters.viewMode.graph'),
    },
    graph: {
      zoomIn: t('clusters.graph.zoomIn'),
      zoomOut: t('clusters.graph.zoomOut'),
      resetView: t('clusters.graph.resetView'),
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
      expand: t('clusters.actions.expand'),
      delete: t('clusters.actions.delete'),
      confirmDelete: t('clusters.actions.confirmDelete'),
      promoteToAnchor: t('clusters.actions.promoteToAnchor'),
      detachFromParent: t('clusters.actions.detachFromParent'),
      discoverSubclusters: t('clusters.actions.discoverSubclusters'),
      discoveringSubclusters: t('clusters.actions.discoveringSubclusters'),
    },
    tree: {
      depthLabel: t('clusters.tree.depthLabel'),
      expand: t('clusters.tree.expand'),
      collapse: t('clusters.tree.collapse'),
      childCount: t('clusters.tree.childCount'),
      childCountPlural: t('clusters.tree.childCountPlural'),
      breadcrumbSeparator: t('clusters.tree.breadcrumbSeparator'),
    },
    promote: {
      title: t('clusters.promote.title'),
      intro: t('clusters.promote.intro'),
      anchorLabel: t('clusters.promote.anchorLabel'),
      nameLabel: t('clusters.promote.nameLabel'),
      namePlaceholder: t('clusters.promote.namePlaceholder'),
      keywordLabel: t('clusters.promote.keywordLabel'),
      keywordPlaceholder: t('clusters.promote.keywordPlaceholder'),
      movedMembersLabel: t('clusters.promote.movedMembersLabel'),
      movedMembersHint: t('clusters.promote.movedMembersHint'),
      noMovedMembers: t('clusters.promote.noMovedMembers'),
      confirm: t('clusters.promote.confirm'),
    },
    demote: {
      modalTitle: t('clusters.demote.modalTitle'),
      intro: t('clusters.demote.intro'),
      cascadeKeep: t('clusters.demote.cascadeKeep'),
      cascadeDetach: t('clusters.demote.cascadeDetach'),
      confirm: t('clusters.demote.confirm'),
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
      deleteFailed: t('clusters.errors.deleteFailed'),
      staleConflict: t('clusters.errors.staleConflict'),
      cycleDetected: t('clusters.errors.cycleDetected'),
      depthExceeded: t('clusters.errors.depthExceeded'),
      pillarConflict: t('clusters.errors.pillarConflict'),
      pillarNotMember: t('clusters.errors.pillarNotMember'),
      orphanChildren: t('clusters.errors.orphanChildren'),
      promoteFailed: t('clusters.errors.promoteFailed'),
      demoteFailed: t('clusters.errors.demoteFailed'),
      subDiscoverFailed: t('clusters.errors.subDiscoverFailed'),
      subDiscoverNoneFound: t('clusters.errors.subDiscoverNoneFound'),
    },
    health: {
      loading: t('clusters.health.loading'),
      healthy: t('clusters.health.healthy'),
      issues: t('clusters.health.issues'),
      more: t('clusters.health.more'),
      linkGaps: {
        title: t('clusters.health.linkGaps.title'),
        severity: {
          HIGH: t('clusters.health.linkGaps.severity.HIGH'),
          MEDIUM: t('clusters.health.linkGaps.severity.MEDIUM'),
          LOW: t('clusters.health.linkGaps.severity.LOW'),
        },
        types: {
          PARENT: {
            title: t('clusters.health.linkGaps.types.PARENT.title'),
            description: t('clusters.health.linkGaps.types.PARENT.description'),
          },
          ANCESTOR: {
            title: t('clusters.health.linkGaps.types.ANCESTOR.title'),
            description: t('clusters.health.linkGaps.types.ANCESTOR.description'),
          },
          BRAND: {
            title: t('clusters.health.linkGaps.types.BRAND.title'),
            description: t('clusters.health.linkGaps.types.BRAND.description'),
          },
          SIBLING: {
            title: t('clusters.health.linkGaps.types.SIBLING.title'),
            description: t('clusters.health.linkGaps.types.SIBLING.description'),
          },
        },
        fix: {
          button: t('clusters.health.linkGaps.fix.button'),
          tooltip: t('clusters.health.linkGaps.fix.tooltip'),
          loading: t('clusters.health.linkGaps.fix.loading'),
          fixed: t('clusters.health.linkGaps.fix.fixed'),
          retry: t('clusters.health.linkGaps.fix.retry'),
          errors: {
            pluginDisconnected: t('clusters.health.linkGaps.fix.errors.pluginDisconnected'),
            noMatch: t('clusters.health.linkGaps.fix.errors.noMatch'),
            aiFailed: t('clusters.health.linkGaps.fix.errors.aiFailed'),
            generic: t('clusters.health.linkGaps.fix.errors.generic'),
          },
        },
      },
      cannibalizations: {
        title: t('clusters.health.cannibalizations.title'),
      },
      staleness: {
        title: t('clusters.health.staleness.title'),
        daysAgo: t('clusters.health.staleness.daysAgo'),
      },
    },
    orphans: {
      title: t('clusters.orphans.title'),
      count: t('clusters.orphans.count'),
      capped: t('clusters.orphans.capped'),
      selectedCount: t('clusters.orphans.selectedCount'),
      selectAll: t('clusters.orphans.selectAll'),
      actions: {
        assign: t('clusters.orphans.actions.assign'),
        create: t('clusters.orphans.actions.create'),
        clear: t('clusters.orphans.actions.clear'),
      },
      assignModal: {
        title: t('clusters.orphans.assignModal.title'),
        label: t('clusters.orphans.assignModal.label'),
        placeholder: t('clusters.orphans.assignModal.placeholder'),
        noConfirmed: t('clusters.orphans.assignModal.noConfirmed'),
        confirm: t('clusters.orphans.assignModal.confirm'),
      },
      createModal: {
        title: t('clusters.orphans.createModal.title'),
        nameLabel: t('clusters.orphans.createModal.nameLabel'),
        namePlaceholder: t('clusters.orphans.createModal.namePlaceholder'),
        keywordLabel: t('clusters.orphans.createModal.keywordLabel'),
        keywordPlaceholder: t('clusters.orphans.createModal.keywordPlaceholder'),
        pillarLabel: t('clusters.orphans.createModal.pillarLabel'),
        noPillarOption: t('clusters.orphans.createModal.noPillarOption'),
        memberCount: t('clusters.orphans.createModal.memberCount'),
        confirm: t('clusters.orphans.createModal.confirm'),
      },
      errors: {
        loadFailed: t('clusters.orphans.errors.loadFailed'),
        assignFailed: t('clusters.orphans.errors.assignFailed'),
        createFailed: t('clusters.orphans.errors.createFailed'),
      },
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
