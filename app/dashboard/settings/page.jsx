import { SettingsContent } from './components';
import { getTranslations } from '@/i18n/server';
import styles from './page.module.css';

export default async function SettingsPage() {
  const t = await getTranslations();

  const settingsTabs = [
    { id: 'general', label: t('settings.general'), iconName: 'Settings', description: t('settings.descriptions.general') },
    { id: 'ai-configuration', label: t('settings.aiConfiguration'), iconName: 'Sparkles', description: t('settings.descriptions.aiConfiguration') },
    { id: 'scheduling', label: t('settings.scheduling'), iconName: 'Calendar', description: t('settings.descriptions.scheduling') },
    { id: 'notifications', label: t('settings.notifications'), iconName: 'Bell', description: t('settings.descriptions.notifications') },
    { id: 'seo', label: t('settings.seoSettings'), iconName: 'Search', description: t('settings.descriptions.seo') },
    { id: 'integrations', label: t('settings.integrations'), iconName: 'Link', description: t('settings.descriptions.integrations') },
    { id: 'users', label: t('settings.users'), iconName: 'UserPlus', description: t('settings.descriptions.users') },
    { id: 'team', label: t('settings.team'), iconName: 'Users', description: t('settings.descriptions.team') },
    { id: 'roles', label: t('settings.roles'), iconName: 'Shield', description: t('settings.descriptions.roles') },
    { id: 'permissions', label: t('settings.permissions'), iconName: 'Key', description: t('settings.descriptions.permissions') },
    { id: 'subscription', label: t('settings.subscription'), iconName: 'CreditCard', description: t('settings.descriptions.subscription') },
    { id: 'account', label: t('settings.account'), iconName: 'User', description: t('settings.descriptions.account') },
  ];

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
      plan: 'pro',
      planLabel: t('user.plans.pro'),
      price: 49,
      status: 'active',
      statusLabel: t('settings.subscriptionSection.statuses.active'),
      tokensUsed: 350000,
      tokensLimit: 500000,
      nextBillingDate: '2024-12-15', // ISO format for locale-aware formatting
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
    
    // Integrations Settings
    integrationsConnectedSyncing: t('settings.integrationsSection.connectedSyncing'),
    integrationsNotConnected: t('settings.integrationsSection.notConnected'),
    integrationsConfigure: t('settings.integrationsSection.configure'),
    integrationsConnect: t('settings.integrationsSection.connect'),
    integrationsAddIntegration: t('settings.integrationsSection.addIntegration'),
    
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
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <div className={styles.headerContent}>
          <h1 className={styles.pageTitle}>{t('settings.title')}</h1>
          <p className={styles.pageSubtitle}>{t('settings.subtitle')}</p>
        </div>
      </div>

      <SettingsContent 
        translations={translations}
        settingsTabs={settingsTabs}
        initialData={initialData}
      />
    </div>
  );
}
