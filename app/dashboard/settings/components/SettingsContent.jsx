'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  Settings, 
  Sparkles, 
  Calendar, 
  Bell, 
  Search, 
  Link, 
  Users, 
  CreditCard, 
  User,
  UserPlus,
  Globe,
  Puzzle,
  Clock,
  Timer,
  Workflow,
  AlertTriangle,
  Play,
  Download,
  Plus,
  Edit2,
  Trash2,
  Check,
  Zap,
  Crown,
  Shield,
  Lock,
  Loader2,
  Key,
  X,
  Send,
  RefreshCw,
  Ban,
  Building2,
} from 'lucide-react';
import { useSite } from '@/app/context/site-context';
import { useLocale } from '@/app/context/locale-context';
import { useUser } from '@/app/context/user-context';
import { usePermissions } from '@/app/hooks/usePermissions';
import WordPressPluginSection from './WordPressPluginSection';
import styles from '../page.module.css';

const iconMap = {
  Settings,
  Sparkles,
  Calendar,
  Bell,
  Search,
  Link,
  Users,
  UserPlus,
  CreditCard,
  User,
  Shield,
  Key,
  Globe,
  Building2,
};

// Account-level tab IDs that require special permissions
const ACCOUNT_TAB_IDS = ['users', 'roles', 'permissions', 'subscription', 'account'];

export default function SettingsContent({ translations, websiteTabs, accountTabs, mainTabs, initialData }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { direction, locale, t } = useLocale();
  const { selectedSite } = useSite();
  const { user } = useUser();
  
  // Get user permissions
  const { filterTabs, canEditTab, isLoading: permissionsLoading, isOwner, checkAccess } = usePermissions();
  
  // Check if user can access any account-level settings
  const canAccessAccountSettings = useMemo(() => {
    if (permissionsLoading) return true; // Show while loading to prevent flicker
    if (isOwner) return true;
    
    // Check if user has VIEW permission for any account-related module
    const accountModules = ['ACCOUNT', 'MEMBERS', 'ROLES', 'SETTINGS_TEAM', 'SETTINGS_ROLES', 'SETTINGS_SUBSCRIPTION'];
    return accountModules.some(module => checkAccess(module, 'VIEW'));
  }, [isOwner, checkAccess, permissionsLoading]);
  
  // Filter tabs based on user permissions
  const availableWebsiteTabs = useMemo(() => {
    if (permissionsLoading) return websiteTabs;
    return filterTabs(websiteTabs);
  }, [websiteTabs, filterTabs, permissionsLoading]);
  
  const availableAccountTabs = useMemo(() => {
    if (permissionsLoading) return accountTabs;
    return filterTabs(accountTabs);
  }, [accountTabs, filterTabs, permissionsLoading]);
  
  // Determine which main category to show based on URL or default
  const getMainCategoryFromUrl = () => {
    const tabFromUrl = searchParams.get('tab');
    if (tabFromUrl && ACCOUNT_TAB_IDS.includes(tabFromUrl)) {
      return 'account';
    }
    return 'website';
  };
  
  const [activeMainCategory, setActiveMainCategory] = useState(getMainCategoryFromUrl);
  
  // Get the current tabs based on active main category
  const currentTabs = activeMainCategory === 'account' ? availableAccountTabs : availableWebsiteTabs;
  
  // Get initial sub-tab from URL or default to first available
  const validTabs = currentTabs.map(t => t.id);
  const getTabFromUrl = () => {
    const tabFromUrl = searchParams.get('tab');
    if (validTabs.includes(tabFromUrl)) {
      return tabFromUrl;
    }
    return validTabs[0] || 'general';
  };
  
  const [activeTab, setActiveTab] = useState(getTabFromUrl);
  const [indicatorStyle, setIndicatorStyle] = useState({});
  const [mainIndicatorStyle, setMainIndicatorStyle] = useState({});
  const tabsRef = useRef({});
  const tabsListRef = useRef(null);
  const mainTabsRef = useRef({});
  const mainTabsListRef = useRef(null);

  // Update active main category when switching
  const handleMainCategoryChange = (category) => {
    if (category === activeMainCategory) return;
    setActiveMainCategory(category);
    
    // Set the first tab of the new category
    const newTabs = category === 'account' ? availableAccountTabs : availableWebsiteTabs;
    const firstTab = newTabs[0]?.id || 'general';
    setActiveTab(firstTab);
    
    // Update URL
    const url = new URL(window.location.href);
    url.searchParams.set('tab', firstTab);
    window.history.replaceState({}, '', url.toString());
  };

  // Update active tab if it's no longer available (e.g., permissions changed or category changed)
  useEffect(() => {
    if (!permissionsLoading && !validTabs.includes(activeTab) && validTabs.length > 0) {
      setActiveTab(validTabs[0]);
    }
  }, [validTabs, activeTab, permissionsLoading]);

  // Sync active tab with URL - only update URL, not state
  const handleTabChange = (tabId) => {
    if (tabId === activeTab) return;
    setActiveTab(tabId);
    // Update URL without navigation - use replace to avoid history stack
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tabId);
    window.history.replaceState({}, '', url.toString());
  };

  // General Settings State
  const [general, setGeneral] = useState(initialData.general);

  // AI Configuration State
  const [aiConfig, setAiConfig] = useState(initialData.aiConfig);

  // Scheduling State
  const [scheduling, setScheduling] = useState(initialData.scheduling);

  // Notifications State
  const [notifications, setNotifications] = useState(initialData.notifications);

  // SEO State
  const [seo, setSeo] = useState(initialData.seo);

  // Team State (read-only from server)
  const [team] = useState(initialData.team);

  // Subscription State - derived from user context with real data
  const subscription = useMemo(() => {
    const userSub = user?.subscription;
    const plan = userSub?.plan;
    
    if (!userSub || !plan) {
      // Fallback to initial data if no subscription found
      return initialData.subscription;
    }
    
    // Get translated status label
    const statusKey = userSub.status?.toLowerCase() || 'active';
    const statusLabel = t(`settings.subscriptionSection.statuses.${statusKey}`) || userSub.status;
    
    // Get plan name (use translation if available, otherwise plan name)
    // Language enum is uppercase (EN, HE), locale is lowercase (en, he)
    const planTranslation = plan.translations?.find(
      tr => tr.language?.toUpperCase() === locale?.toUpperCase()
    );
    const planLabel = planTranslation?.name || plan.name || t('user.plans.free');
    
    return {
      plan: plan.slug || 'free',
      planLabel: planLabel,
      price: plan.price || 0,
      yearlyPrice: plan.yearlyPrice || null,
      currency: plan.currency || 'USD',
      interval: plan.interval || 'MONTHLY',
      status: userSub.status || 'ACTIVE',
      statusLabel: statusLabel,
      currentPeriodStart: userSub.currentPeriodStart,
      currentPeriodEnd: userSub.currentPeriodEnd,
      nextBillingDate: userSub.currentPeriodEnd, // Next billing is when current period ends
      cancelAtPeriodEnd: userSub.cancelAtPeriodEnd || false,
      // Token usage - placeholder values for now (can be enhanced with actual usage tracking)
      tokensUsed: 0,
      tokensLimit: 500000, // Default estimate
      features: planTranslation?.features || plan.features || [],
      limitations: planTranslation?.limitations || plan.limitations || [],
    };
  }, [user, locale, t, initialData.subscription]);

  // Update indicator position when tab, direction, locale, or site changes
  useEffect(() => {
    const updateIndicator = () => {
      const activeButton = tabsRef.current[activeTab];
      if (activeButton && tabsListRef.current) {
        const containerRect = tabsListRef.current.getBoundingClientRect();
        const buttonRect = activeButton.getBoundingClientRect();
        setIndicatorStyle({
          left: buttonRect.left - containerRect.left,
          width: buttonRect.width,
          top: buttonRect.top - containerRect.top,
        });
      }
    };

    // Immediate update
    updateIndicator();
    
    // Also update on any resize
    window.addEventListener('resize', updateIndicator);
    
    // Use MutationObserver to detect when text content changes (translations loaded)
    let observer = null;
    if (tabsListRef.current) {
      observer = new MutationObserver(() => {
        // Small delay to let browser recalculate layout after DOM change
        setTimeout(updateIndicator, 10);
      });
      observer.observe(tabsListRef.current, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
    
    return () => {
      window.removeEventListener('resize', updateIndicator);
      if (observer) {
        observer.disconnect();
      }
    };
  }, [activeTab, direction, locale, selectedSite?.id, activeMainCategory]);

  // Update main tabs indicator position
  useEffect(() => {
    if (!canAccessAccountSettings) return;
    
    const updateMainIndicator = () => {
      const activeButton = mainTabsRef.current[activeMainCategory];
      if (activeButton && mainTabsListRef.current) {
        const containerRect = mainTabsListRef.current.getBoundingClientRect();
        const buttonRect = activeButton.getBoundingClientRect();
        setMainIndicatorStyle({
          left: buttonRect.left - containerRect.left,
          width: buttonRect.width,
        });
      }
    };

    updateMainIndicator();
    window.addEventListener('resize', updateMainIndicator);
    
    return () => {
      window.removeEventListener('resize', updateMainIndicator);
    };
  }, [activeMainCategory, direction, locale, canAccessAccountSettings]);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return <GeneralSettings general={general} setGeneral={setGeneral} translations={translations} canEdit={canEdit} />;
      case 'ai-configuration':
        return <AIConfigSettings aiConfig={aiConfig} setAiConfig={setAiConfig} translations={translations} canEdit={canEdit} />;
      case 'scheduling':
        return <SchedulingSettings scheduling={scheduling} setScheduling={setScheduling} translations={translations} canEdit={canEdit} />;
      case 'notifications':
        return <NotificationsSettings notifications={notifications} setNotifications={setNotifications} translations={translations} canEdit={canEdit} />;
      case 'seo':
        return <SEOSettings seo={seo} setSeo={setSeo} translations={translations} canEdit={canEdit} />;
      case 'integrations':
        return <IntegrationsSettings translations={translations} canEdit={canEdit} />;
      case 'users':
        return <UsersSettings translations={translations} canEdit={canEdit} />;
      case 'team':
        return <TeamSettings team={team} translations={translations} canEdit={canEdit} />;
      case 'roles':
        return <RolesSettings translations={translations} canEdit={canEdit} />;
      case 'permissions':
        return <PermissionsSettings translations={translations} canEdit={canEdit} />;
      case 'subscription':
        return <SubscriptionSettings subscription={subscription} translations={translations} canEdit={canEdit} />;
      case 'account':
        return <AccountSettings translations={translations} canEdit={canEdit} />;
      default:
        return null;
    }
  };

  const activeTabData = currentTabs.find(tab => tab.id === activeTab);
  const ActiveIcon = iconMap[activeTabData?.iconName] || Settings;

  // Check if user can edit the current tab
  const canEdit = canEditTab(activeTab);

  return (
    <>
      {/* Main Category Tabs - Only show if user can access account settings */}
      {canAccessAccountSettings && (
        <div className={styles.mainTabsContainer}>
          <div className={styles.mainTabsList} ref={mainTabsListRef}>
            <div 
              className={styles.mainTabIndicator} 
              style={{
                left: mainIndicatorStyle.left,
                width: mainIndicatorStyle.width,
              }}
            />
            <button
              ref={(el) => (mainTabsRef.current['website'] = el)}
              onClick={() => handleMainCategoryChange('website')}
              className={`${styles.mainTabButton} ${activeMainCategory === 'website' ? styles.active : ''}`}
            >
              <Globe className={styles.mainTabIcon} />
              <span>{mainTabs.website.label}</span>
            </button>
            <button
              ref={(el) => (mainTabsRef.current['account'] = el)}
              onClick={() => handleMainCategoryChange('account')}
              className={`${styles.mainTabButton} ${activeMainCategory === 'account' ? styles.active : ''}`}
            >
              <Building2 className={styles.mainTabIcon} />
              <span>{mainTabs.account.label}</span>
            </button>
          </div>
        </div>
      )}

      {/* Sub-tabs for the active category */}
      <div className={styles.tabsContainer}>
        <div className={styles.tabsList} ref={tabsListRef}>
          <div 
            className={styles.tabIndicator} 
            style={{
              left: indicatorStyle.left,
              width: indicatorStyle.width,
              top: indicatorStyle.top,
            }}
          />
          {currentTabs.map((tab) => {
            const Icon = iconMap[tab.iconName] || Settings;
            return (
              <button
                key={tab.id}
                ref={(el) => (tabsRef.current[tab.id] = el)}
                onClick={() => handleTabChange(tab.id)}
                className={`${styles.tabButton} ${activeTab === tab.id ? styles.active : ''}`}
              >
                <Icon className={styles.tabIcon} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.contentPanel}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionIconWrapper}>
            <ActiveIcon className={styles.sectionIcon} />
          </div>
          <div className={styles.sectionInfo}>
            <h2 className={styles.sectionTitle}>{activeTabData?.label}</h2>
            <p className={styles.sectionDescription}>
              {activeTabData?.description}
            </p>
          </div>
        </div>

        {renderTabContent()}
      </div>
    </>
  );
}

// General Settings Component
function GeneralSettings({ general, setGeneral, translations, canEdit = true }) {
  const t = translations;
  const router = useRouter();
  const { selectedSite, refreshSites } = useSite();
  const { setLocale, locale: currentLocale } = useLocale();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [originalLanguage, setOriginalLanguage] = useState(null);
  
  // Fetch settings from API on mount or when site changes
  useEffect(() => {
    async function fetchSettings() {
      if (!selectedSite?.id) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const response = await fetch(`/api/settings/general?siteId=${selectedSite.id}`);
        if (response.ok) {
          const data = await response.json();
          const settings = data.settings;
          const lang = settings.language?.toLowerCase() || 'en';
          setGeneral({
            siteUrl: settings.siteUrl || '',
            siteName: settings.siteName || '',
            language: lang,
            timezone: settings.timezone || 'UTC',
            maintenanceMode: settings.maintenanceMode || false,
            platform: settings.platform || null,
            pluginConnected: false, // TODO: implement plugin connection check
            accountDefaults: settings.accountDefaults || { language: 'EN', timezone: 'UTC' },
          });
          setOriginalLanguage(lang);
        }
      } catch (error) {
        console.error('Failed to fetch settings:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchSettings();
  }, [selectedSite?.id, setGeneral]);
  
  const updateField = (field, value) => {
    setGeneral(prev => ({ ...prev, [field]: value }));
    setSaveSuccess(false);
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!selectedSite?.id) return;

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const response = await fetch('/api/settings/general', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: selectedSite.id,
          siteName: general.siteName,
          language: general.language.toUpperCase(),
          timezone: general.timezone,
          maintenanceMode: general.maintenanceMode,
          // NOTE: siteUrl is intentionally NOT sent - it cannot be changed
        }),
      });

      if (response.ok) {
        setSaveSuccess(true);
        // Refresh sites to update the site name in the selector
        refreshSites();
        
        // If language changed, update locale and refresh to get new translations
        const languageChanged = general.language !== originalLanguage;
        if (languageChanged) {
          setLocale(general.language);
          // Update original language to the new value
          setOriginalLanguage(general.language);
          // Use router.refresh() to re-fetch server components with new locale
          router.refresh();
        }
        
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        const data = await response.json();
        setSaveError(data.error || 'Failed to save settings');
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      setSaveError('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.loadingState}>
        <Loader2 className={styles.loadingSpinner} />
        <span>{t.loading || 'Loading...'}</span>
      </div>
    );
  }

  if (!selectedSite) {
    return (
      <div className={styles.emptyState}>
        <Globe className={styles.emptyIcon} />
        <p>{t.noSiteSelected || 'Please select a site first'}</p>
      </div>
    );
  }

  return (
    <>
      <div className={styles.formGrid}>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>
            {t.siteUrl}
            <span className={styles.lockedBadge}>
              <Lock size={12} />
              {t.notEditable || 'Not editable'}
            </span>
          </label>
          <input 
            type="url" 
            className={`${styles.formInput} ${styles.readOnly}`}
            value={general.siteUrl}
            readOnly
            disabled
            placeholder={t.siteUrlPlaceholder}
          />
          <span className={styles.fieldHint}>{t.siteUrlHint || 'Website URL cannot be changed after creation'}</span>
        </div>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>{t.siteName}</label>
          <input 
            type="text" 
            className={styles.formInput}
            value={general.siteName}
            onChange={(e) => updateField('siteName', e.target.value)}
            placeholder={t.siteNamePlaceholder}
          />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>{t.language}</label>
          <select 
            className={styles.formSelect}
            value={general.language}
            onChange={(e) => updateField('language', e.target.value)}
          >
            <option value="en">{t.languageEnglish}</option>
            <option value="he">{t.languageHebrew}</option>
          </select>
          <span className={styles.fieldHint}>{t.languageHint || 'Platform language for this website'}</span>
        </div>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>{t.timezone}</label>
          <select 
            className={styles.formSelect}
            value={general.timezone}
            onChange={(e) => updateField('timezone', e.target.value)}
          >
            <option value="UTC">{t.timezoneUtc}</option>
            <option value="America/New_York">{t.timezoneEastern}</option>
            <option value="America/Los_Angeles">{t.timezonePacific}</option>
            <option value="Europe/London">{t.timezoneLondon}</option>
            <option value="Asia/Jerusalem">{t.timezoneIsrael}</option>
          </select>
          <span className={styles.fieldHint}>{t.timezoneHint || 'Your timezone for this website (default from account settings)'}</span>
        </div>
      </div>

      {general.platform === 'wordpress' && (
        <div className={styles.subsection}>
          <h3 className={styles.subsectionTitle}>
            <Puzzle className={styles.subsectionIcon} />
            {t.wordpressTitle}
          </h3>
          <WordPressPluginSection translations={t} />
        </div>
      )}

      <div className={styles.subsection}>
        <div className={styles.warningBox}>
          <div className={styles.warningContent}>
            <AlertTriangle className={styles.warningIcon} />
            <div className={styles.warningInfo}>
              <span className={styles.warningLabel}>{t.maintenanceTitle}</span>
              <span className={styles.warningDescription}>{t.maintenanceDescription}</span>
            </div>
          </div>
          <button 
            className={`${styles.toggleSwitch} ${general.maintenanceMode ? styles.active : ''}`}
            onClick={() => updateField('maintenanceMode', !general.maintenanceMode)}
          >
            <div className={styles.toggleKnob}></div>
          </button>
        </div>
      </div>

      <div className={styles.saveButtonWrapper}>
        {saveError && <span className={styles.saveError}>{saveError}</span>}
        {saveSuccess && <span className={styles.saveSuccess}>{t.saveSuccess || 'Settings saved successfully'}</span>}
        <button 
          className={styles.saveButton} 
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <>
              <Loader2 className={styles.savingSpinner} />
              {t.saving || 'Saving...'}
            </>
          ) : (
            t.saveChanges
          )}
        </button>
      </div>
    </>
  );
}

