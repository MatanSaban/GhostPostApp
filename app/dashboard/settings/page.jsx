import { SettingsContent } from './components';
import { PageHeader } from '../components';
import { getTranslations } from '@/i18n/server';
import styles from './page.module.css';

export default async function SettingsPage() {
  const t = await getTranslations();

  // Website-specific settings tabs (related to the currently selected site)
  const websiteTabs = [
    { id: 'general', label: t('settings.general'), iconName: 'Settings', description: t('settings.descriptions.general') },
    { id: 'ai-configuration', label: t('settings.aiConfiguration'), iconName: 'Sparkles', description: t('settings.descriptions.aiConfiguration') },
    { id: 'scheduling', label: t('settings.scheduling'), iconName: 'Calendar', description: t('settings.descriptions.scheduling') },
    { id: 'notifications', label: t('settings.notifications'), iconName: 'Bell', description: t('settings.descriptions.notifications') },
    { id: 'seo', label: t('settings.seoSettings'), iconName: 'Search', description: t('settings.descriptions.seo') },
    { id: 'integrations', label: t('settings.integrations'), iconName: 'Link', description: t('settings.descriptions.integrations') },
    { id: 'team', label: t('settings.team'), iconName: 'Users', description: t('settings.descriptions.team') },
  ];

  // Account-level settings tabs (related to the account, not a specific site)
  const accountTabs = [
    { id: 'profile', label: t('settings.profile'), iconName: 'User', description: t('settings.descriptions.profile') },
    { id: 'users', label: t('settings.users'), iconName: 'UserPlus', description: t('settings.descriptions.users') },
    { id: 'roles', label: t('settings.roles'), iconName: 'Shield', description: t('settings.descriptions.roles') },
    { id: 'permissions', label: t('settings.permissions'), iconName: 'Key', description: t('settings.descriptions.permissions') },
    { id: 'subscription', label: t('settings.subscription'), iconName: 'CreditCard', description: t('settings.descriptions.subscription') },
    { id: 'credits', label: t('settings.credits.title'), iconName: 'Coins', description: t('settings.descriptions.credits') },
    { id: 'addons', label: t('settings.addons'), iconName: 'Puzzle', description: t('settings.descriptions.addons') },
    { id: 'account', label: t('settings.account'), iconName: 'Building2', description: t('settings.descriptions.account') },
  ];

  // Main category tabs for switching between website and account settings
  const mainTabs = {
    website: { id: 'website', label: t('settings.mainTabs.website'), iconName: 'Globe' },
    account: { id: 'account', label: t('settings.mainTabs.account'), iconName: 'Building2' },
  };

  // Initial data for settings (in a real app, this would come from a database)
  const initialData = {
    general: {
      siteUrl: 'https://example.com',
      siteName: 'My Website',
      language: 'en',
      timezone: 'UTC',
      pluginConnected: true,
      maintenanceMode: false,
    },
    aiConfig: {
      textModel: 'gpt-4-turbo',
      imageModel: 'dall-e-3',
      maxMonthlyTokens: 500000,
      creativityTemperature: 0.7,
      textPrompt: 'You are a professional content writer. Create engaging, SEO-optimized content...',
      imagePrompt: 'Create high-quality, professional images that match the content theme...',
      autoOptimization: true,
      contentSafety: true,
    },
    scheduling: {
      cronJobs: [
        { id: 1, nameKey: 'contentGeneration', schedule: '0 9 * * *', enabled: true, lastRunKey: 'hoursAgo', lastRunCount: 2 },
        { id: 2, nameKey: 'seoOptimization', schedule: '0 12 * * 1', enabled: true, lastRunKey: 'yesterday' },
        { id: 3, nameKey: 'linkBuildingCheck', schedule: '0 6 * * *', enabled: false, lastRunKey: 'daysAgo', lastRunCount: 3 },
      ],
      queueConcurrency: 3,
      retryAttempts: 3,
      cronEnabled: true,
    },
    notifications: {
      emailNewContent: true,
      emailWeeklyReport: true,
      emailErrors: true,
      emailMarketing: false,
      slackWebhook: '',
      slackEnabled: false,
    },
    seo: {
      siteName: 'My Website',
      metaDescription: 'A professional website powered by Ghost Post AI',
      defaultOgImage: '',
      enableSitemap: true,
      enableRobots: true,
      enableSchemaMarkup: true,
    },
    team: {
      members: [
        { id: 1, name: 'John Doe', email: 'john@example.com', role: 'owner', roleLabel: t('settings.teamSection.roles.owner'), status: 'active', statusLabel: t('settings.teamSection.statuses.active') },
        { id: 2, name: 'Jane Smith', email: 'jane@example.com', role: 'admin', roleLabel: t('settings.teamSection.roles.admin'), status: 'active', statusLabel: t('settings.teamSection.statuses.active') },
        { id: 3, name: 'Bob Wilson', email: 'bob@example.com', role: 'editor', roleLabel: t('settings.teamSection.roles.editor'), status: 'active', statusLabel: t('settings.teamSection.statuses.active') },
      ],
    },
    subscription: {
      plan: 'free',
      planLabel: t('user.plans.free'),
      price: 0,
      currency: 'USD',
      interval: 'MONTHLY',
      status: 'ACTIVE',
      statusLabel: t('settings.subscriptionSection.statuses.active'),
      aiCreditsUsed: 0,
      aiCreditsLimit: 0,
      nextBillingDate: null,
      cancelAtPeriodEnd: false,
      features: [],
      limitations: [],
    },
  };

  const translations = {
    // Save button
    saveChanges: t('settings.saveChanges'),
    loading: t('common.loading'),
    
    // General Settings
    siteUrl: t('settings.fields.siteUrl'),
    siteUrlPlaceholder: t('settings.fields.siteUrlPlaceholder'),
    siteUrlHint: t('settings.fields.siteUrlHint'),
    siteName: t('settings.fields.siteName'),
    siteNamePlaceholder: t('settings.fields.siteNamePlaceholder'),
    language: t('settings.language'),
    languageEnglish: t('settings.languages.english'),
    languageHebrew: t('settings.languages.hebrew'),
    languageSpanish: t('settings.languages.spanish'),
    languageFrench: t('settings.languages.french'),
    languageGerman: t('settings.languages.german'),
    languageHint: t('settings.fields.languageHint'),
    timezone: t('settings.fields.timezone'),
    timezoneUtc: t('settings.timezones.utc'),
    timezoneEastern: t('settings.timezones.easternTime'),
    timezonePacific: t('settings.timezones.pacificTime'),
    timezoneLondon: t('settings.timezones.london'),
    timezoneIsrael: t('settings.timezones.israel'),
    timezoneHint: t('settings.fields.timezoneHint'),
    wordpressTitle: t('settings.wordpress.title'),
    wordpressConnected: t('settings.wordpress.connected'),
    wordpressNotConnected: t('settings.wordpress.notConnected'),
    wordpressDownloadPlugin: t('settings.wordpress.downloadPlugin'),
    wordpressDescription: t('settings.wordpress.description'),
    maintenanceTitle: t('settings.maintenance.title'),
    maintenanceDescription: t('settings.maintenance.description'),
    notEditable: t('settings.fields.notEditable'),
    noSiteSelected: t('settings.fields.noSiteSelected'),
    saveSuccess: t('settings.fields.saveSuccess'),
    saving: t('settings.fields.saving'),
    
    // Common
    common: {
      cancel: t('common.cancel'),
      loading: t('common.loading'),
    },
    
    // WordPress Plugin Section (nested for component)
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
    
    // AI Settings
    aiTextModel: t('settings.ai.textModel'),
    aiImageModel: t('settings.ai.imageModel'),
    aiModelGpt4Turbo: t('settings.ai.models.gpt4turbo'),
    aiModelGpt4: t('settings.ai.models.gpt4'),
    aiModelGpt35Turbo: t('settings.ai.models.gpt35turbo'),
    aiModelClaude3Opus: t('settings.ai.models.claude3opus'),
    aiModelDalle3: t('settings.ai.models.dalle3'),
    aiModelDalle2: t('settings.ai.models.dalle2'),
    aiModelMidjourney: t('settings.ai.models.midjourney'),
    aiModelStableDiffusion: t('settings.ai.models.stableDiffusion'),
    aiMaxTokens: t('settings.ai.maxTokens'),
    aiTemperature: t('settings.ai.temperature'),
    aiPrecise: t('settings.ai.precise'),
    aiCreative: t('settings.ai.creative'),
    aiPrompts: t('settings.ai.prompts'),
    aiTextPrompt: t('settings.ai.textPrompt'),
    aiTextPromptPlaceholder: t('settings.ai.textPromptPlaceholder'),
    aiImagePrompt: t('settings.ai.imagePrompt'),
    aiImagePromptPlaceholder: t('settings.ai.imagePromptPlaceholder'),
    aiSafetyOptimization: t('settings.ai.safetyOptimization'),
    aiAutoOptimization: t('settings.ai.autoOptimization'),
    aiAutoOptimizationDesc: t('settings.ai.autoOptimizationDesc'),
    aiContentSafety: t('settings.ai.contentSafety'),
    aiContentSafetyDesc: t('settings.ai.contentSafetyDesc'),
    
    // Scheduling Settings
    schedulingScheduledTasks: t('settings.schedulingSection.scheduledTasks'),
    schedulingLastRun: t('settings.schedulingSection.lastRun'),
    schedulingEdit: t('settings.schedulingSection.edit'),
    schedulingAddScheduledTask: t('settings.schedulingSection.addScheduledTask'),
    schedulingQueueSettings: t('settings.schedulingSection.queueSettings'),
    schedulingQueueConcurrency: t('settings.schedulingSection.queueConcurrency'),
    schedulingRetryAttempts: t('settings.schedulingSection.retryAttempts'),
    schedulingCronJobNames: {
      contentGeneration: t('settings.schedulingSection.cronJobs.contentGeneration'),
      seoOptimization: t('settings.schedulingSection.cronJobs.seoOptimization'),
      linkBuildingCheck: t('settings.schedulingSection.cronJobs.linkBuildingCheck'),
    },
    schedulingLastRunTimes: {
      hoursAgo: t('settings.schedulingSection.lastRunTimes.hoursAgo'),
      yesterday: t('settings.schedulingSection.lastRunTimes.yesterday'),
      daysAgo: t('settings.schedulingSection.lastRunTimes.daysAgo'),
    },
    
    // Notifications Settings
    notificationsEmailNotifications: t('settings.notificationsSection.emailNotifications'),
    notificationsNewContentPublished: t('settings.notificationsSection.newContentPublished'),
    notificationsNewContentPublishedDesc: t('settings.notificationsSection.newContentPublishedDesc'),
    notificationsWeeklyReport: t('settings.notificationsSection.weeklyReport'),
    notificationsWeeklyReportDesc: t('settings.notificationsSection.weeklyReportDesc'),
    notificationsErrorAlerts: t('settings.notificationsSection.errorAlerts'),
    notificationsErrorAlertsDesc: t('settings.notificationsSection.errorAlertsDesc'),
    notificationsMarketingUpdates: t('settings.notificationsSection.marketingUpdates'),
    notificationsMarketingUpdatesDesc: t('settings.notificationsSection.marketingUpdatesDesc'),
    notificationsSlackIntegration: t('settings.notificationsSection.slackIntegration'),
    notificationsSlackWebhookUrl: t('settings.notificationsSection.slackWebhookUrl'),
    notificationsSlackWebhookPlaceholder: t('settings.notificationsSection.slackWebhookPlaceholder'),
    notificationsEnableSlack: t('settings.notificationsSection.enableSlack'),
    notificationsEnableSlackDesc: t('settings.notificationsSection.enableSlackDesc'),
    
    // SEO Settings
    seoSiteNameSeo: t('settings.seo.siteNameSeo'),
    seoDefaultOgImage: t('settings.seo.defaultOgImage'),
    seoDefaultOgImagePlaceholder: t('settings.seo.defaultOgImagePlaceholder'),
    seoMetaDescription: t('settings.seo.metaDescription'),
    seoMetaDescriptionPlaceholder: t('settings.seo.metaDescriptionPlaceholder'),
    seoTechnicalSeo: t('settings.seo.technicalSeo'),
    seoAutoSitemap: t('settings.seo.autoSitemap'),
    seoAutoSitemapDesc: t('settings.seo.autoSitemapDesc'),
    seoRobotsTxt: t('settings.seo.robotsTxt'),
    seoRobotsTxtDesc: t('settings.seo.robotsTxtDesc'),
    seoSchemaMarkup: t('settings.seo.schemaMarkup'),
    seoSchemaMarkupDesc: t('settings.seo.schemaMarkupDesc'),
    
    // Integrations Settings (nested object for IntegrationsSettings component)
    integrationsSection: {
      connectedSyncing: t('settings.integrationsSection.connectedSyncing'),
      notConnected: t('settings.integrationsSection.notConnected'),
      configure: t('settings.integrationsSection.configure'),
      connect: t('settings.integrationsSection.connect'),
      addIntegration: t('settings.integrationsSection.addIntegration'),
      googleAccount: t('settings.integrationsSection.googleAccount'),
      googleAccountDesc: t('settings.integrationsSection.googleAccountDesc'),
      connectGoogle: t('settings.integrationsSection.connectGoogle'),
      connecting: t('settings.integrationsSection.connecting'),
      connected: t('settings.integrationsSection.connected'),
      disconnect: t('settings.integrationsSection.disconnect'),
      disconnected: t('settings.integrationsSection.disconnected'),
      connectSuccess: t('settings.integrationsSection.connectSuccess'),
      connectError: t('settings.integrationsSection.connectError'),
      connectFirst: t('settings.integrationsSection.connectFirst'),
      property: t('settings.integrationsSection.property'),
      changeProperty: t('settings.integrationsSection.changeProperty'),
      selectProperty: t('settings.integrationsSection.selectProperty'),
      selectGAProperty: t('settings.integrationsSection.selectGAProperty'),
      noProperties: t('settings.integrationsSection.noProperties'),
      gaPropertySaved: t('settings.integrationsSection.gaPropertySaved'),
      siteUrl: t('settings.integrationsSection.siteUrl'),
      changeSite: t('settings.integrationsSection.changeSite'),
      selectSite: t('settings.integrationsSection.selectSite'),
      selectGSCSite: t('settings.integrationsSection.selectGSCSite'),
      noSites: t('settings.integrationsSection.noSites'),
      gscSiteSaved: t('settings.integrationsSection.gscSiteSaved'),
      active: t('settings.integrationsSection.active'),
      viaPlugin: t('settings.integrationsSection.viaPlugin'),
      wpManaged: t('settings.integrationsSection.wpManaged'),
      gaTitle: t('settings.integrationsSection.gaTitle'),
      gscTitle: t('settings.integrationsSection.gscTitle'),
      wordpress: t('settings.integrationsSection.wordpress'),
      connectFirstGA: t('settings.integrationsSection.connectFirstGA'),
      connectFirstGSC: t('settings.integrationsSection.connectFirstGSC'),
      domainProperty: t('settings.integrationsSection.domainProperty'),
      owner: t('settings.integrationsSection.owner'),
      fullAccess: t('settings.integrationsSection.fullAccess'),
      restricted: t('settings.integrationsSection.restricted'),
      unverified: t('settings.integrationsSection.unverified'),
      needsScopesDesc: t('settings.integrationsSection.needsScopesDesc'),
      grantPermissions: t('settings.integrationsSection.grantPermissions'),
      gaNeedsScopesDesc: t('settings.integrationsSection.gaNeedsScopesDesc'),
      gscNeedsScopesDesc: t('settings.integrationsSection.gscNeedsScopesDesc'),
    },
    
    // Team Settings
    teamInviteTeamMember: t('settings.teamSection.inviteTeamMember'),
    
    // Users Settings - pass entire section
    usersSection: {
      title: t('settings.usersSection.title'),
      description: t('settings.usersSection.description'),
      inviteUser: t('settings.usersSection.inviteUser'),
      inviteUserDescription: t('settings.usersSection.inviteUserDescription'),
      email: t('settings.usersSection.email'),
      emailPlaceholder: t('settings.usersSection.emailPlaceholder'),
      selectRole: t('settings.usersSection.selectRole'),
      rolePlaceholder: t('settings.usersSection.rolePlaceholder'),
      sendInvite: t('settings.usersSection.sendInvite'),
      sending: t('settings.usersSection.sending'),
      inviteSent: t('settings.usersSection.inviteSent'),
      inviteFailed: t('settings.usersSection.inviteFailed'),
      userAlreadyMember: t('settings.usersSection.userAlreadyMember'),
      columns: {
        user: t('settings.usersSection.columns.user'),
        email: t('settings.usersSection.columns.email'),
        role: t('settings.usersSection.columns.role'),
        status: t('settings.usersSection.columns.status'),
        joinedAt: t('settings.usersSection.columns.joinedAt'),
        actions: t('settings.usersSection.columns.actions'),
      },
      statuses: {
        active: t('settings.usersSection.statuses.active'),
        pending: t('settings.usersSection.statuses.pending'),
        suspended: t('settings.usersSection.statuses.suspended'),
        removed: t('settings.usersSection.statuses.removed'),
      },
      roles: {
        owner: t('settings.usersSection.roles.owner'),
        admin: t('settings.usersSection.roles.admin'),
        ceo: t('settings.usersSection.roles.ceo'),
        cfo: t('settings.usersSection.roles.cfo'),
        manager: t('settings.usersSection.roles.manager'),
        team_lead: t('settings.usersSection.roles.team_lead'),
        employee: t('settings.usersSection.roles.employee'),
        editor: t('settings.usersSection.roles.editor'),
        viewer: t('settings.usersSection.roles.viewer'),
        user: t('settings.usersSection.roles.user'),
      },
      actions: {
        changeRole: t('settings.usersSection.actions.changeRole'),
        resendInvite: t('settings.usersSection.actions.resendInvite'),
        remove: t('settings.usersSection.actions.remove'),
        suspend: t('settings.usersSection.actions.suspend'),
        activate: t('settings.usersSection.actions.activate'),
      },
      confirmRemove: {
        title: t('settings.usersSection.confirmRemove.title'),
        message: t('settings.usersSection.confirmRemove.message'),
        confirm: t('settings.usersSection.confirmRemove.confirm'),
        cancel: t('settings.usersSection.confirmRemove.cancel'),
      },
      changeRoleModal: {
        title: t('settings.usersSection.changeRoleModal.title'),
        message: t('settings.usersSection.changeRoleModal.message'),
        confirm: t('settings.usersSection.changeRoleModal.confirm'),
        cancel: t('settings.usersSection.changeRoleModal.cancel'),
      },
      noUsers: t('settings.usersSection.noUsers'),
      noUsersDescription: t('settings.usersSection.noUsersDescription'),
      ownerBadge: t('settings.usersSection.ownerBadge'),
      youBadge: t('settings.usersSection.youBadge'),
      pendingInvite: t('settings.usersSection.pendingInvite'),
      inviteExpired: t('settings.usersSection.inviteExpired'),
    },
    
    // Subscription Settings
    subscriptionPlan: t('settings.subscriptionSection.plan'),
    subscriptionPerMonth: t('settings.subscriptionSection.perMonth'),
    subscriptionTokenUsage: t('settings.subscriptionSection.tokenUsage'),
    subscriptionNextBillingDate: t('settings.subscriptionSection.nextBillingDate'),
    subscriptionBillingActions: t('settings.subscriptionSection.billingActions'),
    subscriptionUpgradePlan: t('settings.subscriptionSection.upgradePlan'),
    subscriptionUpdatePaymentMethod: t('settings.subscriptionSection.updatePaymentMethod'),
    subscriptionViewInvoices: t('settings.subscriptionSection.viewInvoices'),
    
    // Account Settings
    accountFullName: t('settings.accountSection.fullName'),
    accountEmailAddress: t('settings.accountSection.emailAddress'),
    accountChangePassword: t('settings.accountSection.changePassword'),
    accountCurrentPassword: t('settings.accountSection.currentPassword'),
    accountCurrentPasswordPlaceholder: t('settings.accountSection.currentPasswordPlaceholder'),
    accountNewPassword: t('settings.accountSection.newPassword'),
    accountNewPasswordPlaceholder: t('settings.accountSection.newPasswordPlaceholder'),
    accountConfirmNewPassword: t('settings.accountSection.confirmNewPassword'),
    accountConfirmPasswordPlaceholder: t('settings.accountSection.confirmPasswordPlaceholder'),
    accountDangerZone: t('settings.accountSection.dangerZone'),
    accountDeleteAccount: t('settings.accountSection.deleteAccount'),
    accountDeleteAccountDesc: t('settings.accountSection.deleteAccountDesc'),
  };

  return (
    <>
      <PageHeader
        title={t('settings.title')}
        subtitle={t('settings.subtitle')}
      />

      <SettingsContent 
        translations={translations}
        websiteTabs={websiteTabs}
        accountTabs={accountTabs}
        mainTabs={mainTabs}
        initialData={initialData}
      />
    </>
  );
}
