import { PageHeader, PrimaryActionButton } from '../../components';
import { ContentPlannerView } from './components';
import Link from 'next/link';
import { getTranslations } from '@/i18n/server';

export default async function ContentPlannerPage() {
  const t = await getTranslations();

  const viewTranslations = {
    calendar: t('contentPlanner.calendar'),
    list: t('contentPlanner.list'),
    allContent: t('contentPlanner.allContent'),
    published: t('contentPlanner.published'),
    scheduled: t('contentPlanner.scheduled'),
    draft: t('contentPlanner.draft'),
    aiWizard: t('contentPlanner.aiWizard'),
    noPosts: t('contentPlanner.noPosts'),
    untitled: t('contentPlanner.untitled'),
    totalPosts: t('contentPlanner.totalPosts'),
    drafts: t('contentPlanner.drafts'),
    preview: {
      title: t('contentPlanner.preview.title'),
      noContent: t('contentPlanner.preview.noContent'),
      viewOnSite: t('contentPlanner.preview.viewOnSite'),
      campaign: t('contentPlanner.preview.campaign'),
      status: t('contentPlanner.preview.status'),
      type: t('contentPlanner.preview.type'),
      keyword: t('contentPlanner.preview.keyword'),
      date: t('contentPlanner.preview.date'),
      time: t('contentPlanner.preview.time'),
      source: t('contentPlanner.preview.source'),
    },
    dayNames: [
      t('time.sun'), t('time.mon'), t('time.tue'), t('time.wed'), 
      t('time.thu'), t('time.fri'), t('time.sat')
    ],
    months: [
      t('time.january'), t('time.february'), t('time.march'), t('time.april'),
      t('time.may'), t('time.june'), t('time.july'), t('time.august'),
      t('time.september'), t('time.october'), t('time.november'), t('time.december')
    ],
    campaigns: {
      title: t('contentPlanner.campaigns.title'),
      all: t('contentPlanner.campaigns.all'),
      noCampaigns: t('contentPlanner.campaigns.noCampaigns'),
      createFirst: t('contentPlanner.campaigns.createFirst'),
      createNew: t('contentPlanner.campaigns.createNew'),
      posts: t('contentPlanner.campaigns.posts'),
      active: t('contentPlanner.campaigns.active'),
      draft: t('contentPlanner.campaigns.draft'),
      paused: t('contentPlanner.campaigns.paused'),
      completed: t('contentPlanner.campaigns.completed'),
      editCampaign: t('contentPlanner.campaigns.editCampaign'),
      editPosts: t('contentPlanner.campaigns.editPosts'),
      createPosts: t('contentPlanner.campaigns.createPosts'),
      activate: t('contentPlanner.campaigns.activate'),
      pause: t('contentPlanner.campaigns.pause'),
      resume: t('contentPlanner.campaigns.resume'),
      activating: t('contentPlanner.campaigns.activating'),
      pausing: t('contentPlanner.campaigns.pausing'),
      activateConfirm: t('contentPlanner.campaigns.activateConfirm'),
      noPlan: t('contentPlanner.campaigns.noPlan'),
      progress: t('contentPlanner.campaigns.progress'),
      of: t('contentPlanner.campaigns.of'),
      postsPublished: t('contentPlanner.campaigns.postsPublished'),
      activationFailed: t('contentPlanner.campaigns.activationFailed'),
      pauseFailed: t('contentPlanner.campaigns.pauseFailed'),
      resumeFailed: t('contentPlanner.campaigns.resumeFailed'),
    },
    pipeline: {
      title: t('contentPlanner.pipeline.title'),
      noContent: t('contentPlanner.pipeline.noContent'),
      processing: t('contentPlanner.pipeline.processing'),
      readyToPublish: t('contentPlanner.pipeline.readyToPublish'),
      failed: t('contentPlanner.pipeline.failed'),
      retry: t('contentPlanner.pipeline.retry'),
      retryPublish: t('contentPlanner.pipeline.retryPublish'),
      retrying: t('contentPlanner.pipeline.retrying'),
      errorDetails: t('contentPlanner.pipeline.errorDetails'),
      attempts: t('contentPlanner.pipeline.attempts'),
      viewContent: t('contentPlanner.pipeline.viewContent'),
      generate: t('contentPlanner.pipeline.generate'),
      generating: t('contentPlanner.pipeline.generating'),
      titleSaveError: t('contentPlanner.pipeline.titleSaveError'),
      save: t('contentPlanner.pipeline.save'),
      cancel: t('contentPlanner.pipeline.cancel'),
      deletePost: t('contentPlanner.pipeline.deletePost'),
      deletePostTitle: t('contentPlanner.pipeline.deletePostTitle'),
      deletePostMessage: t('contentPlanner.pipeline.deletePostMessage'),
      deletePostConfirm: t('contentPlanner.pipeline.deletePostConfirm'),
      deletePostCancel: t('contentPlanner.pipeline.deletePostCancel'),
      campaignDeleted: t('contentPlanner.pipeline.campaignDeleted'),
      postNumber: t('contentPlanner.pipeline.postNumber'),
      defaultType: t('contentPlanner.pipeline.defaultType'),
      wpTitleUpdateFailed: t('contentPlanner.pipeline.wpTitleUpdateFailed'),
      rescheduleTitle: t('contentPlanner.pipeline.rescheduleTitle'),
      rescheduleMessage: t('contentPlanner.pipeline.rescheduleMessage'),
      rescheduleConfirm: t('contentPlanner.pipeline.rescheduleConfirm'),
      rescheduleCancel: t('contentPlanner.pipeline.rescheduleCancel'),
    },
    createModal: {
      title: t('contentPlanner.campaigns.createModal.title'),
      description: t('contentPlanner.campaigns.createModal.description'),
      nameLabel: t('contentPlanner.campaigns.createModal.nameLabel'),
      namePlaceholder: t('contentPlanner.campaigns.createModal.namePlaceholder'),
      colorLabel: t('contentPlanner.campaigns.createModal.colorLabel'),
      reservedColor: t('contentPlanner.campaigns.createModal.reservedColor'),
      cancel: t('contentPlanner.campaigns.createModal.cancel'),
      create: t('contentPlanner.campaigns.createModal.create'),
      createError: t('contentPlanner.campaigns.createModal.createError'),
    },
    editModal: {
      title: t('contentPlanner.campaigns.editModal.title'),
      nameLabel: t('contentPlanner.campaigns.editModal.nameLabel'),
      namePlaceholder: t('contentPlanner.campaigns.editModal.namePlaceholder'),
      colorLabel: t('contentPlanner.campaigns.editModal.colorLabel'),
      reservedColor: t('contentPlanner.campaigns.editModal.reservedColor'),
      delete: t('contentPlanner.campaigns.editModal.delete'),
      deleteConfirm: t('contentPlanner.campaigns.editModal.deleteConfirm'),
      confirmDelete: t('contentPlanner.campaigns.editModal.confirmDelete'),
      cancel: t('contentPlanner.campaigns.editModal.cancel'),
      save: t('contentPlanner.campaigns.editModal.save'),
      updateError: t('contentPlanner.campaigns.editModal.updateError'),
      deleteError: t('contentPlanner.campaigns.editModal.deleteError'),
    },
    wpConnection: {
      title: t('contentPlanner.wpConnection.title'),
      description: t('contentPlanner.wpConnection.description'),
      wordpress: {
        title: t('settings.wordpress.title'),
        connected: t('settings.wordpress.connected'),
        notConnected: t('settings.wordpress.notConnected'),
        connecting: t('settings.wordpress.connecting'),
        disconnected: t('settings.wordpress.disconnected'),
        error: t('settings.wordpress.error'),
        connectedDesc: t('settings.wordpress.connectedDesc'),
        connectingDesc: t('settings.wordpress.connectingDesc'),
        disconnectedDesc: t('settings.wordpress.disconnectedDesc'),
        errorDesc: t('settings.wordpress.errorDesc'),
        notConnectedDesc: t('settings.wordpress.notConnectedDesc'),
        downloadPlugin: t('settings.wordpress.downloadPlugin'),
        downloading: t('settings.wordpress.downloading'),
        autoInstall: t('settings.wordpress.autoInstall'),
        autoInstallTitle: t('settings.wordpress.autoInstallTitle'),
        autoInstallDesc: t('settings.wordpress.autoInstallDesc'),
        autoInstallSuccess: t('settings.wordpress.autoInstallSuccess'),
        autoInstallFailed: t('settings.wordpress.autoInstallFailed'),
        wpAdminUrl: t('settings.wordpress.wpAdminUrl'),
        wpUsername: t('settings.wordpress.wpUsername'),
        wpUsernamePlaceholder: t('settings.wordpress.wpUsernamePlaceholder'),
        wpPassword: t('settings.wordpress.wpPassword'),
        installing: t('settings.wordpress.installing'),
        installNow: t('settings.wordpress.installNow'),
        securityNote: t('settings.wordpress.securityNote'),
        connectionDetails: t('settings.wordpress.connectionDetails'),
        lastPing: t('settings.wordpress.lastPing'),
        pluginVersion: t('settings.wordpress.pluginVersion'),
        wpVersion: t('settings.wordpress.wpVersion'),
        siteKey: t('settings.wordpress.siteKey'),
        neverConnected: t('settings.wordpress.neverConnected'),
        justNow: t('settings.wordpress.justNow'),
        minutesAgo: t('settings.wordpress.minutesAgo'),
        hoursAgo: t('settings.wordpress.hoursAgo'),
        daysAgo: t('settings.wordpress.daysAgo'),
        howToInstall: t('settings.wordpress.howToInstall'),
        step1: t('settings.wordpress.step1'),
        step2: t('settings.wordpress.step2'),
        step3: t('settings.wordpress.step3'),
        step4: t('settings.wordpress.step4'),
        description: t('settings.wordpress.description'),
        disconnect: t('settings.wordpress.disconnect'),
        disconnecting: t('settings.wordpress.disconnecting'),
        disconnectConfirm: t('settings.wordpress.disconnectConfirm'),
        disconnectFailed: t('settings.wordpress.disconnectFailed'),
        errors: {
          restApiUnreachable: t('settings.wordpress.errors.restApiUnreachable'),
          restApiError: t('settings.wordpress.errors.restApiError'),
          authRequestFailed: t('settings.wordpress.errors.authRequestFailed'),
          authFailed: t('settings.wordpress.errors.authFailed'),
          insufficientPermissions: t('settings.wordpress.errors.insufficientPermissions'),
          pluginsApiUnavailable: t('settings.wordpress.errors.pluginsApiUnavailable'),
          activationFailed: t('settings.wordpress.errors.activationFailed'),
          manualInstallRequired: t('settings.wordpress.errors.manualInstallRequired'),
          unknownError: t('settings.wordpress.errors.unknownError'),
        },
      },
    },
  };

  return (
    <>
      <PageHeader
        title={t('contentPlanner.title')}
        subtitle={t('contentPlanner.subtitle')}
      >
        <Link href="/dashboard/strategy/ai-content-wizard">
          <PrimaryActionButton iconName="Sparkles">
            {t('contentPlanner.aiWizard')}
          </PrimaryActionButton>
        </Link>
      </PageHeader>

      {/* Calendar/List View */}
      <ContentPlannerView 
        translations={viewTranslations} 
      />
    </>
  );
}