// AI Configuration Component
function AIConfigSettings({ aiConfig, setAiConfig, translations, canEdit = true }) {
  const t = translations;
  
  const updateField = (field, value) => {
    setAiConfig(prev => ({ ...prev, [field]: value }));
  };

  return (
    <>
      <div className={styles.formGrid}>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>{t.aiTextModel}</label>
          <select 
            className={styles.formSelect}
            value={aiConfig.textModel}
            onChange={(e) => updateField('textModel', e.target.value)}
          >
            <option value="gpt-4-turbo">{t.aiModelGpt4Turbo}</option>
            <option value="gpt-4">{t.aiModelGpt4}</option>
            <option value="gpt-3.5-turbo">{t.aiModelGpt35Turbo}</option>
            <option value="claude-3-opus">{t.aiModelClaude3Opus}</option>
          </select>
        </div>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>{t.aiImageModel}</label>
          <select 
            className={styles.formSelect}
            value={aiConfig.imageModel}
            onChange={(e) => updateField('imageModel', e.target.value)}
          >
            <option value="dall-e-3">{t.aiModelDalle3}</option>
            <option value="dall-e-2">{t.aiModelDalle2}</option>
            <option value="midjourney">{t.aiModelMidjourney}</option>
            <option value="stable-diffusion">{t.aiModelStableDiffusion}</option>
          </select>
        </div>
      </div>

      <div className={styles.formGrid} style={{ marginTop: '1.5rem' }}>
        <div className={`${styles.formGroup} ${styles.rangeGroup}`}>
          <div className={styles.rangeHeader}>
            <label className={styles.formLabel}>{t.aiMaxTokens}</label>
            <span className={styles.rangeValue}>{(aiConfig.maxMonthlyTokens / 1000).toFixed(0)}K</span>
          </div>
          <input 
            type="range"
            className={styles.rangeInput}
            min="100000"
            max="1000000"
            step="10000"
            value={aiConfig.maxMonthlyTokens}
            onChange={(e) => updateField('maxMonthlyTokens', parseInt(e.target.value))}
          />
          <div className={styles.rangeLabels}>
            <span>100K</span>
            <span>1M</span>
          </div>
        </div>
        <div className={`${styles.formGroup} ${styles.rangeGroup}`}>
          <div className={styles.rangeHeader}>
            <label className={styles.formLabel}>{t.aiTemperature}</label>
            <span className={styles.rangeValue}>{aiConfig.creativityTemperature}</span>
          </div>
          <input 
            type="range"
            className={styles.rangeInput}
            min="0"
            max="1"
            step="0.1"
            value={aiConfig.creativityTemperature}
            onChange={(e) => updateField('creativityTemperature', parseFloat(e.target.value))}
          />
          <div className={styles.rangeLabels}>
            <span>{t.aiPrecise}</span>
            <span>{t.aiCreative}</span>
          </div>
        </div>
      </div>

      <div className={styles.subsection}>
        <h3 className={styles.subsectionTitle}>
          <Sparkles className={styles.subsectionIcon} />
          {t.aiPrompts}
        </h3>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>{t.aiTextPrompt}</label>
            <textarea 
              className={`${styles.formTextarea} ${styles.codeTextarea}`}
              value={aiConfig.textPrompt}
              onChange={(e) => updateField('textPrompt', e.target.value)}
              placeholder={t.aiTextPromptPlaceholder}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>{t.aiImagePrompt}</label>
            <textarea 
              className={`${styles.formTextarea} ${styles.codeTextarea}`}
              value={aiConfig.imagePrompt}
              onChange={(e) => updateField('imagePrompt', e.target.value)}
              placeholder={t.aiImagePromptPlaceholder}
            />
          </div>
        </div>
      </div>

      <div className={styles.subsection}>
        <h3 className={styles.subsectionTitle}>
          <Shield className={styles.subsectionIcon} />
          {t.aiSafetyOptimization}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className={styles.toggleRow}>
            <div className={styles.toggleInfo}>
              <Zap className={styles.toggleIcon} />
              <div className={styles.toggleContent}>
                <span className={styles.toggleLabel}>{t.aiAutoOptimization}</span>
                <span className={styles.toggleDescription}>{t.aiAutoOptimizationDesc}</span>
              </div>
            </div>
            <button 
              className={`${styles.toggleSwitch} ${aiConfig.autoOptimization ? styles.active : ''}`}
              onClick={() => updateField('autoOptimization', !aiConfig.autoOptimization)}
            >
              <div className={styles.toggleKnob}></div>
            </button>
          </div>
          <div className={styles.toggleRow}>
            <div className={styles.toggleInfo}>
              <Shield className={styles.toggleIcon} />
              <div className={styles.toggleContent}>
                <span className={styles.toggleLabel}>{t.aiContentSafety}</span>
                <span className={styles.toggleDescription}>{t.aiContentSafetyDesc}</span>
              </div>
            </div>
            <button 
              className={`${styles.toggleSwitch} ${aiConfig.contentSafety ? styles.active : ''}`}
              onClick={() => updateField('contentSafety', !aiConfig.contentSafety)}
            >
              <div className={styles.toggleKnob}></div>
            </button>
          </div>
        </div>
      </div>

      <div className={styles.saveButtonWrapper}>
        <button className={styles.saveButton}>{t.saveChanges}</button>
      </div>
    </>
  );
}

// Scheduling Settings Component
function SchedulingSettings({ scheduling, setScheduling, translations, canEdit = true }) {
  const t = translations;
  
  const toggleCronJob = (id) => {
    setScheduling(prev => ({
      ...prev,
      cronJobs: prev.cronJobs.map(job =>
        job.id === id ? { ...job, enabled: !job.enabled } : job
      ),
    }));
  };

  return (
    <>
      <div className={styles.subsection} style={{ borderTop: 'none', paddingTop: 0, marginTop: 0 }}>
        <h3 className={styles.subsectionTitle}>
          <Timer className={styles.subsectionIcon} />
          {t.schedulingScheduledTasks}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {scheduling.cronJobs.map((job) => {
            const jobName = t.schedulingCronJobNames?.[job.nameKey] || job.nameKey;
            const lastRunTime = job.lastRunKey === 'yesterday' 
              ? t.schedulingLastRunTimes?.yesterday 
              : (t.schedulingLastRunTimes?.[job.lastRunKey] || '').replace('{count}', job.lastRunCount);
            
            return (
              <div key={job.id} className={styles.cronJobCard}>
                <div className={styles.cronJobInfo}>
                  <div className={`${styles.cronJobIcon} ${job.enabled ? styles.active : styles.inactive}`}>
                    <Workflow size={20} />
                  </div>
                  <div className={styles.cronJobContent}>
                    <span className={styles.cronJobName}>{jobName}</span>
                    <div className={styles.cronJobMeta}>
                      <span className={styles.cronSchedule}>{job.schedule}</span>
                      <span>{t.schedulingLastRun} {lastRunTime}</span>
                    </div>
                  </div>
                </div>
                <div className={styles.cronJobActions}>
                  <button className={styles.editButton}>
                    <Edit2 size={12} style={{ marginRight: '0.25rem' }} />
                    {t.schedulingEdit}
                  </button>
                  <button 
                    className={`${styles.toggleSwitch} ${job.enabled ? styles.active : ''}`}
                    onClick={() => toggleCronJob(job.id)}
                    style={{ width: '2.5rem', height: '1.25rem' }}
                  >
                    <div className={styles.toggleKnob} style={{ width: '1rem', height: '1rem', top: '0.125rem' }}></div>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <button className={styles.addButton} style={{ marginTop: '1rem' }}>
          <Plus size={16} />
          {t.schedulingAddScheduledTask}
        </button>
      </div>

      <div className={styles.subsection}>
        <h3 className={styles.subsectionTitle}>
          <Clock className={styles.subsectionIcon} />
          {t.schedulingQueueSettings}
        </h3>
        <div className={styles.formGrid}>
          <div className={`${styles.formGroup} ${styles.rangeGroup}`}>
            <div className={styles.rangeHeader}>
              <label className={styles.formLabel}>{t.schedulingQueueConcurrency}</label>
              <span className={styles.rangeValue}>{scheduling.queueConcurrency}</span>
            </div>
            <input 
              type="range"
              className={styles.rangeInput}
              min="1"
              max="10"
              value={scheduling.queueConcurrency}
              onChange={(e) => setScheduling(prev => ({ ...prev, queueConcurrency: parseInt(e.target.value) }))}
            />
            <div className={styles.rangeLabels}>
              <span>1</span>
              <span>10</span>
            </div>
          </div>
          <div className={`${styles.formGroup} ${styles.rangeGroup}`}>
            <div className={styles.rangeHeader}>
              <label className={styles.formLabel}>{t.schedulingRetryAttempts}</label>
              <span className={styles.rangeValue}>{scheduling.retryAttempts}</span>
            </div>
            <input 
              type="range"
              className={styles.rangeInput}
              min="1"
              max="5"
              value={scheduling.retryAttempts}
              onChange={(e) => setScheduling(prev => ({ ...prev, retryAttempts: parseInt(e.target.value) }))}
            />
            <div className={styles.rangeLabels}>
              <span>1</span>
              <span>5</span>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.saveButtonWrapper}>
        <button className={styles.saveButton}>{t.saveChanges}</button>
      </div>
    </>
  );
}

// Notifications Settings Component
function NotificationsSettings({ notifications, setNotifications, translations, canEdit = true }) {
  const t = translations;
  
  const updateField = (field, value) => {
    setNotifications(prev => ({ ...prev, [field]: value }));
  };

  return (
    <>
      <div className={styles.subsection} style={{ borderTop: 'none', paddingTop: 0, marginTop: 0 }}>
        <h3 className={styles.subsectionTitle}>
          <Bell className={styles.subsectionIcon} />
          {t.notificationsEmailNotifications}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className={styles.toggleRow}>
            <div className={styles.toggleInfo}>
              <Check className={styles.toggleIcon} />
              <div className={styles.toggleContent}>
                <span className={styles.toggleLabel}>{t.notificationsNewContentPublished}</span>
                <span className={styles.toggleDescription}>{t.notificationsNewContentPublishedDesc}</span>
              </div>
            </div>
            <button 
              className={`${styles.toggleSwitch} ${notifications.emailNewContent ? styles.active : ''}`}
              onClick={() => updateField('emailNewContent', !notifications.emailNewContent)}
            >
              <div className={styles.toggleKnob}></div>
            </button>
          </div>
          <div className={styles.toggleRow}>
            <div className={styles.toggleInfo}>
              <Calendar className={styles.toggleIcon} />
              <div className={styles.toggleContent}>
                <span className={styles.toggleLabel}>{t.notificationsWeeklyReport}</span>
                <span className={styles.toggleDescription}>{t.notificationsWeeklyReportDesc}</span>
              </div>
            </div>
            <button 
              className={`${styles.toggleSwitch} ${notifications.emailWeeklyReport ? styles.active : ''}`}
              onClick={() => updateField('emailWeeklyReport', !notifications.emailWeeklyReport)}
            >
              <div className={styles.toggleKnob}></div>
            </button>
          </div>
          <div className={styles.toggleRow}>
            <div className={styles.toggleInfo}>
              <AlertTriangle className={styles.toggleIcon} />
              <div className={styles.toggleContent}>
                <span className={styles.toggleLabel}>{t.notificationsErrorAlerts}</span>
                <span className={styles.toggleDescription}>{t.notificationsErrorAlertsDesc}</span>
              </div>
            </div>
            <button 
              className={`${styles.toggleSwitch} ${notifications.emailErrors ? styles.active : ''}`}
              onClick={() => updateField('emailErrors', !notifications.emailErrors)}
            >
              <div className={styles.toggleKnob}></div>
            </button>
          </div>
          <div className={styles.toggleRow}>
            <div className={styles.toggleInfo}>
              <Sparkles className={styles.toggleIcon} />
              <div className={styles.toggleContent}>
                <span className={styles.toggleLabel}>{t.notificationsMarketingUpdates}</span>
                <span className={styles.toggleDescription}>{t.notificationsMarketingUpdatesDesc}</span>
              </div>
            </div>
            <button 
              className={`${styles.toggleSwitch} ${notifications.emailMarketing ? styles.active : ''}`}
              onClick={() => updateField('emailMarketing', !notifications.emailMarketing)}
            >
              <div className={styles.toggleKnob}></div>
            </button>
          </div>
        </div>
      </div>

      <div className={styles.subsection}>
        <h3 className={styles.subsectionTitle}>
          <Link className={styles.subsectionIcon} />
          {t.notificationsSlackIntegration}
        </h3>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>{t.notificationsSlackWebhookUrl}</label>
          <input 
            type="url" 
            className={styles.formInput}
            value={notifications.slackWebhook}
            onChange={(e) => updateField('slackWebhook', e.target.value)}
            placeholder={t.notificationsSlackWebhookPlaceholder}
          />
        </div>
        <div className={styles.toggleRow} style={{ marginTop: '1rem' }}>
          <div className={styles.toggleInfo}>
            <Play className={styles.toggleIcon} />
            <div className={styles.toggleContent}>
              <span className={styles.toggleLabel}>{t.notificationsEnableSlack}</span>
              <span className={styles.toggleDescription}>{t.notificationsEnableSlackDesc}</span>
            </div>
          </div>
          <button 
            className={`${styles.toggleSwitch} ${notifications.slackEnabled ? styles.active : ''}`}
            onClick={() => updateField('slackEnabled', !notifications.slackEnabled)}
          >
            <div className={styles.toggleKnob}></div>
          </button>
        </div>
      </div>

      <div className={styles.saveButtonWrapper}>
        <button className={styles.saveButton}>{t.saveChanges}</button>
      </div>
    </>
  );
}

// SEO Settings Component
function SEOSettings({ seo, setSeo, translations, canEdit = true }) {
  const t = translations;
  
  const updateField = (field, value) => {
    setSeo(prev => ({ ...prev, [field]: value }));
  };

  return (
    <>
      <div className={styles.formGrid}>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>{t.seoSiteNameSeo}</label>
          <input 
            type="text" 
            className={styles.formInput}
            value={seo.siteName}
            onChange={(e) => updateField('siteName', e.target.value)}
            placeholder={t.siteNamePlaceholder}
          />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>{t.seoDefaultOgImage}</label>
          <input 
            type="url" 
            className={styles.formInput}
            value={seo.defaultOgImage}
            onChange={(e) => updateField('defaultOgImage', e.target.value)}
            placeholder={t.seoDefaultOgImagePlaceholder}
          />
        </div>
        <div className={`${styles.formGroup} ${styles.fullWidth}`}>
          <label className={styles.formLabel}>{t.seoMetaDescription}</label>
          <textarea 
            className={styles.formTextarea}
            value={seo.metaDescription}
            onChange={(e) => updateField('metaDescription', e.target.value)}
            placeholder={t.seoMetaDescriptionPlaceholder}
          />
        </div>
      </div>

      <div className={styles.subsection}>
        <h3 className={styles.subsectionTitle}>
          <Globe className={styles.subsectionIcon} />
          {t.seoTechnicalSeo}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className={styles.toggleRow}>
            <div className={styles.toggleInfo}>
              <Check className={styles.toggleIcon} />
              <div className={styles.toggleContent}>
                <span className={styles.toggleLabel}>{t.seoAutoSitemap}</span>
                <span className={styles.toggleDescription}>{t.seoAutoSitemapDesc}</span>
              </div>
            </div>
            <button 
              className={`${styles.toggleSwitch} ${seo.enableSitemap ? styles.active : ''}`}
              onClick={() => updateField('enableSitemap', !seo.enableSitemap)}
            >
              <div className={styles.toggleKnob}></div>
            </button>
          </div>
          <div className={styles.toggleRow}>
            <div className={styles.toggleInfo}>
              <Check className={styles.toggleIcon} />
              <div className={styles.toggleContent}>
                <span className={styles.toggleLabel}>{t.seoRobotsTxt}</span>
                <span className={styles.toggleDescription}>{t.seoRobotsTxtDesc}</span>
              </div>
            </div>
            <button 
              className={`${styles.toggleSwitch} ${seo.enableRobots ? styles.active : ''}`}
              onClick={() => updateField('enableRobots', !seo.enableRobots)}
            >
              <div className={styles.toggleKnob}></div>
            </button>
          </div>
          <div className={styles.toggleRow}>
            <div className={styles.toggleInfo}>
              <Check className={styles.toggleIcon} />
              <div className={styles.toggleContent}>
                <span className={styles.toggleLabel}>{t.seoSchemaMarkup}</span>
                <span className={styles.toggleDescription}>{t.seoSchemaMarkupDesc}</span>
              </div>
            </div>
            <button 
              className={`${styles.toggleSwitch} ${seo.enableSchemaMarkup ? styles.active : ''}`}
              onClick={() => updateField('enableSchemaMarkup', !seo.enableSchemaMarkup)}
            >
              <div className={styles.toggleKnob}></div>
            </button>
          </div>
        </div>
      </div>

      <div className={styles.saveButtonWrapper}>
        <button className={styles.saveButton}>{t.saveChanges}</button>
      </div>
    </>
  );
}

// Integrations Settings Component
function IntegrationsSettings({ translations, canEdit = true }) {
  const t = translations;
  
  const integrations = [
    { id: 'google-analytics', name: 'Google Analytics', connected: true, icon: '📊' },
    { id: 'google-search-console', name: 'Google Search Console', connected: true, icon: '🔍' },
    { id: 'wordpress', name: 'WordPress', connected: true, icon: '📝' },
    { id: 'semrush', name: 'SEMrush', connected: false, icon: '📈' },
    { id: 'ahrefs', name: 'Ahrefs', connected: false, icon: '🔗' },
  ];

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {integrations.map((integration) => (
          <div key={integration.id} className={styles.toggleRow}>
            <div className={styles.toggleInfo}>
              <span style={{ fontSize: '1.5rem' }}>{integration.icon}</span>
              <div className={styles.toggleContent}>
                <span className={styles.toggleLabel}>{integration.name}</span>
                <span className={styles.toggleDescription}>
                  {integration.connected ? t.integrationsConnectedSyncing : t.integrationsNotConnected}
                </span>
              </div>
            </div>
            <button 
              className={styles.editButton}
              style={{ 
                background: integration.connected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(123, 44, 191, 0.1)',
                color: integration.connected ? '#10b981' : 'var(--primary)'
              }}
            >
              {integration.connected ? t.integrationsConfigure : t.integrationsConnect}
            </button>
          </div>
        ))}
      </div>

      <button className={styles.addButton} style={{ marginTop: '1.5rem' }}>
        <Plus size={16} />
        {t.integrationsAddIntegration}
      </button>

      <div className={styles.saveButtonWrapper}>
        <button className={styles.saveButton}>{t.saveChanges}</button>
      </div>
    </>
  );
}

// Users Settings Component
function UsersSettings({ translations, canEdit = true }) {
  const t = translations;
  const { locale } = useLocale();
  const us = t.usersSection || {};
  
  const [members, setMembers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRoleId, setInviteRoleId] = useState('');
  const [inviteLanguage, setInviteLanguage] = useState('EN');
  const [isInviting, setIsInviting] = useState(false);
  const [showConfirmRemove, setShowConfirmRemove] = useState(null);
  const [showChangeRole, setShowChangeRole] = useState(null);
  const [selectedNewRoleId, setSelectedNewRoleId] = useState('');
  const [actionLoading, setActionLoading] = useState(null);
  
  // Available languages for email
  const emailLanguages = [
    { value: 'EN', label: 'English' },
    { value: 'HE', label: 'עברית' },
  ];

  // Fetch members and roles on mount
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [membersRes, rolesRes, accountRes] = await Promise.all([
        fetch('/api/settings/users'),
        fetch('/api/settings/roles'),
        fetch('/api/settings/general'),
      ]);
      
      if (membersRes.ok) {
        const data = await membersRes.json();
        setMembers(data.members || []);
      }
      
      if (rolesRes.ok) {
        const data = await rolesRes.json();
        setRoles(data.roles || []);
        // Set default invite role to first non-owner role
        const defaultRole = data.roles?.find(r => r.name !== 'Owner');
        if (defaultRole) {
          setInviteRoleId(defaultRole.id);
        }
      }
      
      // Set default invite language from account settings
      if (accountRes.ok) {
        const accountData = await accountRes.json();
        if (accountData.settings?.defaultLanguage) {
          setInviteLanguage(accountData.settings.defaultLanguage);
        }
      }
    } catch (error) {
      console.error('Error fetching users data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail || !inviteRoleId) return;

    try {
      setIsInviting(true);
      const res = await fetch('/api/settings/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: inviteEmail, 
          roleId: inviteRoleId,
          language: inviteLanguage,
        }),
      });

      if (res.ok) {
        setInviteEmail('');
        await fetchData(); // Refresh the list
      } else {
        const error = await res.json();
        alert(error.message || 'Failed to invite user');
      }
    } catch (error) {
      console.error('Error inviting user:', error);
    } finally {
      setIsInviting(false);
    }
  };

  const handleResendInvite = async (memberId) => {
    try {
      setActionLoading(memberId);
      const res = await fetch(`/api/settings/users/${memberId}/resend`, {
        method: 'POST',
      });

      if (!res.ok) {
        const error = await res.json();
        alert(error.message || 'Failed to resend invite');
      }
    } catch (error) {
      console.error('Error resending invite:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemove = async (memberId) => {
    try {
      setActionLoading(memberId);
      const res = await fetch(`/api/settings/users/${memberId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        await fetchData(); // Refresh the list
      } else {
        const error = await res.json();
        alert(error.message || 'Failed to remove user');
      }
    } catch (error) {
      console.error('Error removing user:', error);
    } finally {
      setActionLoading(null);
      setShowConfirmRemove(null);
    }
  };

  const handleSuspend = async (memberId) => {
    try {
      setActionLoading(memberId);
      const res = await fetch(`/api/settings/users/${memberId}/suspend`, {
        method: 'POST',
      });

      if (res.ok) {
        await fetchData();
      } else {
        const error = await res.json();
        alert(error.message || 'Failed to suspend user');
      }
    } catch (error) {
      console.error('Error suspending user:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleActivate = async (memberId) => {
    try {
      setActionLoading(memberId);
      const res = await fetch(`/api/settings/users/${memberId}/activate`, {
        method: 'POST',
      });

      if (res.ok) {
        await fetchData();
      } else {
        const error = await res.json();
        alert(error.message || 'Failed to activate user');
      }
    } catch (error) {
      console.error('Error activating user:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleChangeRole = async () => {
    if (!showChangeRole || !selectedNewRoleId) return;

    try {
      setActionLoading(showChangeRole);
      const res = await fetch(`/api/settings/users/${showChangeRole}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleId: selectedNewRoleId }),
      });

      if (res.ok) {
        await fetchData();
      } else {
        const error = await res.json();
        alert(error.message || 'Failed to change role');
      }
    } catch (error) {
      console.error('Error changing role:', error);
    } finally {
      setActionLoading(null);
      setShowChangeRole(null);
      setSelectedNewRoleId('');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusClass = (status) => {
    switch (status) {
      case 'ACTIVE': return styles.statusActive;
      case 'PENDING': return styles.statusPending;
      case 'SUSPENDED': return styles.statusSuspended;
      case 'REMOVED': return styles.statusRemoved;
      default: return '';
    }
  };

  const getStatusLabel = (status) => {
    const statuses = us.statuses || {};
    switch (status) {
      case 'ACTIVE': return statuses.active || 'Active';
      case 'PENDING': return statuses.pending || 'Pending';
      case 'SUSPENDED': return statuses.suspended || 'Suspended';
      case 'REMOVED': return statuses.removed || 'Removed';
      default: return status;
    }
  };

  // Get translated role label - uses key for lookup, falls back to name
  const getRoleLabel = (roleKey, roleName) => {
    // If called with a single argument (role object), extract key and name
    if (roleKey && typeof roleKey === 'object') {
      const role = roleKey;
      roleName = role.name;
      roleKey = role.key;
    }
    
    if (!roleKey && !roleName) return us.roles?.user || 'User';
    
    // Try to find translation by key first
    if (roleKey) {
      const translatedByKey = us.roles?.[roleKey];
      if (translatedByKey) return translatedByKey;
    }
    
    // Fall back to looking up by lowercased name
    if (roleName) {
      const nameKey = roleName.toLowerCase().replace(/\s+/g, '_');
      const translatedByName = us.roles?.[nameKey];
      if (translatedByName) return translatedByName;
    }
    
    // Final fallback: return the name as-is
    return roleName || roleKey || 'User';
  };

  if (isLoading) {
    return (
      <div className={styles.loadingContainer}>
        <Loader2 className={styles.spinner} size={24} />
        <span>{t.loading || 'Loading...'}</span>
      </div>
    );
  }

  return (
    <>
      {/* Invite User Section */}
      {canEdit && (
        <div className={styles.inviteSection}>
          <h3 className={styles.sectionSubtitle}>{us.inviteUser || 'Invite User'}</h3>
          <form onSubmit={handleInvite} className={styles.inviteForm}>
            <div className={styles.inviteInputGroup}>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder={us.emailPlaceholder || 'Enter email address'}
                className={styles.inviteInput}
                required
              />
              <select
                value={inviteRoleId}
                onChange={(e) => setInviteRoleId(e.target.value)}
                className={styles.roleSelect}
                required
              >
                {roles.filter(r => r.name !== 'Owner').map((role) => (
                  <option key={role.id} value={role.id}>
                    {getRoleLabel(role)}
                  </option>
                ))}
              </select>
              <select
                value={inviteLanguage}
                onChange={(e) => setInviteLanguage(e.target.value)}
                className={styles.languageSelect}
                title={us.emailLanguage || 'Email language'}
              >
                {emailLanguages.map((lang) => (
                  <option key={lang.value} value={lang.value}>
                    {lang.label}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className={styles.inviteButton}
                disabled={isInviting || !inviteEmail || !inviteRoleId}
              >
                {isInviting ? (
                  <Loader2 className={styles.spinner} size={16} />
                ) : (
                  <Send size={16} />
                )}
                {us.sendInvite || 'Send Invite'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Members List */}
      <div className={styles.usersListSection}>
        <h3 className={styles.sectionSubtitle}>{us.title || 'Account Users'}</h3>
        
        {members.length === 0 ? (
          <div className={styles.emptyState}>
            <Users size={48} className={styles.emptyIcon} />
            <p>{us.noUsers || 'No users in this account yet'}</p>
          </div>
        ) : (
          <div className={styles.usersTable}>
            <div className={styles.usersTableHeader}>
              <span>{us.columns?.user || 'User'}</span>
              <span>{us.columns?.role || 'Role'}</span>
              <span>{us.columns?.status || 'Status'}</span>
              <span>{us.columns?.joinedAt || 'Joined'}</span>
              <span>{us.columns?.actions || 'Actions'}</span>
            </div>
            
            {members.map((member) => (
              <div key={member.id} className={styles.usersTableRow}>
                <div className={styles.userCell}>
                  <div className={styles.userAvatar}>
                    {member.user?.firstName?.[0] || member.user?.email?.[0] || '?'}
                  </div>
                  <div className={styles.userInfo}>
                    <span className={styles.userName}>
                      {member.user?.firstName && member.user?.lastName 
                        ? `${member.user.firstName} ${member.user.lastName}`
                        : member.user?.email || member.inviteEmail || 'Unknown'}
                      {member.isOwner && (
                        <span className={styles.ownerBadge}>
                          <Crown size={12} />
                          {us.ownerBadge || 'Owner'}
                        </span>
                      )}
                      {member.isCurrentUser && (
                        <span className={styles.youBadge}>{us.youBadge || 'You'}</span>
                      )}
                    </span>
                    <span className={styles.userEmail}>{member.user?.email || member.inviteEmail}</span>
                  </div>
                </div>
                
                <div className={styles.roleCell}>
                  <span className={`${styles.roleBadge} ${styles[member.role?.key || member.role?.name?.toLowerCase() || 'user']}`}>
                    {getRoleLabel(member.role)}
                  </span>
                </div>
                
                <div className={styles.statusCell}>
                  <span className={`${styles.statusBadgeSmall} ${getStatusClass(member.status)}`}>
                    <span className={styles.statusDot}></span>
                    {getStatusLabel(member.status)}
                  </span>
                </div>
                
                <div className={styles.dateCell}>
                  {formatDate(member.status === 'PENDING' ? member.invitedAt : member.joinedAt)}
                </div>
                
                <div className={styles.actionsCell}>
                  {!member.isOwner && !member.isCurrentUser && canEdit && (
                    <>
                      {member.status === 'PENDING' && (
                        <button
                          className={styles.actionBtn}
                          onClick={() => handleResendInvite(member.id)}
                          disabled={actionLoading === member.id}
                          title={us.actions?.resendInvite || 'Resend Invite'}
                        >
                          {actionLoading === member.id ? (
                            <Loader2 className={styles.spinner} size={14} />
                          ) : (
                            <RefreshCw size={14} />
                          )}
                        </button>
                      )}
                      
                      <button
                        className={styles.actionBtn}
                        onClick={() => {
                          setShowChangeRole(member.id);
                          setSelectedNewRoleId(member.roleId);
                        }}
                        title={us.actions?.changeRole || 'Change Role'}
                      >
                        <Shield size={14} />
                      </button>
                      
                      {member.status === 'ACTIVE' && (
                        <button
                          className={`${styles.actionBtn} ${styles.warning}`}
                          onClick={() => handleSuspend(member.id)}
                          disabled={actionLoading === member.id}
                          title={us.actions?.suspend || 'Suspend'}
                        >
                          {actionLoading === member.id ? (
                            <Loader2 className={styles.spinner} size={14} />
                          ) : (
                            <Ban size={14} />
                          )}
                        </button>
                      )}
                      
                      {member.status === 'SUSPENDED' && (
                        <button
                          className={`${styles.actionBtn} ${styles.success}`}
                          onClick={() => handleActivate(member.id)}
                          disabled={actionLoading === member.id}
                          title={us.actions?.activate || 'Activate'}
                        >
                          {actionLoading === member.id ? (
                            <Loader2 className={styles.spinner} size={14} />
                          ) : (
                            <Check size={14} />
                          )}
                        </button>
                      )}
                      
                      <button
                        className={`${styles.actionBtn} ${styles.danger}`}
                        onClick={() => setShowConfirmRemove(member.id)}
                        disabled={actionLoading === member.id}
                        title={us.actions?.remove || 'Remove'}
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirm Remove Modal */}
      {showConfirmRemove && (
        <div className={styles.modalOverlay} onClick={() => setShowConfirmRemove(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3>{us.confirmRemove?.title || 'Remove User'}</h3>
            <p>{us.confirmRemove?.message || 'Are you sure you want to remove this user from your account?'}</p>
            <div className={styles.modalActions}>
              <button 
                className={styles.cancelBtn} 
                onClick={() => setShowConfirmRemove(null)}
              >
                {us.confirmRemove?.cancel || 'Cancel'}
              </button>
              <button 
                className={styles.dangerBtn} 
                onClick={() => handleRemove(showConfirmRemove)}
                disabled={actionLoading === showConfirmRemove}
              >
                {actionLoading === showConfirmRemove ? (
                  <Loader2 className={styles.spinner} size={14} />
                ) : null}
                {us.confirmRemove?.confirm || 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Role Modal */}
      {showChangeRole && (
        <div className={styles.modalOverlay} onClick={() => setShowChangeRole(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3>{us.changeRoleModal?.title || 'Change Role'}</h3>
            <p>{us.changeRoleModal?.message || 'Select a new role for this user:'}</p>
            <select
              value={selectedNewRoleId}
              onChange={(e) => setSelectedNewRoleId(e.target.value)}
              className={styles.roleSelectModal}
            >
              {roles.filter(r => r.name !== 'Owner').map((role) => (
                <option key={role.id} value={role.id}>
                  {getRoleLabel(role)}
                </option>
              ))}
            </select>
            <div className={styles.modalActions}>
              <button 
                className={styles.cancelBtn} 
                onClick={() => setShowChangeRole(null)}
              >
                {us.changeRoleModal?.cancel || 'Cancel'}
              </button>
              <button 
                className={styles.primaryBtn} 
                onClick={handleChangeRole}
                disabled={actionLoading === showChangeRole}
              >
                {actionLoading === showChangeRole ? (
                  <Loader2 className={styles.spinner} size={14} />
                ) : null}
                {us.changeRoleModal?.confirm || 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Team Settings Component
function TeamSettings({ team, translations, canEdit = true }) {
  const t = translations;
  
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {team.members.map((member) => (
          <div key={member.id} className={styles.teamMemberRow}>
            <div className={styles.memberInfo}>
              <span className={styles.memberName}>{member.name}</span>
              <span className={styles.memberEmail}>{member.email}</span>
            </div>
            <span className={`${styles.roleBadge} ${styles[member.role.toLowerCase()]}`}>
              {member.roleLabel}
            </span>
            <span className={styles.statusBadge}>
              <span className={styles.statusDot}></span>
              {member.statusLabel}
            </span>
            <div className={styles.memberActions}>
              <button className={styles.actionButton}>
                <Edit2 size={14} />
              </button>
              <button className={`${styles.actionButton} ${styles.danger}`}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <button className={styles.addButton} style={{ marginTop: '1.5rem' }}>
        <Plus size={16} />
        {t.teamInviteTeamMember}
      </button>

      <div className={styles.saveButtonWrapper}>
        <button className={styles.saveButton}>{t.saveChanges}</button>
      </div>
    </>
  );
}

// Subscription Settings Component
function SubscriptionSettings({ subscription, translations, canEdit = true }) {
  const t = translations;
  const { locale, t: translate } = useLocale();
  const usagePercentage = subscription.tokensLimit > 0 
    ? (subscription.tokensUsed / subscription.tokensLimit) * 100 
    : 0;

  // Format date according to current locale
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // Format currency
  const formatPrice = (price, currency = 'USD') => {
    return new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(price);
  };

  // Get period label based on interval
  const getPeriodLabel = () => {
    if (subscription.interval === 'YEARLY') {
      return translate('settings.subscriptionSection.perYear') || '/year';
    }
    return t.subscriptionPerMonth || '/month';
  };

  return (
    <>
      <div className={styles.subscriptionCard}>
        <div className={styles.subscriptionHeader}>
          <div className={styles.planInfo}>
            <div className={styles.planName}>
              <Crown size={20} style={{ display: 'inline', marginRight: '0.5rem' }} />
              {subscription.planLabel} {t.subscriptionPlan}
            </div>
            <div className={`${styles.planStatus} ${subscription.status !== 'ACTIVE' ? styles.statusWarning : ''}`}>
              {subscription.status === 'ACTIVE' ? <Check size={14} /> : <AlertTriangle size={14} />}
              {subscription.statusLabel}
              {subscription.cancelAtPeriodEnd && (
                <span className={styles.cancelNotice}> ({translate('settings.subscriptionSection.cancelsAtPeriodEnd') || 'Cancels at period end'})</span>
              )}
            </div>
          </div>
          <div className={styles.planPrice}>
            <div className={styles.priceAmount}>{formatPrice(subscription.price, subscription.currency)}</div>
            <div className={styles.pricePeriod}>{getPeriodLabel()}</div>
          </div>
        </div>

        <div className={styles.usageBar}>
          <div className={styles.usageHeader}>
            <span className={styles.usageLabel}>{t.subscriptionTokenUsage}</span>
            <span className={styles.usageValue}>
              {(subscription.tokensUsed / 1000).toFixed(0)}K / {(subscription.tokensLimit / 1000).toFixed(0)}K
            </span>
          </div>
          <div className={styles.usageTrack}>
            <div 
              className={styles.usageFill} 
              style={{ width: `${Math.min(usagePercentage, 100)}%` }}
            ></div>
          </div>
        </div>

        <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
          {t.subscriptionNextBillingDate} <strong>{formatDate(subscription.nextBillingDate)}</strong>
        </p>
      </div>

      <div className={styles.subsection}>
        <h3 className={styles.subsectionTitle}>
          <CreditCard className={styles.subsectionIcon} />
          {t.subscriptionBillingActions}
        </h3>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button className={styles.editButton}>
            <Crown size={14} style={{ marginRight: '0.25rem' }} />
            {t.subscriptionUpgradePlan}
          </button>
          <button className={styles.editButton}>
            <CreditCard size={14} style={{ marginRight: '0.25rem' }} />
            {t.subscriptionUpdatePaymentMethod}
          </button>
          <button className={styles.editButton}>
            {t.subscriptionViewInvoices}
          </button>
        </div>
      </div>
    </>
  );
}

// Account Settings Component
function AccountSettings({ translations, canEdit = true }) {
  const t = translations;
  const router = useRouter();
  const { locale } = useLocale();
  const { user } = useUser();
  const accountSection = t?.accountSection || {};
  
  const [account, setAccount] = useState({
    name: user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : '',
    email: user?.email || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  
  // Delete account state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  
  // The confirmation text required (language-specific)
  const requiredConfirmText = locale === 'he' ? 'מחיקת חשבון' : 'DELETE ACCOUNT';
  const canDelete = deleteConfirmText === requiredConfirmText;

  const updateField = (field, value) => {
    setAccount(prev => ({ ...prev, [field]: value }));
  };
  
  const handleDeleteAccount = async () => {
    if (!canDelete) return;
    
    setIsDeleting(true);
    setDeleteError(null);
    
    try {
      const response = await fetch('/api/account/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete account');
      }
      
      // Redirect to home page after successful deletion
      router.push('/');
    } catch (error) {
      console.error('Delete account error:', error);
      setDeleteError(error.message);
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className={styles.formGrid}>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>{accountSection.fullName || t.accountFullName}</label>
          <input 
            type="text" 
            className={styles.formInput}
            value={account.name}
            onChange={(e) => updateField('name', e.target.value)}
          />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>{accountSection.emailAddress || t.accountEmailAddress}</label>
          <input 
            type="email" 
            className={styles.formInput}
            value={account.email}
            onChange={(e) => updateField('email', e.target.value)}
          />
        </div>
      </div>

      <div className={styles.subsection}>
        <h3 className={styles.subsectionTitle}>
          <Shield className={styles.subsectionIcon} />
          {accountSection.changePassword || t.accountChangePassword}
        </h3>
        <div className={styles.formGrid}>
          <div className={`${styles.formGroup} ${styles.fullWidth}`}>
            <label className={styles.formLabel}>{accountSection.currentPassword || t.accountCurrentPassword}</label>
            <input 
              type="password" 
              className={styles.formInput}
              value={account.currentPassword}
              onChange={(e) => updateField('currentPassword', e.target.value)}
              placeholder={accountSection.currentPasswordPlaceholder || t.accountCurrentPasswordPlaceholder}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>{accountSection.newPassword || t.accountNewPassword}</label>
            <input 
              type="password" 
              className={styles.formInput}
              value={account.newPassword}
              onChange={(e) => updateField('newPassword', e.target.value)}
              placeholder={accountSection.newPasswordPlaceholder || t.accountNewPasswordPlaceholder}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>{accountSection.confirmNewPassword || t.accountConfirmNewPassword}</label>
            <input 
              type="password" 
              className={styles.formInput}
              value={account.confirmPassword}
              onChange={(e) => updateField('confirmPassword', e.target.value)}
              placeholder={accountSection.confirmPasswordPlaceholder || t.accountConfirmPasswordPlaceholder}
            />
          </div>
        </div>
      </div>

      <div className={styles.subsection}>
        <h3 className={styles.subsectionTitle}>
          <AlertTriangle className={styles.subsectionIcon} />
          {accountSection.dangerZone || t.accountDangerZone}
        </h3>
        <div className={styles.warningBox}>
          <div className={styles.warningContent}>
            <AlertTriangle className={styles.warningIcon} />
            <div className={styles.warningInfo}>
              <span className={styles.warningLabel}>{accountSection.deleteAccount || t.accountDeleteAccount}</span>
              <span className={styles.warningDescription}>{accountSection.deleteAccountDesc || t.accountDeleteAccountDesc}</span>
            </div>
          </div>
          <button 
            className={styles.editButton}
            style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}
            onClick={() => setShowDeleteModal(true)}
          >
            {accountSection.deleteAccount || t.accountDeleteAccount}
          </button>
        </div>
      </div>

      <div className={styles.saveButtonWrapper}>
        <button className={styles.saveButton}>{t.saveChanges}</button>
      </div>
      
      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className={styles.modalOverlay} onClick={() => !isDeleting && setShowDeleteModal(false)}>
          <div className={styles.deleteAccountModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.deleteAccountHeader}>
              <AlertTriangle className={styles.deleteAccountIcon} />
              <h2 className={styles.deleteAccountTitle}>
                {accountSection.deleteAccountTitle || 'Delete Account Permanently'}
              </h2>
            </div>
            
            <div className={styles.deleteAccountWarning}>
              {accountSection.deleteAccountWarning || 'This action is irreversible. Once your account is deleted, the data cannot be recovered.'}
            </div>
            
            <div className={styles.deleteAccountConsequences}>
              <h4>{accountSection.deleteAccountConsequences || 'What will be deleted:'}</h4>
              <ul>
                <li><X size={14} /> {accountSection.deleteAccountConsequence1 || 'All websites linked to this account'}</li>
                <li><X size={14} /> {accountSection.deleteAccountConsequence2 || 'All content, keywords, and data'}</li>
                <li><X size={14} /> {accountSection.deleteAccountConsequence3 || 'All team members will lose access'}</li>
                <li><X size={14} /> {accountSection.deleteAccountConsequence4 || 'Subscription will be cancelled without refund'}</li>
              </ul>
            </div>
            
            <div className={styles.deleteAccountConfirm}>
              <label className={styles.deleteAccountConfirmLabel}>
                {accountSection.deleteAccountConfirmLabel || `To confirm, type "${requiredConfirmText}" in the field below:`}
              </label>
              <input
                type="text"
                className={styles.deleteAccountInput}
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={accountSection.deleteAccountConfirmPlaceholder || `Type ${requiredConfirmText}`}
                disabled={isDeleting}
              />
            </div>
            
            {deleteError && (
              <div className={styles.deleteAccountError}>
                {deleteError}
              </div>
            )}
            
            <div className={styles.deleteAccountActions}>
              <button 
                className={styles.deleteAccountCancelBtn}
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
              >
                {accountSection.deleteAccountCancel || 'Cancel'}
              </button>
              <button 
                className={styles.deleteAccountConfirmBtn}
                onClick={handleDeleteAccount}
                disabled={!canDelete || isDeleting}
              >
                {isDeleting ? (
                  <>
                    <Loader2 size={16} className={styles.spinningIcon} />
                    {accountSection.deleteAccountDeleting || 'Deleting...'}
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    {accountSection.deleteAccountButton || 'Delete Account Permanently'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Roles Settings Component
function RolesSettings({ translations, canEdit = true }) {
  const { t } = useLocale();
  const [roles, setRoles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [formData, setFormData] = useState({ key: '', name: '', description: '' });
  const [error, setError] = useState(null);

  const us = translations?.usersSection || {};

  // Get translated role label - uses key for lookup, falls back to name
  const getRoleLabel = (role) => {
    if (!role) return us.roles?.user || 'User';
    const roleKey = role.key;
    const roleName = role.name;
    
    // Try to find translation by key first
    if (roleKey) {
      const translatedByKey = us.roles?.[roleKey];
      if (translatedByKey) return translatedByKey;
    }
    
    // Fall back to looking up by lowercased name
    if (roleName) {
      const nameKey = roleName.toLowerCase().replace(/\s+/g, '_');
      const translatedByName = us.roles?.[nameKey];
      if (translatedByName) return translatedByName;
    }
    
    // Final fallback: return the name as-is
    return roleName || roleKey || 'User';
  };

  // Validate key field - only allow English letters, numbers, underscores, and hyphens
  const validateKey = (value) => {
    return /^[a-zA-Z0-9_-]*$/.test(value);
  };

  const handleKeyChange = (e) => {
    const value = e.target.value.toLowerCase();
    if (validateKey(value)) {
      setFormData({ ...formData, key: value });
    }
  };

  // Fetch roles
  useEffect(() => {
    async function fetchRoles() {
      setIsLoading(true);
      try {
        const response = await fetch('/api/settings/roles');
        if (response.ok) {
          const data = await response.json();
          setRoles(data.roles || []);
        }
      } catch (err) {
        console.error('Failed to fetch roles:', err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchRoles();
  }, []);

  const handleAdd = () => {
    setEditingRole(null);
    setFormData({ key: '', name: '', description: '' });
    setError(null);
    setModalOpen(true);
  };

  const handleEdit = (role) => {
    setEditingRole(role);
    setFormData({ key: role.key || '', name: role.name, description: role.description || '' });
    setError(null);
    setModalOpen(true);
  };

  const handleDelete = async (role) => {
    if (role.isSystemRole) {
      alert(t('settings.rolesSection.cannotDeleteSystem'));
      return;
    }
    if (role.membersCount > 0) {
      alert(t('settings.rolesSection.cannotDeleteWithMembers'));
      return;
    }
    setDeleteConfirm(role);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/settings/roles/${deleteConfirm.id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setRoles(roles.filter(r => r.id !== deleteConfirm.id));
        setDeleteConfirm(null);
      } else {
        const data = await response.json();
        alert(data.error || t('settings.rolesSection.deleteFailed'));
      }
    } catch (err) {
      console.error('Failed to delete role:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const url = editingRole 
        ? `/api/settings/roles/${editingRole.id}` 
        : '/api/settings/roles';
      const method = editingRole ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        const data = await response.json();
        if (editingRole) {
          setRoles(roles.map(r => r.id === editingRole.id ? data.role : r));
        } else {
          setRoles([...roles, data.role]);
        }
        setModalOpen(false);
      } else {
        const data = await response.json();
        setError(data.error || t('settings.rolesSection.saveFailed'));
      }
    } catch (err) {
      console.error('Failed to save role:', err);
      setError(t('settings.rolesSection.saveFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.loadingState}>
        <Loader2 className={styles.spinner} />
      </div>
    );
  }

  return (
    <>
      <div className={styles.subsection}>
        <div className={styles.subsectionHeader}>
          <h3 className={styles.subsectionTitle}>
            <Shield className={styles.subsectionIcon} />
            {t('settings.rolesSection.title')}
          </h3>
          <button className={styles.editButton} onClick={handleAdd}>
            <Plus size={16} />
            {t('settings.rolesSection.addRole')}
          </button>
        </div>

        {roles.length === 0 ? (
          <div className={styles.emptyState}>
            <p>{t('settings.rolesSection.noRoles')}</p>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>{t('settings.rolesSection.columns.name')}</th>
                  <th>{t('settings.rolesSection.columns.description')}</th>
                  <th>{t('settings.rolesSection.columns.members')}</th>
                  <th>{t('settings.rolesSection.columns.type')}</th>
                  <th>{t('settings.rolesSection.columns.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role.id}>
                    <td>
                      <div className={styles.roleNameCell}>
                        <Shield size={16} />
                        <span>{getRoleLabel(role)}</span>
                      </div>
                    </td>
                    <td>{role.description || '-'}</td>
                    <td>{role.membersCount}</td>
                    <td>
                      <span className={`${styles.badge} ${role.isSystemRole ? styles.systemBadge : styles.customBadge}`}>
                        {role.isSystemRole ? t('settings.rolesSection.systemRole') : t('settings.rolesSection.customRole')}
                      </span>
                    </td>
                    <td>
                      <div className={styles.actionButtons}>
                        <button 
                          className={styles.iconButton} 
                          onClick={() => handleEdit(role)}
                          title={t('common.edit')}
                        >
                          <Edit2 size={16} />
                        </button>
                        {!role.isSystemRole && (
                          <button 
                            className={`${styles.iconButton} ${styles.danger}`}
                            onClick={() => handleDelete(role)}
                            title={t('common.delete')}
                            disabled={role.membersCount > 0}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Role Modal */}
      {modalOpen && (
        <div className={styles.modalOverlay} onClick={() => setModalOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>
                {editingRole ? t('settings.rolesSection.editRole') : t('settings.rolesSection.addRole')}
              </h2>
              <button className={styles.modalClose} onClick={() => setModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className={styles.modalBody}>
                {error && (
                  <div className={styles.errorMessage}>{error}</div>
                )}
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>{t('settings.rolesSection.key')}</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    value={formData.key}
                    onChange={handleKeyChange}
                    placeholder={t('settings.rolesSection.keyPlaceholder')}
                    required
                    disabled={editingRole?.isSystemRole}
                    dir="ltr"
                    style={{ textAlign: 'left' }}
                  />
                  <span className={styles.formHint}>{t('settings.rolesSection.keyHint')}</span>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>{t('settings.rolesSection.columns.name')}</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder={t('settings.rolesSection.namePlaceholder')}
                    required
                    disabled={editingRole?.isSystemRole}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>{t('settings.rolesSection.columns.description')}</label>
                  <textarea
                    className={styles.formTextarea}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder={t('settings.rolesSection.descriptionPlaceholder')}
                    rows={3}
                  />
                </div>
              </div>
              <div className={styles.modalFooter}>
                <button type="button" className={styles.secondaryButton} onClick={() => setModalOpen(false)}>
                  {t('common.cancel')}
                </button>
                <button type="submit" className={styles.primaryButton} disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className={styles.spinnerSmall} /> : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className={styles.modalOverlay} onClick={() => setDeleteConfirm(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>{t('settings.rolesSection.deleteConfirm')}</h2>
              <button className={styles.modalClose} onClick={() => setDeleteConfirm(null)}>
                <X size={20} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <p>{t('settings.rolesSection.deleteWarning').replace('{name}', getRoleLabel(deleteConfirm))}</p>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.secondaryButton} onClick={() => setDeleteConfirm(null)}>
                {t('common.cancel')}
              </button>
              <button 
                className={styles.dangerButton} 
                onClick={confirmDelete}
                disabled={isSubmitting}
              >
                {isSubmitting ? <Loader2 className={styles.spinnerSmall} /> : t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Permissions Settings Component
function PermissionsSettings({ translations, canEdit = true }) {
  const { t } = useLocale();
  const [roles, setRoles] = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [selectedRole, setSelectedRole] = useState(null);
  const [modules, setModules] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [rolePermissions, setRolePermissions] = useState([]);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const us = translations?.usersSection || {};

  // Get translated role label - uses key for lookup, falls back to name
  const getRoleLabel = (role) => {
    if (!role) return us.roles?.user || 'User';
    const roleKey = role.key;
    const roleName = role.name;
    
    // Try to find translation by key first
    if (roleKey) {
      const translatedByKey = us.roles?.[roleKey];
      if (translatedByKey) return translatedByKey;
    }
    
    // Fall back to looking up by lowercased name
    if (roleName) {
      const nameKey = roleName.toLowerCase().replace(/\s+/g, '_');
      const translatedByName = us.roles?.[nameKey];
      if (translatedByName) return translatedByName;
    }
    
    // Final fallback: return the name as-is
    return roleName || roleKey || 'User';
  };

  // Fetch roles and permissions
  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      try {
        const [rolesRes, permissionsRes] = await Promise.all([
          fetch('/api/settings/roles'),
          fetch('/api/settings/permissions'),
        ]);

        if (rolesRes.ok) {
          const rolesData = await rolesRes.json();
          setRoles(rolesData.roles || []);
        }

        if (permissionsRes.ok) {
          const permData = await permissionsRes.json();
          setModules(permData.modules || []);
        }
      } catch (err) {
        console.error('Failed to fetch data:', err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, []);

  // Update selected role when selection changes
  useEffect(() => {
    if (selectedRoleId) {
      const role = roles.find(r => r.id === selectedRoleId);
      setSelectedRole(role);
      setRolePermissions(role?.permissions || []);
      setSaveSuccess(false);
    } else {
      setSelectedRole(null);
      setRolePermissions([]);
    }
  }, [selectedRoleId, roles]);

  // Check if role is owner (has all permissions, not editable)
  const isOwnerRole = selectedRole?.name?.toLowerCase() === 'owner';

  // Get permission key for a module and capability
  const getPermKey = (moduleId, capability) => {
    return `${moduleId.toUpperCase()}_${capability.toUpperCase()}`;
  };

  // Check if a permission is enabled
  const hasPermission = (moduleId, capability) => {
    if (isOwnerRole) return true;
    return rolePermissions.includes(getPermKey(moduleId, capability));
  };

  // Check if VIEW is disabled (which means EDIT and DELETE should be disabled too)
  const isViewDisabled = (moduleId) => {
    if (isOwnerRole) return false;
    return !hasPermission(moduleId, 'view');
  };

  // Handle permission toggle
  const handlePermissionToggle = (moduleId, capability) => {
    if (isOwnerRole) return; // Owner permissions are not editable

    const permKey = getPermKey(moduleId, capability);
    let newPermissions = [...rolePermissions];

    if (capability === 'view') {
      // If disabling VIEW, also disable EDIT and DELETE
      if (hasPermission(moduleId, 'view')) {
        newPermissions = newPermissions.filter(p => 
          p !== permKey && 
          p !== getPermKey(moduleId, 'edit') && 
          p !== getPermKey(moduleId, 'delete')
        );
      } else {
        newPermissions.push(permKey);
      }
    } else {
      // For EDIT/DELETE, can only enable if VIEW is enabled
      if (hasPermission(moduleId, capability)) {
        newPermissions = newPermissions.filter(p => p !== permKey);
      } else if (hasPermission(moduleId, 'view')) {
        newPermissions.push(permKey);
      }
    }

    setRolePermissions(newPermissions);
    setSaveSuccess(false);
  };

  // Handle module row "all" toggle
  const handleModuleToggle = (module) => {
    if (isOwnerRole) return;

    const allPerms = module.capabilities.map(cap => getPermKey(module.id, cap));
    const allEnabled = allPerms.every(p => rolePermissions.includes(p));

    let newPermissions = [...rolePermissions];
    if (allEnabled) {
      // Disable all for this module
      newPermissions = newPermissions.filter(p => !allPerms.includes(p));
    } else {
      // Enable all for this module
      for (const perm of allPerms) {
        if (!newPermissions.includes(perm)) {
          newPermissions.push(perm);
        }
      }
    }

    setRolePermissions(newPermissions);
    setSaveSuccess(false);
  };

  // Check if all permissions for a module are enabled
  const isModuleAllEnabled = (module) => {
    if (isOwnerRole) return true;
    const allPerms = module.capabilities.map(cap => getPermKey(module.id, cap));
    return allPerms.every(p => rolePermissions.includes(p));
  };

  // Check if some (but not all) permissions for a module are enabled
  const isModuleSomeEnabled = (module) => {
    if (isOwnerRole) return false;
    const allPerms = module.capabilities.map(cap => getPermKey(module.id, cap));
    const enabledCount = allPerms.filter(p => rolePermissions.includes(p)).length;
    return enabledCount > 0 && enabledCount < allPerms.length;
  };

  // Handle capability column "all" toggle
  const handleCapabilityColumnToggle = (capability, modulesList) => {
    if (isOwnerRole) return;

    // Get all modules that have this capability
    const modulesWithCapability = modulesList.filter(m => m.capabilities.includes(capability));
    
    // For edit/delete, only consider modules where view is enabled
    const relevantModules = capability === 'view' 
      ? modulesWithCapability 
      : modulesWithCapability.filter(m => hasPermission(m.id, 'view'));

    const allPerms = relevantModules.map(m => getPermKey(m.id, capability));
    const allEnabled = allPerms.every(p => rolePermissions.includes(p));

    let newPermissions = [...rolePermissions];
    if (allEnabled) {
      // Disable all for this capability
      if (capability === 'view') {
        // When disabling view, also disable edit and delete for these modules
        for (const module of modulesWithCapability) {
          newPermissions = newPermissions.filter(p => 
            p !== getPermKey(module.id, 'view') && 
            p !== getPermKey(module.id, 'edit') && 
            p !== getPermKey(module.id, 'delete')
          );
        }
      } else {
        newPermissions = newPermissions.filter(p => !allPerms.includes(p));
      }
    } else {
      // Enable all for this capability
      for (const perm of allPerms) {
        if (!newPermissions.includes(perm)) {
          newPermissions.push(perm);
        }
      }
    }

    setRolePermissions(newPermissions);
    setSaveSuccess(false);
  };

  // Check if all permissions for a capability column are enabled
  const isCapabilityColumnAllEnabled = (capability, modulesList) => {
    if (isOwnerRole) return true;
    const modulesWithCapability = modulesList.filter(m => m.capabilities.includes(capability));
    
    // For edit/delete, only consider modules where view is enabled
    const relevantModules = capability === 'view' 
      ? modulesWithCapability 
      : modulesWithCapability.filter(m => hasPermission(m.id, 'view'));

    if (relevantModules.length === 0) return false;
    const allPerms = relevantModules.map(m => getPermKey(m.id, capability));
    return allPerms.every(p => rolePermissions.includes(p));
  };

  // Check if some permissions for a capability column are enabled
  const isCapabilityColumnSomeEnabled = (capability, modulesList) => {
    if (isOwnerRole) return false;
    const modulesWithCapability = modulesList.filter(m => m.capabilities.includes(capability));
    
    // For edit/delete, only consider modules where view is enabled
    const relevantModules = capability === 'view' 
      ? modulesWithCapability 
      : modulesWithCapability.filter(m => hasPermission(m.id, 'view'));

    if (relevantModules.length === 0) return false;
    const allPerms = relevantModules.map(m => getPermKey(m.id, capability));
    const enabledCount = allPerms.filter(p => rolePermissions.includes(p)).length;
    return enabledCount > 0 && enabledCount < allPerms.length;
  };

  // Handle toggle all modules at once (master checkbox)
  const handleAllModulesToggle = (modulesList) => {
    if (isOwnerRole) return;

    // Get all permissions for all modules
    const allPerms = modulesList.flatMap(m => m.capabilities.map(cap => getPermKey(m.id, cap)));
    const allEnabled = allPerms.every(p => rolePermissions.includes(p));

    let newPermissions = [...rolePermissions];
    if (allEnabled) {
      // Disable all permissions for these modules
      newPermissions = newPermissions.filter(p => !allPerms.includes(p));
    } else {
      // Enable all permissions for these modules
      for (const perm of allPerms) {
        if (!newPermissions.includes(perm)) {
          newPermissions.push(perm);
        }
      }
    }

    setRolePermissions(newPermissions);
    setSaveSuccess(false);
  };

  // Check if all permissions for all modules are enabled
  const isAllModulesAllEnabled = (modulesList) => {
    if (isOwnerRole) return true;
    const allPerms = modulesList.flatMap(m => m.capabilities.map(cap => getPermKey(m.id, cap)));
    return allPerms.every(p => rolePermissions.includes(p));
  };

  // Check if some permissions for all modules are enabled
  const isAllModulesSomeEnabled = (modulesList) => {
    if (isOwnerRole) return false;
    const allPerms = modulesList.flatMap(m => m.capabilities.map(cap => getPermKey(m.id, cap)));
    const enabledCount = allPerms.filter(p => rolePermissions.includes(p)).length;
    return enabledCount > 0 && enabledCount < allPerms.length;
  };

  const handleSave = async () => {
    if (!selectedRole || isOwnerRole) return;
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const response = await fetch(`/api/settings/roles/${selectedRole.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: rolePermissions }),
      });

      if (response.ok) {
        const data = await response.json();
        setRoles(roles.map(r => r.id === selectedRole.id ? data.role : r));
        setSelectedRole(data.role);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        const data = await response.json();
        alert(data.error || t('settings.permissionsSection.saveFailed'));
      }
    } catch (err) {
      console.error('Failed to save permissions:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Group modules by type (core modules vs settings tabs)
  const coreModules = modules.filter(m => !m.id.startsWith('settings_'));
  const settingsModules = modules.filter(m => m.id.startsWith('settings_'));

  if (isLoading) {
    return (
      <div className={styles.loadingState}>
        <Loader2 className={styles.spinner} />
      </div>
    );
  }

  return (
    <>
      <div className={styles.subsection}>
        <h3 className={styles.subsectionTitle}>
          <Key className={styles.subsectionIcon} />
          {t('settings.permissionsSection.title')}
        </h3>

        <div className={styles.permissionsHeader}>
          <div className={styles.formGroup} style={{ marginBottom: 0, flex: 1, maxWidth: '300px' }}>
            <label className={styles.formLabel}>{t('settings.permissionsSection.selectRole')}</label>
            <select
              className={styles.formSelect}
              value={selectedRoleId}
              onChange={(e) => setSelectedRoleId(e.target.value)}
            >
              <option value="">{t('settings.permissionsSection.selectRolePlaceholder')}</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {getRoleLabel(role)} {role.isSystemRole ? `(${t('settings.rolesSection.systemRole')})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {selectedRole ? (
          <>
            {isOwnerRole && (
              <div className={styles.ownerNotice}>
                <Shield size={16} />
                <span>{t('settings.permissionsSection.ownerNotice')}</span>
              </div>
            )}

            {/* Core Modules Table */}
            <div className={styles.permissionsTableSection}>
              <h4 className={styles.permissionsTableTitle}>{t('settings.permissionsSection.coreModules')}</h4>
              <div className={styles.tableWrapper}>
                <table className={styles.permissionsTable}>
                  <thead>
                    <tr>
                      <th className={styles.selectAllColumn}>
                        <div className={styles.capabilityHeader}>
                          <label className={styles.permissionCheckbox}>
                            <input
                              type="checkbox"
                              checked={isAllModulesAllEnabled(coreModules)}
                              ref={el => el && (el.indeterminate = isAllModulesSomeEnabled(coreModules))}
                              onChange={() => handleAllModulesToggle(coreModules)}
                              disabled={isOwnerRole}
                            />
                            <span className={styles.checkmark}></span>
                          </label>
                          <span className={styles.selectAllLabel}>{t('settings.permissionsSection.selectAll')}</span>
                        </div>
                      </th>
                      <th className={styles.moduleColumn}>{t('settings.permissionsSection.module')}</th>
                      <th className={styles.capabilityColumn}>
                        <div className={styles.capabilityHeader}>
                          <label className={styles.permissionCheckbox}>
                            <input
                              type="checkbox"
                              checked={isCapabilityColumnAllEnabled('view', coreModules)}
                              ref={el => el && (el.indeterminate = isCapabilityColumnSomeEnabled('view', coreModules))}
                              onChange={() => handleCapabilityColumnToggle('view', coreModules)}
                              disabled={isOwnerRole}
                            />
                            <span className={styles.checkmark}></span>
                          </label>
                          <span>{t('settings.permissionsSection.capabilities.view')}</span>
                        </div>
                      </th>
                      <th className={styles.capabilityColumn}>
                        <div className={styles.capabilityHeader}>
                          <label className={styles.permissionCheckbox}>
                            <input
                              type="checkbox"
                              checked={isCapabilityColumnAllEnabled('edit', coreModules)}
                              ref={el => el && (el.indeterminate = isCapabilityColumnSomeEnabled('edit', coreModules))}
                              onChange={() => handleCapabilityColumnToggle('edit', coreModules)}
                              disabled={isOwnerRole}
                            />
                            <span className={styles.checkmark}></span>
                          </label>
                          <span>{t('settings.permissionsSection.capabilities.edit')}</span>
                        </div>
                      </th>
                      <th className={styles.capabilityColumn}>
                        <div className={styles.capabilityHeader}>
                          <label className={styles.permissionCheckbox}>
                            <input
                              type="checkbox"
                              checked={isCapabilityColumnAllEnabled('delete', coreModules)}
                              ref={el => el && (el.indeterminate = isCapabilityColumnSomeEnabled('delete', coreModules))}
                              onChange={() => handleCapabilityColumnToggle('delete', coreModules)}
                              disabled={isOwnerRole}
                            />
                            <span className={styles.checkmark}></span>
                          </label>
                          <span>{t('settings.permissionsSection.capabilities.delete')}</span>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {coreModules.map((module) => {
                      const hasView = module.capabilities.includes('view');
                      const hasEdit = module.capabilities.includes('edit');
                      const hasDelete = module.capabilities.includes('delete');
                      const viewDisabled = isViewDisabled(module.id);

                      return (
                        <tr key={module.id}>
                          <td className={styles.selectAllColumn}>
                            <label className={styles.permissionCheckbox}>
                              <input
                                type="checkbox"
                                checked={isModuleAllEnabled(module)}
                                ref={el => el && (el.indeterminate = isModuleSomeEnabled(module))}
                                onChange={() => handleModuleToggle(module)}
                                disabled={isOwnerRole}
                              />
                              <span className={styles.checkmark}></span>
                            </label>
                          </td>
                          <td className={styles.moduleColumn}>
                            <span className={styles.moduleName}>
                              {t(`settings.permissionsSection.modules.${module.id}`)}
                            </span>
                          </td>
                          <td className={styles.capabilityColumn}>
                            {hasView && (
                              <label className={styles.permissionCheckbox}>
                                <input
                                  type="checkbox"
                                  checked={hasPermission(module.id, 'view')}
                                  onChange={() => handlePermissionToggle(module.id, 'view')}
                                  disabled={isOwnerRole}
                                />
                                <span className={styles.checkmark}></span>
                              </label>
                            )}
                          </td>
                          <td className={styles.capabilityColumn}>
                            {hasEdit && (
                              <label className={`${styles.permissionCheckbox} ${viewDisabled ? styles.disabled : ''}`}>
                                <input
                                  type="checkbox"
                                  checked={hasPermission(module.id, 'edit')}
                                  onChange={() => handlePermissionToggle(module.id, 'edit')}
                                  disabled={isOwnerRole || viewDisabled}
                                />
                                <span className={styles.checkmark}></span>
                              </label>
                            )}
                          </td>
                          <td className={styles.capabilityColumn}>
                            {hasDelete && (
                              <label className={`${styles.permissionCheckbox} ${viewDisabled ? styles.disabled : ''}`}>
                                <input
                                  type="checkbox"
                                  checked={hasPermission(module.id, 'delete')}
                                  onChange={() => handlePermissionToggle(module.id, 'delete')}
                                  disabled={isOwnerRole || viewDisabled}
                                />
                                <span className={styles.checkmark}></span>
                              </label>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Settings Tabs Table */}
            <div className={styles.permissionsTableSection}>
              <h4 className={styles.permissionsTableTitle}>{t('settings.permissionsSection.settingsTabs')}</h4>
              <div className={styles.tableWrapper}>
                <table className={styles.permissionsTable}>
                  <thead>
                    <tr>
                      <th className={styles.selectAllColumn}>
                        <div className={styles.capabilityHeader}>
                          <label className={styles.permissionCheckbox}>
                            <input
                              type="checkbox"
                              checked={isAllModulesAllEnabled(settingsModules)}
                              ref={el => el && (el.indeterminate = isAllModulesSomeEnabled(settingsModules))}
                              onChange={() => handleAllModulesToggle(settingsModules)}
                              disabled={isOwnerRole}
                            />
                            <span className={styles.checkmark}></span>
                          </label>
                          <span className={styles.selectAllLabel}>{t('settings.permissionsSection.selectAll')}</span>
                        </div>
                      </th>
                      <th className={styles.moduleColumn}>{t('settings.permissionsSection.settingsTab')}</th>
                      <th className={styles.capabilityColumn}>
                        <div className={styles.capabilityHeader}>
                          <label className={styles.permissionCheckbox}>
                            <input
                              type="checkbox"
                              checked={isCapabilityColumnAllEnabled('view', settingsModules)}
                              ref={el => el && (el.indeterminate = isCapabilityColumnSomeEnabled('view', settingsModules))}
                              onChange={() => handleCapabilityColumnToggle('view', settingsModules)}
                              disabled={isOwnerRole}
                            />
                            <span className={styles.checkmark}></span>
                          </label>
                          <span>{t('settings.permissionsSection.capabilities.view')}</span>
                        </div>
                      </th>
                      <th className={styles.capabilityColumn}>
                        <div className={styles.capabilityHeader}>
                          <label className={styles.permissionCheckbox}>
                            <input
                              type="checkbox"
                              checked={isCapabilityColumnAllEnabled('edit', settingsModules)}
                              ref={el => el && (el.indeterminate = isCapabilityColumnSomeEnabled('edit', settingsModules))}
                              onChange={() => handleCapabilityColumnToggle('edit', settingsModules)}
                              disabled={isOwnerRole}
                            />
                            <span className={styles.checkmark}></span>
                          </label>
                          <span>{t('settings.permissionsSection.capabilities.edit')}</span>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {settingsModules.map((module) => {
                      const hasView = module.capabilities.includes('view');
                      const hasEdit = module.capabilities.includes('edit');
                      const viewDisabled = isViewDisabled(module.id);
                      // Get tab name from module id (e.g., settings_general -> general)
                      const tabId = module.id.replace('settings_', '');

                      return (
                        <tr key={module.id}>
                          <td className={styles.selectAllColumn}>
                            <label className={styles.permissionCheckbox}>
                              <input
                                type="checkbox"
                                checked={isModuleAllEnabled(module)}
                                ref={el => el && (el.indeterminate = isModuleSomeEnabled(module))}
                                onChange={() => handleModuleToggle(module)}
                                disabled={isOwnerRole}
                              />
                              <span className={styles.checkmark}></span>
                            </label>
                          </td>
                          <td className={styles.moduleColumn}>
                            <span className={styles.moduleName}>
                              {t(`settings.permissionsSection.modules.${module.id}`)}
                            </span>
                          </td>
                          <td className={styles.capabilityColumn}>
                            {hasView && (
                              <label className={styles.permissionCheckbox}>
                                <input
                                  type="checkbox"
                                  checked={hasPermission(module.id, 'view')}
                                  onChange={() => handlePermissionToggle(module.id, 'view')}
                                  disabled={isOwnerRole}
                                />
                                <span className={styles.checkmark}></span>
                              </label>
                            )}
                          </td>
                          <td className={styles.capabilityColumn}>
                            {hasEdit && (
                              <label className={`${styles.permissionCheckbox} ${viewDisabled ? styles.disabled : ''}`}>
                                <input
                                  type="checkbox"
                                  checked={hasPermission(module.id, 'edit')}
                                  onChange={() => handlePermissionToggle(module.id, 'edit')}
                                  disabled={isOwnerRole || viewDisabled}
                                />
                                <span className={styles.checkmark}></span>
                              </label>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {!isOwnerRole && (
              <div className={styles.saveButtonWrapper}>
                <button 
                  className={styles.saveButton} 
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <Loader2 className={styles.spinnerSmall} />
                  ) : saveSuccess ? (
                    <>
                      <Check size={16} />
                      {t('settings.permissionsSection.saved')}
                    </>
                  ) : (
                    t('common.save')
                  )}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className={styles.emptyState}>
            <Key size={48} className={styles.emptyIcon} />
            <p>{t('settings.permissionsSection.selectRoleMessage')}</p>
          </div>
        )}
      </div>
    </>
  );
}
