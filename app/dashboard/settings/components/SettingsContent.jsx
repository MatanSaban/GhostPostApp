'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
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
  Coins,
  Package,
  Mail,
  Phone,
  Camera,
  AlertCircle,
  Eye,
  EyeOff,
  Unlink,
  Minus,
  ShoppingCart,
  ExternalLink,
} from 'lucide-react';
import { useSite } from '@/app/context/site-context';
import { useLocale } from '@/app/context/locale-context';
import { useUser } from '@/app/context/user-context';
import { usePermissions } from '@/app/hooks/usePermissions';
import { SettingsFormSkeleton, TableSkeleton, FormSkeleton } from '@/app/dashboard/components';
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
  Coins,
  Puzzle,
};

// Account-level tab IDs that require special permissions
const ACCOUNT_TAB_IDS = ['users', 'roles', 'permissions', 'subscription', 'credits', 'addons', 'account', 'profile'];

export default function SettingsContent({ translations, websiteTabs, accountTabs, mainTabs, initialData }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { direction, locale, t } = useLocale();
  const { selectedSite } = useSite();
  const { user, isLoading: userLoading } = useUser();
  
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
    
    // Get AI credits limit from plan limitations
    const limitations = plan.limitations || [];
    const aiCreditsLimitation = limitations.find?.(l => l.key === 'aiCredits');
    const aiCreditsLimit = aiCreditsLimitation?.value || 0;
    
    // Get current AI credits used from user context
    const aiCreditsUsed = user?.aiCreditsUsed || 0;
    
    // Get usage stats from user context
    const usageStats = user?.usageStats || { sitesCount: 0, membersCount: 0, siteAuditsCount: 0 };
    
    return {
      plan: plan.slug || 'free',
      planLabel: planLabel,
      price: plan.price || 0,
      yearlyPrice: plan.yearlyPrice || null,
      currency: plan.currency || 'USD',
      interval: userSub.billingInterval || plan.interval || 'MONTHLY',
      status: userSub.status || 'ACTIVE',
      statusLabel: statusLabel,
      currentPeriodStart: userSub.currentPeriodStart,
      currentPeriodEnd: userSub.currentPeriodEnd,
      nextBillingDate: userSub.currentPeriodEnd, // Next billing is when current period ends
      cancelAtPeriodEnd: userSub.cancelAtPeriodEnd || false,
      // AI Credits - real data from account (used/limit)
      aiCreditsUsed: aiCreditsUsed,
      aiCreditsLimit: aiCreditsLimit,
      // Usage stats for limitations
      usageStats: usageStats,
      features: planTranslation?.features || plan.features || [],
      limitations: limitations,
      translatedLimitations: planTranslation?.limitations || [],
    };
  }, [user, locale, t, initialData.subscription]);

  // Update indicator position when tab, direction, locale, or site changes
  useEffect(() => {
    const updateIndicator = () => {
      const activeButton = tabsRef.current[activeTab];
      if (activeButton && tabsListRef.current) {
        const containerRect = tabsListRef.current.getBoundingClientRect();
        const buttonRect = activeButton.getBoundingClientRect();
        // Calculate offset based on direction - use start position for RTL/LTR compatibility
        const isRtl = direction === 'rtl';
        const offset = isRtl 
          ? containerRect.right - buttonRect.right
          : buttonRect.left - containerRect.left;
        setIndicatorStyle({
          insetInlineStart: offset,
          width: buttonRect.width,
          top: buttonRect.top - containerRect.top,
        });
      }
    };

    // Small delay for initial render to ensure layout is calculated
    const timeoutId = setTimeout(updateIndicator, 50);
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
      clearTimeout(timeoutId);
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
        // Calculate offset based on direction - use start position for RTL/LTR compatibility
        const isRtl = direction === 'rtl';
        const offset = isRtl 
          ? containerRect.right - buttonRect.right
          : buttonRect.left - containerRect.left;
        setMainIndicatorStyle({
          insetInlineStart: offset,
          width: buttonRect.width,
        });
      }
    };

    // Small delay for initial render to ensure layout is calculated
    const timeoutId = setTimeout(updateMainIndicator, 50);
    updateMainIndicator();
    window.addEventListener('resize', updateMainIndicator);
    
    return () => {
      clearTimeout(timeoutId);
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
        return <SubscriptionSettings subscription={subscription} translations={translations} canEdit={canEdit} isLoading={userLoading} />;
      case 'credits':
        return <CreditsSettings subscription={subscription} translations={translations} canEdit={canEdit} isLoading={userLoading} />;
      case 'addons':
        return <AddonsSettings translations={translations} canEdit={canEdit} />;
      case 'profile':
        return <ProfileSettings translations={translations} />;
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
                insetInlineStart: mainIndicatorStyle.insetInlineStart,
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
              insetInlineStart: indicatorStyle.insetInlineStart,
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
    return <SettingsFormSkeleton fields={6} />;
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
  const int = t.integrationsSection || {};
  const { selectedSite } = useSite();
  const { locale } = useLocale();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [integration, setIntegration] = useState(null);
  const [connected, setConnected] = useState(false);
  const [siteUrl, setSiteUrl] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // GA property picker
  const [gaProperties, setGaProperties] = useState([]);
  const [gaLoading, setGaLoading] = useState(false);
  const [gaPickerOpen, setGaPickerOpen] = useState(false);
  const [gaSaving, setGaSaving] = useState(false);

  // GSC site picker
  const [gscSites, setGscSites] = useState([]);
  const [gscLoading, setGscLoading] = useState(false);
  const [gscPickerOpen, setGscPickerOpen] = useState(false);
  const [gscSaving, setGscSaving] = useState(false);

  // Status messages
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [needsScopes, setNeedsScopes] = useState(false);
  const [needsGAScope, setNeedsGAScope] = useState(false);
  const [needsGSCScope, setNeedsGSCScope] = useState(false);

  // Auto-reconnect: when redirected from dashboard with reconnect=google
  const reconnectTriggered = useRef(false);
  useEffect(() => {
    if (searchParams.get('reconnect') === 'google' && !reconnectTriggered.current && selectedSite?.id) {
      reconnectTriggered.current = true;
      // Clean URL param immediately
      const url = new URL(window.location.href);
      url.searchParams.delete('reconnect');
      window.history.replaceState({}, '', url.toString());
      // Trigger the Google OAuth flow
      handleConnect();
    }
  }, [searchParams, selectedSite?.id]);

  // Check for callback params
  useEffect(() => {
    if (searchParams.get('integrationSuccess') === 'true') {
      setSuccessMsg(int.connectSuccess || 'Google account connected successfully!');
      // Clean URL params
      const url = new URL(window.location.href);
      url.searchParams.delete('integrationSuccess');
      window.history.replaceState({}, '', url.toString());
    }
    if (searchParams.get('integrationError')) {
      setErrorMsg(int.connectError || 'Failed to connect Google account.');
      const url = new URL(window.location.href);
      url.searchParams.delete('integrationError');
      window.history.replaceState({}, '', url.toString());
    }
  }, [searchParams, int]);

  // Fetch integration status
  const fetchStatus = async () => {
    if (!selectedSite?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/settings/integrations/google?siteId=${selectedSite.id}`);
      if (res.ok) {
        const data = await res.json();
        setConnected(data.connected);
        setIntegration(data.integration);
        setSiteUrl(data.siteUrl || '');
        setNeedsScopes(data.needsScopes || false);
        setNeedsGAScope(data.needsGAScope || false);
        setNeedsGSCScope(data.needsGSCScope || false);
      }
    } catch (err) {
      console.error('Failed to fetch integration status:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchStatus();
  }, [selectedSite?.id]);

  // Connect Google account
  const handleConnect = async () => {
    if (!selectedSite?.id) return;
    setConnecting(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/settings/integrations/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'connect', siteId: selectedSite.id }),
      });
      const data = await res.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch {
      setErrorMsg(int.connectError || 'Failed to start connection.');
      setConnecting(false);
    }
  };

  // Disconnect Google account
  const handleDisconnect = async () => {
    if (!selectedSite?.id) return;
    setDisconnecting(true);
    try {
      await fetch('/api/settings/integrations/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect', siteId: selectedSite.id }),
      });
      setConnected(false);
      setIntegration(null);
      setGaProperties([]);
      setGscSites([]);
      setSuccessMsg(int.disconnected || 'Google account disconnected.');
    } catch {
      setErrorMsg('Failed to disconnect.');
    }
    setDisconnecting(false);
  };

  // Load GA properties
  const loadGAProperties = async () => {
    setGaLoading(true);
    setGaPickerOpen(true);
    try {
      const res = await fetch('/api/settings/integrations/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list-properties', siteId: selectedSite.id }),
      });
      const data = await res.json();
      if (data.needsScopes) {
        // Scopes insufficient — redirect to grant GA/GSC permissions
        setGaPickerOpen(false);
        handleConnect();
        return;
      }
      setGaProperties(data.properties || []);
    } catch {
      setErrorMsg('Failed to load GA properties.');
    }
    setGaLoading(false);
  };

  // Save GA property selection
  const saveGAProperty = async (propertyId, propertyName) => {
    setGaSaving(true);
    try {
      await fetch('/api/settings/integrations/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-ga', siteId: selectedSite.id, propertyId, propertyName }),
      });
      setIntegration(prev => ({ ...prev, gaConnected: true, gaPropertyId: propertyId, gaPropertyName: propertyName }));
      setGaPickerOpen(false);
      setSuccessMsg(int.gaPropertySaved || 'Google Analytics property saved.');
    } catch {
      setErrorMsg('Failed to save GA property.');
    }
    setGaSaving(false);
  };

  // Load GSC sites
  const loadGSCSites = async () => {
    setGscLoading(true);
    setGscPickerOpen(true);
    try {
      const res = await fetch('/api/settings/integrations/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list-sites', siteId: selectedSite.id }),
      });
      const data = await res.json();
      if (data.needsScopes) {
        setGscPickerOpen(false);
        handleConnect();
        return;
      }
      setGscSites(data.sites || []);
    } catch {
      setErrorMsg('Failed to load Search Console sites.');
    }
    setGscLoading(false);
  };

  // Save GSC site selection
  const saveGSCSite = async (gscSiteUrl) => {
    setGscSaving(true);
    try {
      await fetch('/api/settings/integrations/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-gsc', siteId: selectedSite.id, gscSiteUrl }),
      });
      setIntegration(prev => ({ ...prev, gscConnected: true, gscSiteUrl }));
      setGscPickerOpen(false);
      setSuccessMsg(int.gscSiteSaved || 'Search Console site saved.');
    } catch {
      setErrorMsg('Failed to save GSC site.');
    }
    setGscSaving(false);
  };

  // Auto-dismiss messages
  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  useEffect(() => {
    if (errorMsg) {
      const timer = setTimeout(() => setErrorMsg(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [errorMsg]);

  if (!selectedSite) {
    return (
      <div className={styles.emptyState}>
        <AlertCircle size={32} />
        <p>{t.selectSiteFirst || 'Please select a site first.'}</p>
      </div>
    );
  }

  if (loading) {
    return <SettingsFormSkeleton />;
  }

  return (
    <>
      {/* Status Messages */}
      {successMsg && (
        <div className={styles.successBanner}>
          <Check size={16} />
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg('')} className={styles.bannerClose}><X size={14} /></button>
        </div>
      )}
      {errorMsg && (
        <div className={styles.errorBanner}>
          <AlertCircle size={16} />
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg('')} className={styles.bannerClose}><X size={14} /></button>
        </div>
      )}

      {/* Google Account Connection */}
      <div className={styles.settingsSection}>
        <div className={styles.integrationTitleRow}>
          <svg className={styles.integrationIcon} width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          <h3 className={styles.sectionTitle}>{int.googleAccount || 'Google Account'}</h3>
        </div>
        <p className={styles.sectionDescription}>
          {int.googleAccountDesc || 'Connect your Google account to enable Analytics and Search Console integrations.'}
        </p>

        {!connected ? (
          <button
            className={styles.connectGoogleBtn}
            onClick={handleConnect}
            disabled={connecting}
          >
            {connecting ? (
              <Loader2 size={18} className={styles.spinning} />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            )}
            <span>{connecting ? (int.connecting || 'Connecting...') : (int.connectGoogle || 'Connect with Google')}</span>
          </button>
        ) : (
          <div className={styles.connectedAccount}>
            <div className={styles.connectedInfo}>
              <div className={styles.connectedBadge}>
                <Check size={14} />
                <span>{int.connected || 'Connected'}</span>
              </div>
              {integration?.googleEmail && (
                <span className={styles.connectedEmail}>{integration.googleEmail}</span>
              )}
            </div>
            <button
              className={styles.disconnectBtn}
              onClick={handleDisconnect}
              disabled={disconnecting}
            >
              {disconnecting ? <Loader2 size={14} className={styles.spinning} /> : <Unlink size={14} />}
              <span>{int.disconnect || 'Disconnect'}</span>
            </button>
          </div>
        )}

        {/* Needs additional scopes banner */}
        {connected && needsGAScope && needsGSCScope && (
          <div className={styles.scopesBanner}>
            <div className={styles.scopesBannerText}>
              <AlertCircle size={16} />
              <span>{int.needsScopesDesc || 'Your Google account needs additional permissions for Analytics and Search Console.'}</span>
            </div>
            <button
              className={styles.grantScopesBtn}
              onClick={handleConnect}
              disabled={connecting}
            >
              {connecting ? <Loader2 size={14} className={styles.spinning} /> : <ExternalLink size={14} />}
              <span>{int.grantPermissions || 'Grant Permissions'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Google Analytics Section */}
      <div className={styles.settingsSection}>
        <div className={styles.integrationHeader}>
          <div className={styles.integrationTitleRow}>
            <svg className={styles.integrationIcon} width="20" height="20" viewBox="0 0 192 192" fill="none">
              <path fill="#F9AB00" d="M130,29v132c0,14.77,10.19,23,21,23c10,0,21-7,21-23V30c0-13.54-10-22-21-22S130,17.33,130,29z"/>
              <path fill="#E37400" d="M75,96v65c0,14.77,10.19,23,21,23c10,0,21-7,21-23V97c0-13.54-10-22-21-22S75,84.33,75,96z"/>
              <circle fill="#E37400" cx="41" cy="163" r="21"/>
            </svg>
            <h3 className={styles.sectionTitle}>{int.gaTitle || 'Google Analytics'}</h3>
          </div>
          {connected && integration?.gaConnected && (
            <span className={styles.connectedBadgeSmall}>
              <Check size={12} />
              {int.active || 'Active'}
            </span>
          )}
        </div>

        {!connected ? (
          <p className={styles.integrationDisabled}>
            {int.connectFirstGA || 'Connect your Google account first to configure Analytics.'}
          </p>
        ) : integration?.gaConnected ? (
          <div className={styles.integrationConnected}>
            <div className={styles.integrationDetail}>
              <span className={styles.detailLabel}>{int.property || 'Property'}:</span>
              <span className={styles.detailValue}>{integration.gaPropertyName || integration.gaPropertyId}</span>
            </div>
            <button className={styles.editButton} onClick={loadGAProperties}>
              {int.changeProperty || 'Change Property'}
            </button>
          </div>
        ) : needsGAScope ? (
          <div className={styles.scopesBanner}>
            <div className={styles.scopesBannerText}>
              <AlertCircle size={16} />
              <span>{int.gaNeedsScopesDesc || 'Grant Analytics permissions to select a property.'}</span>
            </div>
            <button className={styles.grantScopesBtn} onClick={handleConnect} disabled={connecting}>
              {connecting ? <Loader2 size={14} className={styles.spinning} /> : <ExternalLink size={14} />}
              <span>{int.grantPermissions || 'Grant Permissions'}</span>
            </button>
          </div>
        ) : (
          <button className={styles.editButton} onClick={loadGAProperties} disabled={gaLoading}>
            {gaLoading ? <Loader2 size={14} className={styles.spinning} /> : null}
            {int.selectProperty || 'Select Property'}
          </button>
        )}

        {/* GA Property Picker */}
        {gaPickerOpen && (
          <div className={styles.pickerDropdown}>
            <div className={styles.pickerHeader}>
              <span>{int.selectGAProperty || 'Select GA4 Property'}</span>
              <button onClick={() => setGaPickerOpen(false)}><X size={14} /></button>
            </div>
            {gaLoading ? (
              <div className={styles.pickerLoading}>
                <Loader2 size={20} className={styles.spinning} />
              </div>
            ) : gaProperties.length === 0 ? (
              <div className={styles.pickerEmpty}>
                {int.noProperties || 'No GA4 properties found for this Google account.'}
              </div>
            ) : (
              <div className={styles.pickerList}>
                {gaProperties.map((prop) => (
                  <button
                    key={prop.id}
                    className={`${styles.pickerItem} ${integration?.gaPropertyId === prop.id ? styles.pickerItemActive : ''}`}
                    onClick={() => saveGAProperty(prop.id, prop.name)}
                    disabled={gaSaving}
                  >
                    <div>
                      <div className={styles.pickerItemName}>{prop.name}</div>
                      <div className={styles.pickerItemMeta}>{prop.account} · {prop.id}</div>
                    </div>
                    {integration?.gaPropertyId === prop.id && <Check size={14} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Google Search Console Section */}
      <div className={styles.settingsSection}>
        <div className={styles.integrationHeader}>
          <div className={styles.integrationTitleRow}>
            <svg className={styles.integrationIcon} width="20" height="20" viewBox="0 0 24 24" fill="none">
              <rect x="15" y="1.5" width="7" height="19" rx="3.5" fill="#4285F4"/>
              <rect x="8.5" y="5" width="7" height="15" rx="3.5" fill="#34A853"/>
              <circle cx="9" cy="17" r="2.5" fill="#EA4335"/>
              <circle cx="5.5" cy="15.5" r="4.5" fill="#FBBC04"/>
              <line x1="2.5" y1="19" x2="0.5" y2="22.5" stroke="#FBBC04" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
            <h3 className={styles.sectionTitle}>{int.gscTitle || 'Google Search Console'}</h3>
          </div>
          {connected && integration?.gscConnected && (
            <span className={styles.connectedBadgeSmall}>
              <Check size={12} />
              {int.active || 'Active'}
            </span>
          )}
        </div>

        {!connected ? (
          <p className={styles.integrationDisabled}>
            {int.connectFirstGSC || 'Connect your Google account first to configure Search Console.'}
          </p>
        ) : integration?.gscConnected ? (
          <div className={styles.integrationConnected}>
            <div className={styles.integrationDetail}>
              <span className={styles.detailLabel}>{int.siteUrl || 'Site URL'}:</span>
              <span className={styles.detailValue}>{integration.gscSiteUrl}</span>
            </div>
            <button className={styles.editButton} onClick={loadGSCSites}>
              {int.changeSite || 'Change Site'}
            </button>
          </div>
        ) : needsGSCScope ? (
          <div className={styles.scopesBanner}>
            <div className={styles.scopesBannerText}>
              <AlertCircle size={16} />
              <span>{int.gscNeedsScopesDesc || 'Grant Search Console permissions to select a site.'}</span>
            </div>
            <button className={styles.grantScopesBtn} onClick={handleConnect} disabled={connecting}>
              {connecting ? <Loader2 size={14} className={styles.spinning} /> : <ExternalLink size={14} />}
              <span>{int.grantPermissions || 'Grant Permissions'}</span>
            </button>
          </div>
        ) : (
          <button className={styles.editButton} onClick={loadGSCSites} disabled={gscLoading}>
            {gscLoading ? <Loader2 size={14} className={styles.spinning} /> : null}
            {int.selectSite || 'Select Site'}
          </button>
        )}

        {/* GSC Site Picker */}
        {gscPickerOpen && (
          <div className={styles.pickerDropdown}>
            <div className={styles.pickerHeader}>
              <span>{int.selectGSCSite || 'Select Search Console Site'}</span>
              <button onClick={() => setGscPickerOpen(false)}><X size={14} /></button>
            </div>
            {gscLoading ? (
              <div className={styles.pickerLoading}>
                <Loader2 size={20} className={styles.spinning} />
              </div>
            ) : gscSites.length === 0 ? (
              <div className={styles.pickerEmpty}>
                {int.noSites || 'No Search Console sites found for this Google account.'}
              </div>
            ) : (
              <div className={styles.pickerList}>
                {gscSites.map((site) => {
                  const cleanUrl = site.siteUrl.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '');
                  const isOwner = site.permissionLevel === 'siteOwner';
                  const permLabel = site.permissionLevel === 'siteOwner' ? (int.owner || 'Owner')
                    : site.permissionLevel === 'siteFullUser' ? (int.fullAccess || 'Full Access')
                    : site.permissionLevel === 'siteRestrictedUser' ? (int.restricted || 'Restricted')
                    : (int.unverified || 'Unverified');
                  return (
                    <button
                      key={site.siteUrl}
                      className={`${styles.pickerItem} ${integration?.gscSiteUrl === site.siteUrl ? styles.pickerItemActive : ''}`}
                      onClick={() => saveGSCSite(site.siteUrl)}
                      disabled={gscSaving}
                    >
                      <div>
                        <div className={styles.pickerItemName}>
                          <Globe size={14} style={{ opacity: 0.5, flexShrink: 0 }} />
                          {cleanUrl}
                        </div>
                        <div className={styles.pickerItemMeta}>
                          <span className={`${styles.permBadge} ${isOwner ? styles.permOwner : styles.permOther}`}>
                            {permLabel}
                          </span>
                          {site.siteUrl.startsWith('sc-domain:') && (
                            <span className={styles.domainTag}>{int.domainProperty || 'Domain Property'}</span>
                          )}
                        </div>
                      </div>
                      {integration?.gscSiteUrl === site.siteUrl && <Check size={14} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* WordPress Integration (static) */}
      <div className={styles.settingsSection}>
        <div className={styles.integrationHeader}>
          <div className={styles.integrationTitleRow}>
            <svg className={styles.integrationIcon} width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" fill="#21759B"/>
              <path d="M3.01 12c0 3.59 2.09 6.7 5.12 8.17L3.86 8.41A9.95 9.95 0 003.01 12zm15.06-1.23c0-1.12-.4-1.89-.75-2.49-.46-.75-.9-1.38-.9-2.13 0-.84.63-1.61 1.52-1.61h.11a9.96 9.96 0 00-15.08 1.1h.73c1.18 0 3.01-.14 3.01-.14.61-.04.68.86.07.93 0 0-.61.07-1.29.11l4.11 12.23 2.47-7.4-1.76-4.83c-.61-.04-1.18-.11-1.18-.11-.61-.03-.54-.97.07-.93 0 0 1.87.14 2.97.14 1.18 0 3.01-.14 3.01-.14.61-.04.68.86.07.93 0 0-.61.07-1.29.11l4.08 12.13.46-1.52c.51-1.3.75-2.25.75-3.15zm-6.87 1.44L8.13 20.63c1.2.35 2.47.55 3.79.55 1.56 0 3.06-.27 4.45-.76a.87.87 0 01-.07-.12L11.2 12.21z" fill="white"/>
            </svg>
            <h3 className={styles.sectionTitle}>{int.wordpress || 'WordPress'}</h3>
          </div>
          <span className={styles.connectedBadgeSmall}>
            <Check size={12} />
            {int.viaPlugin || 'Via Plugin'}
          </span>
        </div>
        <p className={styles.integrationDisabled}>
          {int.wpManaged || 'Managed through the Ghost Post WordPress plugin. Configure in the Connection tab.'}
        </p>
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
    return <TableSkeleton rows={4} columns={4} hasActions />;
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
      {showConfirmRemove && createPortal(
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
        </div>,
        document.body
      )}

      {/* Change Role Modal */}
      {showChangeRole && createPortal(
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
        </div>,
        document.body
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
function SubscriptionSettings({ subscription, translations, canEdit = true, isLoading = false }) {
  const t = translations;
  const { locale, t: translate, direction } = useLocale();
  const usagePercentage = subscription.aiCreditsLimit > 0 
    ? (subscription.aiCreditsUsed / subscription.aiCreditsLimit) * 100 
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

  // Format number with K/M suffix
  const formatNumber = (num) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(0)}K`;
    }
    return num.toString();
  };

  // Get period label based on interval
  const getPeriodLabel = () => {
    if (subscription.interval === 'YEARLY') {
      return translate('settings.subscriptionSection.perYear') || '/year';
    }
    return t.subscriptionPerMonth || '/month';
  };

  // Get plan display name with correct word order for RTL
  const getPlanDisplayName = () => {
    const planWord = t.subscriptionPlan || translate('settings.subscriptionSection.plan') || 'Plan';
    const planName = subscription.planLabel;
    // For RTL languages, show "Plan Name" instead of "Name Plan"
    if (direction === 'rtl') {
      return `${planWord} ${planName}`;
    }
    return `${planName} ${planWord}`;
  };

  // Get translated label for a limitation
  const getLimitationLabel = (limitation) => {
    // First check translated limitations
    const translatedLimitation = subscription.translatedLimitations?.find(
      tl => tl.key === limitation.key
    );
    if (translatedLimitation?.label) {
      return translatedLimitation.label;
    }
    // Fallback to translation key or the limitation label
    return translate(`settings.subscriptionSection.limitations.${limitation.key}`) || limitation.label || limitation.key;
  };

  // Get current usage for a limitation key
  const getCurrentUsage = (key) => {
    const usageStats = subscription.usageStats || {};
    switch (key) {
      case 'maxSites':
      case 'websites':
        return usageStats.sitesCount || 0;
      case 'maxMembers':
      case 'users':
        return usageStats.membersCount || 0;
      case 'siteAudits':
        return usageStats.siteAuditsCount || 0;
      case 'aiCredits':
        // AI credits usage is tracked directly as used amount
        return subscription.aiCreditsUsed || 0;
      default:
        return 0;
    }
  };

  // Check if a limitation should show progress bar (has a numeric limit)
  const shouldShowProgressBar = (limitation) => {
    return limitation.value && typeof limitation.value === 'number' && limitation.value > 0;
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingSpinner}></div>
        <p>{translate('common.loading') || 'Loading...'}</p>
      </div>
    );
  }

  // Get features array
  const features = subscription.features || [];
  // Get limitations array
  const limitations = subscription.limitations || [];

  return (
    <>
      {/* Plan Header Card */}
      <div className={styles.subscriptionCard}>
        <div className={styles.subscriptionHeader}>
          <div className={styles.planInfo}>
            <div className={styles.planName}>
              <Crown size={20} style={{ display: 'inline', marginInlineEnd: '0.5rem' }} />
              {getPlanDisplayName()}
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

        {subscription.nextBillingDate && (
          <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', marginTop: '1rem' }}>
            {t.subscriptionNextBillingDate} <strong>{formatDate(subscription.nextBillingDate)}</strong>
          </p>
        )}
      </div>

      {/* Usage & Limitations Section */}
      {limitations.length > 0 && (
        <div className={styles.subsection}>
          <h3 className={styles.subsectionTitle}>
            <Zap className={styles.subsectionIcon} />
            {translate('settings.subscriptionSection.usageLimits') || 'Usage & Limits'}
          </h3>
          <div className={styles.limitationsList}>
            {limitations.map((limitation, index) => {
              const currentUsage = getCurrentUsage(limitation.key);
              const limit = limitation.value || 0;
              const isUnlimited = limit === -1 || limitation.type === 'unlimited';
              const translatedLabel = getLimitationLabel(limitation);
              
              // For AI credits, show used/limit
              const isAiCredits = limitation.key === 'aiCredits';
              const used = isAiCredits ? subscription.aiCreditsUsed : 0;
              const usagePercent = limit > 0 
                ? (isAiCredits ? (used / limit) * 100 : (currentUsage / limit) * 100)
                : 0;
              
              return (
                <div key={limitation.key || index} className={styles.limitationCard}>
                  <div className={styles.limitationHeader}>
                    <span className={styles.limitationLabel}>{translatedLabel}</span>
                    <span className={styles.limitationValue}>
                      {isUnlimited ? (
                        translate('settings.subscriptionSection.unlimited') || 'Unlimited'
                      ) : shouldShowProgressBar(limitation) ? (
                        isAiCredits 
                          ? `${formatNumber(used)} / ${formatNumber(limit)}`
                          : `${formatNumber(currentUsage)} / ${formatNumber(limit)}`
                      ) : (
                        formatNumber(limit)
                      )}
                    </span>
                  </div>
                  {shouldShowProgressBar(limitation) && !isUnlimited && (
                    <div className={styles.usageTrack}>
                      <div 
                        className={`${styles.usageFill} ${!isAiCredits && usagePercent >= 90 ? styles.usageWarning : ''} ${!isAiCredits && usagePercent >= 100 ? styles.usageDanger : ''} ${isAiCredits && usagePercent <= 10 ? styles.usageWarning : ''} ${isAiCredits && usagePercent <= 0 ? styles.usageDanger : ''}`}
                        style={{ width: `${Math.min(usagePercent, 100)}%` }}
                      ></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Features Section */}
      {features.length > 0 && (
        <div className={styles.subsection}>
          <h3 className={styles.subsectionTitle}>
            <Sparkles className={styles.subsectionIcon} />
            {translate('settings.subscriptionSection.planFeatures') || 'Plan Features'}
          </h3>
          <div className={styles.featuresGrid}>
            {features.map((feature, index) => (
              <div key={feature.key || index} className={styles.featureItem}>
                <Check size={16} className={styles.featureIcon} />
                <span className={styles.featureLabel}>
                  {feature.label || translate(`settings.subscriptionSection.features.${feature.key}`) || feature.key}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Purchased Add-ons Section */}
      <SubscriptionPurchasedAddons translate={translate} locale={locale} />

      {/* Billing Actions */}
      <div className={styles.subsection}>
        <h3 className={styles.subsectionTitle}>
          <CreditCard className={styles.subsectionIcon} />
          {t.subscriptionBillingActions}
        </h3>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button className={styles.editButton}>
            <Crown size={14} style={{ marginInlineEnd: '0.25rem' }} />
            {t.subscriptionUpgradePlan}
          </button>
          <button className={styles.editButton}>
            <CreditCard size={14} style={{ marginInlineEnd: '0.25rem' }} />
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

// Purchased add-ons sub-component for Subscription tab
function SubscriptionPurchasedAddons({ translate, locale }) {
  const { user } = useUser();
  const [purchasedAddons, setPurchasedAddons] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchPurchases() {
      if (!user?.subscription?.id) { setIsLoading(false); return; }
      try {
        const res = await fetch('/api/user/addon-purchases');
        if (res.ok) {
          const data = await res.json();
          setPurchasedAddons(data.purchases || []);
        }
      } catch (e) { console.error(e); }
      finally { setIsLoading(false); }
    }
    fetchPurchases();
  }, [user?.subscription?.id]);

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  };

  if (isLoading || purchasedAddons.length === 0) return null;

  // Group purchases by addon
  const grouped = {};
  purchasedAddons.forEach(p => {
    if (!grouped[p.addOnId]) grouped[p.addOnId] = { addon: p.addOn, purchases: [] };
    grouped[p.addOnId].purchases.push(p);
  });

  return (
    <div className={styles.subsection}>
      <h3 className={styles.subsectionTitle}>
        <Package className={styles.subsectionIcon} />
        {translate('settings.subscriptionSection.purchasedAddons') || 'Purchased Add-ons'}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {Object.values(grouped).map(({ addon, purchases }) => (
          <div key={addon?.id || purchases[0]?.id} className={styles.addonPurchaseHistoryCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.25rem' }}>
                  {addon?.type === 'SEATS' ? '👥' : addon?.type === 'SITES' ? '🌐' : addon?.type === 'AI_CREDITS' ? '✨' : '📦'}
                </span>
                <span style={{ fontWeight: 600 }}>{addon?.name || 'Add-on'}</span>
                <span className={styles.addonPurchaseCountBadge}>
                  ×{purchases.reduce((sum, p) => sum + (p.quantity || 1), 0)}
                </span>
              </div>
              <span style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)' }}>
                {translate('settings.addonsSection.purchased') || 'Purchased'}: {formatDate(purchases[purchases.length - 1]?.purchasedAt)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Credits Settings Component
function CreditsSettings({ subscription, translations, canEdit = true, isLoading = false }) {
  const t = translations;
  const { locale, t: translate, direction } = useLocale();
  const [usageLogs, setUsageLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState(null);
  const [showMore, setShowMore] = useState(false);
  
  const usagePercentage = subscription.aiCreditsLimit > 0 
    ? (subscription.aiCreditsUsed / subscription.aiCreditsLimit) * 100 
    : 0;

  // Fetch usage logs on mount
  useEffect(() => {
    async function fetchUsageLogs() {
      try {
        setLogsLoading(true);
        const res = await fetch('/api/credits/logs?limit=50');
        if (!res.ok) throw new Error('Failed to fetch logs');
        const data = await res.json();
        setUsageLogs(data.logs || []);
      } catch (err) {
        console.error('Error fetching usage logs:', err);
        setLogsError(err.message);
      } finally {
        setLogsLoading(false);
      }
    }
    fetchUsageLogs();
  }, []);

  // Format AI credits number with K/M suffix
  const formatCredits = (credits) => {
    if (credits >= 1000000) {
      return `${(credits / 1000000).toFixed(1)}M`;
    }
    if (credits >= 1000) {
      return `${(credits / 1000).toFixed(0)}K`;
    }
    return credits.toString();
  };

  // Format date for display
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  // Get operation name in current language
  const getOperationName = (log) => {
    const operationKey = log.source;
    
    // First, try to get from translations dictionary
    const translatedName = translate(`settings.creditsSection.operations.${operationKey}`);
    if (translatedName && !translatedName.includes('settings.creditsSection.operations.')) {
      return translatedName;
    }
    
    // Fallback to metadata
    const metadata = log.metadata || {};
    if (locale === 'he' && metadata.operationNameHe) {
      return metadata.operationNameHe;
    }
    return metadata.operationName || log.source || translate('settings.creditsSection.unknownOperation') || 'Unknown operation';
  };

  // Map source (operation) to description key for backward compatibility with older logs
  const SOURCE_TO_DESCRIPTION_KEY = {
    'CRAWL_WEBSITE': 'crawledWebsite',
    'GENERATE_KEYWORDS': 'generatedKeywords',
    'FIND_COMPETITORS': 'foundCompetitors',
    'ANALYZE_WRITING_STYLE': 'analyzedWritingStyle',
    'FETCH_ARTICLES': 'fetchedArticles',
    'DETECT_PLATFORM': 'detectedPlatform',
    'COMPLETE_INTERVIEW': 'completedInterview',
    'IMAGE_ALT_OPTIMIZATION': 'optimizedImageAlt',
    'ENTITY_REFRESH': 'extractedFocusKeyword',
    'GENERIC': 'entityEnrichment',
  };

  // Helper to decode URL-encoded strings (especially Hebrew URLs)
  const decodeUrl = (url) => {
    if (!url) return url;
    try {
      return decodeURIComponent(url);
    } catch {
      return url;
    }
  };

  // Get description in current language
  const getDescription = (log) => {
    const metadata = log.metadata || {};
    // Try metadata.descriptionKey first, then infer from source for older logs
    const descriptionKey = metadata.descriptionKey || SOURCE_TO_DESCRIPTION_KEY[log.source];
    const params = metadata.descriptionParams || {};
    
    // If we have a description key, try to translate it
    if (descriptionKey) {
      let translated = translate(`settings.creditsSection.descriptions.${descriptionKey}`);
      if (translated && !translated.includes('settings.creditsSection.descriptions.')) {
        // Replace placeholders like {count}, {url}, etc.
        // For older logs without descriptionParams, try to extract from metadata
        const effectiveParams = Object.keys(params).length > 0 ? params : {
          count: metadata.competitorsFound || metadata.totalKeywords || metadata.keywordsCount || metadata.keywordCount || '',
          keywords: metadata.keywordsSearched?.length || '',
          url: decodeUrl(metadata.url || metadata.websiteUrl) || '',
          platform: metadata.detectedPlatform || metadata.platform || '',
          filename: metadata.suggestedFilename || '',
        };
        
        Object.keys(effectiveParams).forEach(key => {
          if (effectiveParams[key] !== undefined && effectiveParams[key] !== '') {
            // Decode URL values
            let value = effectiveParams[key];
            if (key === 'url' && typeof value === 'string') {
              value = decodeUrl(value);
            }
            translated = translated.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
          }
        });
        
        // Clean up any remaining placeholders
        translated = translated.replace(/\{[^}]+\}/g, '');
        
        return translated.trim();
      }
    }
    
    // Fallback to original description, but decode any URLs in it
    if (log.description) {
      // Try to decode any URL-encoded parts
      return decodeUrl(log.description);
    }
    
    return null;
  };

  // Render description with proper URL direction (LTR for URLs)
  const renderDescription = (log) => {
    const description = getDescription(log);
    if (!description) return null;
    
    // URL regex pattern
    const urlPattern = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}(?:\/[^\s]*)?)/g;
    
    // Check if description contains URLs
    if (urlPattern.test(description)) {
      // Reset regex lastIndex
      urlPattern.lastIndex = 0;
      
      // Split description into parts, keeping URLs separate
      const parts = [];
      let lastIndex = 0;
      let match;
      
      while ((match = urlPattern.exec(description)) !== null) {
        // Add text before URL
        if (match.index > lastIndex) {
          parts.push({ type: 'text', content: description.slice(lastIndex, match.index) });
        }
        // Add URL with LTR direction
        parts.push({ type: 'url', content: match[0] });
        lastIndex = match.index + match[0].length;
      }
      
      // Add remaining text after last URL
      if (lastIndex < description.length) {
        parts.push({ type: 'text', content: description.slice(lastIndex) });
      }
      
      return (
        <>
          {parts.map((part, index) => 
            part.type === 'url' ? (
              <span key={index} dir="ltr" style={{ unicodeBidi: 'embed' }}>{part.content}</span>
            ) : (
              <span key={index}>{part.content}</span>
            )
          )}
        </>
      );
    }
    
    return description;
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingSpinner}></div>
        <p>{translate('common.loading') || 'Loading...'}</p>
      </div>
    );
  }

  // Display logs (limited or all based on showMore)
  const displayedLogs = showMore ? usageLogs : usageLogs.slice(0, 10);

  return (
    <>
      <div className={styles.subscriptionCard}>
        <div className={styles.subscriptionHeader}>
          <div className={styles.planInfo}>
            <div className={styles.planName}>
              <Coins size={20} style={{ display: 'inline', marginInlineEnd: '0.5rem' }} />
              {translate('settings.creditsSection.title') || 'AI Credits'}
            </div>
            <div className={styles.planStatus}>
              <Check size={14} />
              {translate('settings.creditsSection.used') || 'Used'}
            </div>
          </div>
          <div className={styles.planPrice}>
            <div className={styles.priceAmount}>{formatCredits(subscription.aiCreditsUsed)}</div>
            <div className={styles.pricePeriod}>/ {formatCredits(subscription.aiCreditsLimit)}</div>
          </div>
        </div>

        {subscription.aiCreditsLimit > 0 && (
          <div className={styles.usageBar}>
            <div className={styles.usageHeader}>
              <span className={styles.usageLabel}>{translate('settings.creditsSection.usage') || 'Usage'}</span>
              <span className={styles.usageValue}>
                {usagePercentage.toFixed(1)}%
              </span>
            </div>
            <div className={styles.usageTrack}>
              <div 
                className={styles.usageFill} 
                style={{ width: `${Math.min(usagePercentage, 100)}%` }}
              ></div>
            </div>
          </div>
        )}

        <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', marginTop: '1rem' }}>
          {translate('settings.creditsSection.description') || 'AI credits are used for generating content, analyzing data, and other AI-powered features. Credits reset at the beginning of each billing period.'}
        </p>
      </div>

      <div className={styles.subsection}>
        <h3 className={styles.subsectionTitle}>
          <Coins className={styles.subsectionIcon} />
          {translate('settings.creditsSection.actions') || 'Actions'}
        </h3>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button className={styles.editButton}>
            <Plus size={14} style={{ marginInlineEnd: '0.25rem' }} />
            {translate('user.addCredits') || 'Add Credits'}
          </button>
          <button className={styles.editButton}>
            <Crown size={14} style={{ marginInlineEnd: '0.25rem' }} />
            {translate('user.upgradePlan') || 'Upgrade Plan'}
          </button>
        </div>
      </div>

      {/* Purchased AI Credits Add-ons */}
      <CreditsPurchasedAddons translate={translate} locale={locale} />

      {/* Usage Log Section */}
      <div className={styles.subsection}>
        <h3 className={styles.subsectionTitle}>
          <Clock className={styles.subsectionIcon} />
          {translate('settings.creditsSection.usageLog') || 'Usage Log'}
        </h3>
        
        {logsLoading ? (
          <div className={`${styles.loadingContainer} ${styles.usageLogLoading}`}>
            <Loader2 size={24} className={styles.loadingSpinner} />
            <p>{translate('common.loading') || 'Loading...'}</p>
          </div>
        ) : logsError ? (
          <div className={styles.usageLogError}>
            {translate('settings.creditsSection.errorLoadingLogs') || 'Failed to load usage logs'}
          </div>
        ) : usageLogs.length === 0 ? (
          <div className={styles.usageLogEmpty}>
            {translate('settings.creditsSection.noLogs') || 'No usage history yet'}
          </div>
        ) : (
          <>
            <div className={styles.creditsLogTable}>
              <table className={styles.usageLogTable}>
                <thead>
                  <tr className={`${styles.usageLogHeaderRow} ${direction === 'rtl' ? styles.textRight : styles.textLeft}`}>
                    <th className={styles.usageLogHeaderCell}>
                      {translate('settings.creditsSection.logColumns.date') || 'Date'}
                    </th>
                    <th className={styles.usageLogHeaderCell}>
                      {translate('settings.creditsSection.logColumns.action') || 'Action'}
                    </th>
                    <th className={styles.usageLogHeaderCell}>
                      {translate('settings.creditsSection.logColumns.website') || 'Website'}
                    </th>
                    <th className={styles.usageLogHeaderCell}>
                      {translate('settings.creditsSection.logColumns.user') || 'User'}
                    </th>
                    <th className={styles.usageLogHeaderCellCenter}>
                      {translate('settings.creditsSection.logColumns.credits') || 'Credits'}
                    </th>
                    <th className={styles.usageLogHeaderCellCenter}>
                      {translate('settings.creditsSection.logColumns.balance') || 'Balance'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayedLogs.map((log) => (
                    <tr key={log.id} className={styles.usageLogRow}>
                      <td className={styles.usageLogCellMuted}>
                        {formatDate(log.createdAt)}
                      </td>
                      <td className={styles.usageLogCell}>
                        <div className={styles.usageLogAction}>{getOperationName(log)}</div>
                        {getDescription(log) && (
                          <div className={styles.usageLogActionDescription}>
                            {renderDescription(log)}
                          </div>
                        )}
                      </td>
                      <td className={styles.usageLogCell}>
                        {log.siteName ? (
                          log.siteUrl ? (
                            <a 
                              href={log.siteUrl.startsWith('http') ? log.siteUrl : `https://${log.siteUrl}`} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className={styles.usageLogSiteLink}
                            >
                              {log.siteName}
                            </a>
                          ) : (
                            <span>{log.siteName}</span>
                          )
                        ) : (
                          <span className={styles.usageLogEmptyCell}>—</span>
                        )}
                      </td>
                      <td className={styles.usageLogCell}>
                        {log.userName || <span className={styles.usageLogEmptyCell}>—</span>}
                      </td>
                      <td className={styles.usageLogCellCenter}>
                        <span className={log.type === 'CREDIT' ? styles.usageLogCreditsCredit : styles.usageLogCreditsDebit}>
                          {log.type === 'CREDIT' ? '+' : ''}{log.amount}
                        </span>
                      </td>
                      <td className={styles.usageLogCellCenterMuted}>
                        {(subscription.aiCreditsLimit - log.balance).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {usageLogs.length > 10 && (
              <div className={styles.usageLogShowMoreContainer}>
                <button 
                  onClick={() => setShowMore(!showMore)}
                  className={`${styles.editButton} ${styles.usageLogShowMoreButton}`}
                >
                  {showMore 
                    ? (translate('common.showLess') || 'Show Less') 
                    : (translate('common.showMore') || `Show More (${usageLogs.length - 10} more)`)}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

// Purchased AI Credits sub-component for Credits tab
function CreditsPurchasedAddons({ translate, locale }) {
  const { user } = useUser();
  const [purchasedAddons, setPurchasedAddons] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchPurchases() {
      if (!user?.subscription?.id) { setIsLoading(false); return; }
      try {
        const res = await fetch('/api/user/addon-purchases');
        if (res.ok) {
          const data = await res.json();
          // Filter only AI credits purchases
          const aiCreditsPurchases = (data.purchases || []).filter(p => p.addOn?.type === 'AI_CREDITS');
          setPurchasedAddons(aiCreditsPurchases);
        }
      } catch (e) { console.error(e); }
      finally { setIsLoading(false); }
    }
    fetchPurchases();
  }, [user?.subscription?.id]);

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  };

  const formatCredits = (credits) => {
    if (credits >= 1000000) return `${(credits / 1000000).toFixed(1)}M`;
    if (credits >= 1000) return `${(credits / 1000).toFixed(0)}K`;
    return credits.toString();
  };

  if (isLoading || purchasedAddons.length === 0) return null;

  return (
    <div className={styles.subsection}>
      <h3 className={styles.subsectionTitle}>
        <ShoppingCart className={styles.subsectionIcon} />
        {translate('settings.creditsSection.purchasedPacks') || 'Purchased Credit Packs'}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {purchasedAddons.map((purchase) => (
          <div key={purchase.id} className={styles.addonPurchaseHistoryCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.25rem' }}>✨</span>
                <span style={{ fontWeight: 600 }}>{purchase.addOn?.name || 'AI Credits'}</span>
                {purchase.addOn?.quantity && (
                  <span className={styles.addonPurchaseCountBadge}>
                    +{formatCredits(purchase.addOn.quantity * (purchase.quantity || 1))}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span className={`${styles.addonStatusBadge} ${purchase.status === 'ACTIVE' ? styles.addonStatusActive : styles.addonStatusInactive}`}>
                  {purchase.status === 'ACTIVE' ? <Check size={10} /> : null}
                  {purchase.status}
                </span>
                <span style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)' }}>
                  {formatDate(purchase.purchasedAt)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Add-ons Settings Component
function AddonsSettings({ translations, canEdit = true }) {
  const { t: translate, direction, locale } = useLocale();
  const { user } = useUser();
  const [addons, setAddons] = useState([]);
  const [purchasedAddons, setPurchasedAddons] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [quantities, setQuantities] = useState({});
  const [purchasing, setPurchasing] = useState({});
  const [purchaseMessages, setPurchaseMessages] = useState({});

  // Type icons mapping
  const typeIcons = {
    SEATS: '👥',
    SITES: '🌐',
    AI_CREDITS: '✨',
    STORAGE: '💾',
    KEYWORDS: '🔑',
    CONTENT: '📝',
  };

  // Fetch addons from API
  useEffect(() => {
    async function fetchAddons() {
      try {
        setIsLoading(true);
        // Fetch available addons
        const lang = locale?.toUpperCase() || 'EN';
        const response = await fetch(`/api/public/addons?lang=${lang}`);
        if (response.ok) {
          const data = await response.json();
          setAddons(data.addOns || []);
        }

        // Fetch user's purchased addons if logged in and has subscription
        if (user?.subscription?.id) {
          const purchasesResponse = await fetch('/api/user/addon-purchases');
          if (purchasesResponse.ok) {
            const purchasesData = await purchasesResponse.json();
            setPurchasedAddons(purchasesData.purchases || []);
          }
        }
      } catch (error) {
        console.error('Error fetching addons:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchAddons();
  }, [locale, user?.subscription?.id]);

  // Get purchase count for an addon
  const getAddonPurchaseCount = (addonId) => {
    return purchasedAddons.filter(p => p.addOnId === addonId && p.status === 'ACTIVE').length;
  };

  // Get purchase history for an addon (all statuses)
  const getAddonPurchases = (addonId) => {
    return purchasedAddons.filter(p => p.addOnId === addonId);
  };

  // Get quantity for an addon
  const getQuantity = (addonId) => quantities[addonId] || 1;

  // Set quantity for an addon
  const setQuantity = (addonId, qty) => {
    setQuantities(prev => ({ ...prev, [addonId]: Math.max(1, qty) }));
  };

  // Handle purchase
  const handlePurchase = async (addon) => {
    const qty = getQuantity(addon.id);
    setPurchasing(prev => ({ ...prev, [addon.id]: true }));
    setPurchaseMessages(prev => ({ ...prev, [addon.id]: null }));
    try {
      const res = await fetch('/api/subscription/addons/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addOnId: addon.id, quantity: qty }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPurchaseMessages(prev => ({ ...prev, [addon.id]: { type: 'success', text: data.message } }));
        // Reset quantity
        setQuantity(addon.id, 1);
        // Refresh purchases
        const purchasesResponse = await fetch('/api/user/addon-purchases');
        if (purchasesResponse.ok) {
          const purchasesData = await purchasesResponse.json();
          setPurchasedAddons(purchasesData.purchases || []);
        }
      } else {
        setPurchaseMessages(prev => ({ ...prev, [addon.id]: { type: 'error', text: data.error || 'Purchase failed' } }));
      }
    } catch (error) {
      setPurchaseMessages(prev => ({ ...prev, [addon.id]: { type: 'error', text: 'Purchase failed' } }));
    } finally {
      setPurchasing(prev => ({ ...prev, [addon.id]: false }));
    }
  };

  // Format price with billing type
  const formatPrice = (addon, qty = 1) => {
    const totalPrice = addon.price * qty;
    const price = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: addon.currency || 'USD',
      minimumFractionDigits: 0,
    }).format(totalPrice);

    if (addon.billingType === 'ONE_TIME') {
      return { price, period: translate('settings.addonsSection.oneTime') || 'one-time' };
    }
    return { price, period: translate('settings.subscriptionSection.perMonth') || 'month' };
  };

  // Get addon description with quantity info
  const getAddonDescription = (addon) => {
    let desc = addon.description || '';
    if (addon.quantity && addon.type === 'AI_CREDITS') {
      desc = `${addon.quantity.toLocaleString()} ${translate('settings.addonsSection.credits') || 'AI Credits'}${desc ? ' - ' + desc : ''}`;
    }
    return desc;
  };

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <>
      <div className={styles.subsection}>
        <h3 className={styles.subsectionTitle}>
          <Package className={styles.subsectionIcon} />
          {translate('settings.addonsSection.title') || 'Available Add-ons'}
        </h3>
        <p style={{ color: 'var(--muted-foreground)', marginBottom: '1.5rem' }}>
          {translate('settings.addonsSection.description') || 'Enhance your Ghost Post experience with additional features and capabilities.'}
        </p>
        
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <Loader2 className="animate-spin" size={24} style={{ color: 'var(--muted-foreground)' }} />
          </div>
        ) : addons.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '2rem', 
            color: 'var(--muted-foreground)',
            background: 'var(--muted)',
            borderRadius: 'var(--radius-lg)',
          }}>
            <Package size={32} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
            <p>{translate('settings.addonsSection.noAddons') || 'No add-ons available at the moment.'}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {addons.map((addon) => {
              const qty = getQuantity(addon.id);
              const { price, period } = formatPrice(addon, qty);
              const purchaseCount = getAddonPurchaseCount(addon.id);
              const isPurchased = purchaseCount > 0;
              const msg = purchaseMessages[addon.id];
              
              return (
                <div 
                  key={addon.id} 
                  className={styles.subscriptionCard}
                  style={{ padding: '1.25rem' }}
                >
                  <div className={styles.subscriptionHeader}>
                    <div className={styles.planInfo}>
                      <div className={styles.planName} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '1.5rem' }}>{typeIcons[addon.type] || '📦'}</span>
                        {addon.name}
                        {addon.billingType === 'ONE_TIME' && (
                          <span className={styles.oneTimeBadge}>
                            {translate('settings.addonsSection.oneTimeBadge') || 'ONE-TIME'}
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', marginTop: '0.25rem' }}>
                        {getAddonDescription(addon)}
                      </p>
                      {isPurchased && (
                        <div className={styles.addonPurchasedBadge}>
                          <Check size={12} />
                          {purchaseCount === 1 
                            ? (translate('settings.addonsSection.alreadyPurchased') || 'You have already purchased this add-on')
                            : (translate('settings.addonsSection.alreadyPurchasedCount') || 'You have purchased this add-on {count} times').replace('{count}', purchaseCount)
                          }
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                      <div className={styles.planPrice}>
                        <div className={styles.priceAmount}>{price}</div>
                        {addon.billingType !== 'ONE_TIME' && (
                          <div className={styles.pricePeriod}>/{period}</div>
                        )}
                      </div>
                      {/* Quantity counter */}
                      <div className={styles.addonQuantityRow}>
                        <div className={styles.addonQuantityCounter}>
                          <button 
                            className={styles.addonQuantityBtn}
                            onClick={() => setQuantity(addon.id, qty - 1)}
                            disabled={qty <= 1 || purchasing[addon.id]}
                            aria-label="Decrease quantity"
                          >
                            <Minus size={14} />
                          </button>
                          <span className={styles.addonQuantityValue}>{qty}</span>
                          <button 
                            className={styles.addonQuantityBtn}
                            onClick={() => setQuantity(addon.id, qty + 1)}
                            disabled={purchasing[addon.id]}
                            aria-label="Increase quantity"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                        <button 
                          className={styles.editButton} 
                          disabled={!canEdit || purchasing[addon.id]}
                          onClick={() => handlePurchase(addon)}
                        >
                          {purchasing[addon.id] ? (
                            <Loader2 size={14} className="animate-spin" style={{ marginInlineEnd: '0.25rem' }} />
                          ) : (
                            <ShoppingCart size={14} style={{ marginInlineEnd: '0.25rem' }} />
                          )}
                          {addon.billingType === 'ONE_TIME' 
                            ? (translate('settings.addonsSection.buy') || 'Buy')
                            : (translate('settings.addonsSection.subscribe') || 'Subscribe')
                          }
                        </button>
                      </div>
                      {msg && (
                        <div className={msg.type === 'success' ? styles.addonMsgSuccess : styles.addonMsgError}>
                          {msg.type === 'success' ? <Check size={12} /> : <AlertCircle size={12} />}
                          {msg.text}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

// Google icon component
function GoogleIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

// Profile Tab configuration
const PROFILE_TABS = [
  { id: 'personal', icon: User, labelKey: 'profile.tabs.personal' },
  { id: 'security', icon: Key, labelKey: 'profile.tabs.security' },
  { id: 'connections', icon: Link, labelKey: 'profile.tabs.connections' },
];

// Profile Settings Component - Full profile management
function ProfileSettings({ translations }) {
  const { t: translate } = useLocale();
  const { user: contextUser, updateUser } = useUser();

  // Tab state
  const [activeProfileTab, setActiveProfileTab] = useState('personal');

  // Profile state
  const [profile, setProfile] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    image: null,
    emailVerified: null,
    phoneVerified: null,
    primaryAuthMethod: 'EMAIL',
  });
  const [authProviders, setAuthProviders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState({ type: '', text: '' });

  // Password change state
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState({ type: '', text: '' });

  // Image upload state
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Fetch user profile on mount
  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/user/profile');
      if (response.ok) {
        const data = await response.json();
        setProfile({
          firstName: data.user.firstName || '',
          lastName: data.user.lastName || '',
          email: data.user.email || '',
          phoneNumber: data.user.phoneNumber || '',
          image: data.user.image || null,
          emailVerified: data.user.emailVerified,
          phoneVerified: data.user.phoneVerified,
          primaryAuthMethod: data.user.primaryAuthMethod || 'EMAIL',
        });
        setAuthProviders(data.authProviders || []);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProfileChange = (field, value) => {
    setProfile(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveProfile = async () => {
    try {
      setIsSaving(true);
      setSaveMessage({ type: '', text: '' });

      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: profile.firstName,
          lastName: profile.lastName,
          phoneNumber: profile.phoneNumber,
        }),
      });

      if (response.ok) {
        setSaveMessage({ type: 'success', text: translate('profile.saveSuccess') });
        // Update context user
        updateUser({
          ...contextUser,
          firstName: profile.firstName,
          lastName: profile.lastName,
        });
      } else {
        const error = await response.json();
        setSaveMessage({ type: 'error', text: error.error || translate('profile.saveError') });
      }
    } catch (error) {
      setSaveMessage({ type: 'error', text: translate('profile.saveError') });
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveMessage({ type: '', text: '' }), 5000);
    }
  };

  const handlePasswordChange = async () => {
    // Validation
    if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
      setPasswordMessage({ type: 'error', text: translate('profile.password.allFieldsRequired') });
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordMessage({ type: 'error', text: translate('profile.password.mismatch') });
      return;
    }

    if (passwordData.newPassword.length < 8) {
      setPasswordMessage({ type: 'error', text: translate('profile.password.tooShort') });
      return;
    }

    try {
      setIsChangingPassword(true);
      setPasswordMessage({ type: '', text: '' });

      const response = await fetch('/api/user/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword,
        }),
      });

      if (response.ok) {
        setPasswordMessage({ type: 'success', text: translate('profile.password.changeSuccess') });
        setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        const error = await response.json();
        setPasswordMessage({ type: 'error', text: error.error || translate('profile.password.changeError') });
      }
    } catch (error) {
      setPasswordMessage({ type: 'error', text: translate('profile.password.changeError') });
    } finally {
      setIsChangingPassword(false);
      setTimeout(() => setPasswordMessage({ type: '', text: '' }), 5000);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setSaveMessage({ type: 'error', text: translate('profile.image.invalidType') });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setSaveMessage({ type: 'error', text: translate('profile.image.tooLarge') });
      return;
    }

    try {
      setIsUploadingImage(true);
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch('/api/user/profile/image', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        setProfile(prev => ({ ...prev, image: data.imageUrl }));
        updateUser({ ...contextUser, image: data.imageUrl });
        setSaveMessage({ type: 'success', text: translate('profile.image.uploadSuccess') });
      } else {
        const error = await response.json();
        setSaveMessage({ type: 'error', text: error.error || translate('profile.image.uploadError') });
      }
    } catch (error) {
      setSaveMessage({ type: 'error', text: translate('profile.image.uploadError') });
    } finally {
      setIsUploadingImage(false);
      setTimeout(() => setSaveMessage({ type: '', text: '' }), 5000);
    }
  };

  const handleConnectGoogle = () => {
    // Redirect to Google OAuth
    window.location.href = '/api/auth/google?action=link';
  };

  const handleDisconnectGoogle = async () => {
    if (!confirm(translate('profile.google.disconnectConfirm'))) return;

    try {
      const response = await fetch('/api/user/auth-providers/google', {
        method: 'DELETE',
      });

      if (response.ok) {
        setAuthProviders(prev => prev.filter(p => p.provider !== 'GOOGLE'));
        setSaveMessage({ type: 'success', text: translate('profile.google.disconnectSuccess') });
      } else {
        const error = await response.json();
        setSaveMessage({ type: 'error', text: error.error || translate('profile.google.disconnectError') });
      }
    } catch (error) {
      setSaveMessage({ type: 'error', text: translate('profile.google.disconnectError') });
    }
    setTimeout(() => setSaveMessage({ type: '', text: '' }), 5000);
  };

  const isGoogleConnected = authProviders.some(p => p.provider === 'GOOGLE');
  const googleProvider = authProviders.find(p => p.provider === 'GOOGLE');
  const hasPassword = profile.primaryAuthMethod === 'EMAIL';

  // Get initials for avatar fallback
  const getInitials = () => {
    if (profile.firstName && profile.lastName) {
      return `${profile.firstName.charAt(0)}${profile.lastName.charAt(0)}`.toUpperCase();
    }
    if (profile.firstName) {
      return profile.firstName.substring(0, 2).toUpperCase();
    }
    if (profile.email) {
      return profile.email.substring(0, 2).toUpperCase();
    }
    return '??';
  };

  if (isLoading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingSpinner}></div>
        <p>{translate('common.loading')}</p>
      </div>
    );
  }

  return (
    <>
      {/* Profile Tabs Navigation */}
      <div className={styles.profileTabsWrapper}>
        <div className={styles.profileTabs}>
          {PROFILE_TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveProfileTab(tab.id)}
                className={`${styles.profileTab} ${activeProfileTab === tab.id ? styles.profileTabActive : ''}`}
              >
                <Icon size={18} />
                <span>{translate(tab.labelKey)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className={styles.profileTabContent}>
        {/* Personal Info Tab */}
        {activeProfileTab === 'personal' && (
          <div className={styles.profileCard}>
            <div className={styles.profileCardHeader}>
              <div className={styles.profileCardIconWrapper}>
                <User size={24} />
              </div>
              <div className={styles.profileCardHeaderContent}>
                <h2 className={styles.profileCardTitle}>{translate('profile.personalInfo.title')}</h2>
                <p className={styles.profileCardDescription}>{translate('profile.personalInfo.description')}</p>
              </div>
            </div>

            <div className={styles.profileCardContent}>
              {/* Avatar Section */}
              <div className={styles.profileAvatarSection}>
                <div className={styles.profileAvatarWrapper}>
                  {profile.image ? (
                    <Image
                      src={profile.image}
                      alt={`${profile.firstName} ${profile.lastName}`}
                      width={100}
                      height={100}
                      className={styles.profileAvatarImage}
                    />
                  ) : (
                    <div className={styles.profileAvatarFallback}>
                      {getInitials()}
                    </div>
                  )}
                  <label className={styles.profileAvatarUpload}>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      disabled={isUploadingImage}
                      className={styles.profileHiddenInput}
                    />
                    <Camera size={16} />
                  </label>
                </div>
                <div className={styles.profileAvatarInfo}>
                  <p className={styles.profileAvatarHint}>{translate('profile.image.hint')}</p>
                  <p className={styles.profileAvatarFormats}>{translate('profile.image.formats')}</p>
                </div>
              </div>

              {/* Form Fields */}
              <div className={styles.profileFormGrid}>
                <div className={styles.profileFormGroup}>
                  <label className={styles.profileLabel}>
                    <User size={16} />
                    {translate('profile.personalInfo.firstName')}
                  </label>
                  <input
                    type="text"
                    value={profile.firstName}
                    onChange={(e) => handleProfileChange('firstName', e.target.value)}
                    placeholder={translate('profile.personalInfo.firstNamePlaceholder')}
                    className={styles.profileInput}
                  />
                </div>

                <div className={styles.profileFormGroup}>
                  <label className={styles.profileLabel}>
                    <User size={16} />
                    {translate('profile.personalInfo.lastName')}
                  </label>
                  <input
                    type="text"
                    value={profile.lastName}
                    onChange={(e) => handleProfileChange('lastName', e.target.value)}
                    placeholder={translate('profile.personalInfo.lastNamePlaceholder')}
                    className={styles.profileInput}
                  />
                </div>

                <div className={styles.profileFormGroup}>
                  <label className={styles.profileLabel}>
                    <Mail size={16} />
                    {translate('profile.personalInfo.email')}
                  </label>
                  <div className={styles.profileInputWithBadge}>
                    <input
                      type="email"
                      value={profile.email}
                      disabled
                      className={`${styles.profileInput} ${styles.disabled}`}
                    />
                    {profile.emailVerified && (
                      <span className={styles.profileVerifiedBadge}>
                        <Check size={12} />
                        {translate('profile.verified')}
                      </span>
                    )}
                  </div>
                  <span className={styles.profileInputHint}>{translate('profile.personalInfo.emailHint')}</span>
                </div>

                <div className={styles.profileFormGroup}>
                  <label className={styles.profileLabel}>
                    <Phone size={16} />
                    {translate('profile.personalInfo.phone')}
                  </label>
                  <input
                    type="tel"
                    value={profile.phoneNumber}
                    onChange={(e) => handleProfileChange('phoneNumber', e.target.value)}
                    placeholder={translate('profile.personalInfo.phonePlaceholder')}
                    className={styles.profileInput}
                  />
                </div>
              </div>

              {/* Save Message */}
              {saveMessage.text && (
                <div className={`${styles.profileMessage} ${styles[saveMessage.type]}`}>
                  {saveMessage.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
                  {saveMessage.text}
                </div>
              )}

              {/* Save Button */}
              <div className={styles.profileCardActions}>
                <button
                  onClick={handleSaveProfile}
                  disabled={isSaving}
                  className={styles.profileSaveButton}
                >
                  {isSaving ? translate('common.saving') : translate('common.save')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Security Tab */}
        {activeProfileTab === 'security' && (
          <div className={styles.profileCard}>
            <div className={styles.profileCardHeader}>
              <div className={styles.profileCardIconWrapper}>
                <Shield size={24} />
              </div>
              <div className={styles.profileCardHeaderContent}>
                <h2 className={styles.profileCardTitle}>{translate('profile.security.title')}</h2>
                <p className={styles.profileCardDescription}>{translate('profile.security.description')}</p>
              </div>
            </div>

            <div className={styles.profileCardContent}>
              {/* Password Change Section */}
              {hasPassword && (
                <div className={styles.profileSection}>
                  <h3 className={styles.profileSectionTitle}>{translate('profile.password.title')}</h3>
                  <p className={styles.profileSectionDescription}>{translate('profile.password.description')}</p>

                  <div className={styles.profilePasswordForm}>
                    <div className={styles.profileFormGroup}>
                      <label className={styles.profileLabel}>
                        <Lock size={16} />
                        {translate('profile.password.current')}
                      </label>
                      <div className={styles.profilePasswordInput}>
                        <input
                          type={showPasswords.current ? 'text' : 'password'}
                          value={passwordData.currentPassword}
                          onChange={(e) => setPasswordData(prev => ({ ...prev, currentPassword: e.target.value }))}
                          placeholder={translate('profile.password.currentPlaceholder')}
                          className={styles.profileInput}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPasswords(prev => ({ ...prev, current: !prev.current }))}
                          className={styles.profilePasswordToggle}
                        >
                          {showPasswords.current ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>

                    <div className={styles.profileFormGroup}>
                      <label className={styles.profileLabel}>
                        <Lock size={16} />
                        {translate('profile.password.new')}
                      </label>
                      <div className={styles.profilePasswordInput}>
                        <input
                          type={showPasswords.new ? 'text' : 'password'}
                          value={passwordData.newPassword}
                          onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                          placeholder={translate('profile.password.newPlaceholder')}
                          className={styles.profileInput}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPasswords(prev => ({ ...prev, new: !prev.new }))}
                          className={styles.profilePasswordToggle}
                        >
                          {showPasswords.new ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>

                    <div className={styles.profileFormGroup}>
                      <label className={styles.profileLabel}>
                        <Lock size={16} />
                        {translate('profile.password.confirm')}
                      </label>
                      <div className={styles.profilePasswordInput}>
                        <input
                          type={showPasswords.confirm ? 'text' : 'password'}
                          value={passwordData.confirmPassword}
                          onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                          placeholder={translate('profile.password.confirmPlaceholder')}
                          className={styles.profileInput}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPasswords(prev => ({ ...prev, confirm: !prev.confirm }))}
                          className={styles.profilePasswordToggle}
                        >
                          {showPasswords.confirm ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>

                    {/* Password Requirements */}
                    <div className={styles.profilePasswordRequirements}>
                      <p className={styles.profileRequirementsTitle}>{translate('profile.password.requirements')}</p>
                      <ul className={styles.profileRequirementsList}>
                        <li>{translate('profile.password.minLength')}</li>
                      </ul>
                    </div>

                    {/* Password Message */}
                    {passwordMessage.text && (
                      <div className={`${styles.profileMessage} ${styles[passwordMessage.type]}`}>
                        {passwordMessage.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
                        {passwordMessage.text}
                      </div>
                    )}

                    <button
                      onClick={handlePasswordChange}
                      disabled={isChangingPassword}
                      className={styles.profileChangePasswordButton}
                    >
                      {isChangingPassword ? translate('common.saving') : translate('profile.password.change')}
                    </button>
                  </div>
                </div>
              )}

              {/* Two-Factor Authentication Section */}
              <div className={styles.profileSection}>
                <h3 className={styles.profileSectionTitle}>{translate('profile.twoFactor.title')}</h3>
                <p className={styles.profileSectionDescription}>{translate('profile.twoFactor.description')}</p>
                
                <div className={styles.profileTwoFactorStatus}>
                  <div className={styles.profileTwoFactorIcon}>
                    <Shield size={24} />
                  </div>
                  <div className={styles.profileTwoFactorInfo}>
                    <span className={styles.profileTwoFactorLabel}>{translate('profile.twoFactor.status')}</span>
                    <span className={styles.profileTwoFactorValue}>{translate('profile.twoFactor.disabled')}</span>
                  </div>
                  <button className={styles.profileEnableTwoFactorButton} disabled>
                    {translate('profile.twoFactor.enable')}
                  </button>
                </div>
                <p className={styles.profileComingSoon}>{translate('common.comingSoon')}</p>
              </div>
            </div>
          </div>
        )}

        {/* Connections Tab */}
        {activeProfileTab === 'connections' && (
          <div className={styles.profileCard}>
            <div className={styles.profileCardHeader}>
              <div className={styles.profileCardIconWrapper}>
                <Link size={24} />
              </div>
              <div className={styles.profileCardHeaderContent}>
                <h2 className={styles.profileCardTitle}>{translate('profile.connectedAccounts.title')}</h2>
                <p className={styles.profileCardDescription}>{translate('profile.connectedAccounts.description')}</p>
              </div>
            </div>

            <div className={styles.profileCardContent}>
              <div className={styles.profileProvidersList}>
                {/* Google */}
                <div className={`${styles.profileProviderItem} ${isGoogleConnected ? styles.connected : ''}`}>
                  <div className={styles.profileProviderInfo}>
                    <div className={styles.profileProviderIcon}>
                      <GoogleIcon size={24} />
                    </div>
                    <div className={styles.profileProviderDetails}>
                      <span className={styles.profileProviderName}>{translate('profile.connectedAccounts.google')}</span>
                      {isGoogleConnected && googleProvider?.providerAccountId && (
                        <span className={styles.profileProviderEmail}>{googleProvider.providerAccountId}</span>
                      )}
                    </div>
                  </div>
                  <div className={styles.profileProviderActions}>
                    {isGoogleConnected ? (
                      <>
                        <span className={styles.profileConnectedBadge}>
                          <Check size={14} />
                          {translate('profile.connectedAccounts.connected')}
                        </span>
                        <button
                          onClick={handleDisconnectGoogle}
                          className={styles.profileDisconnectButton}
                        >
                          <Unlink size={16} />
                          {translate('profile.connectedAccounts.disconnect')}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={handleConnectGoogle}
                        className={styles.profileConnectButton}
                      >
                        <Link size={16} />
                        {translate('profile.connectedAccounts.connect')}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Save Message for connections */}
              {saveMessage.text && (
                <div className={`${styles.profileMessage} ${styles[saveMessage.type]}`}>
                  {saveMessage.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
                  {saveMessage.text}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// Timezone options
const TIMEZONES = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'Eastern Time (US)' },
  { value: 'America/Chicago', label: 'Central Time (US)' },
  { value: 'America/Denver', label: 'Mountain Time (US)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (US)' },
  { value: 'Europe/London', label: 'London (GMT)' },
  { value: 'Europe/Paris', label: 'Paris (CET)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET)' },
  { value: 'Asia/Jerusalem', label: 'Jerusalem (IST)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
];

// Language options
const ACCOUNT_LANGUAGES = [
  { value: 'EN', label: 'English' },
  { value: 'HE', label: 'עברית (Hebrew)' },
  { value: 'FR', label: 'Français (French)' },
  { value: 'ES', label: 'Español (Spanish)' },
  { value: 'DE', label: 'Deutsch (German)' },
];

// Industry options
const INDUSTRIES = [
  { value: 'technology', labelKey: 'technology' },
  { value: 'ecommerce', labelKey: 'ecommerce' },
  { value: 'healthcare', labelKey: 'healthcare' },
  { value: 'finance', labelKey: 'finance' },
  { value: 'education', labelKey: 'education' },
  { value: 'media', labelKey: 'media' },
  { value: 'real_estate', labelKey: 'realEstate' },
  { value: 'travel', labelKey: 'travel' },
  { value: 'food', labelKey: 'food' },
  { value: 'other', labelKey: 'other' },
];

// Account Settings Component - Organization Account Settings
function AccountSettings({ translations, canEdit = true }) {
  const { t } = useLocale();
  const router = useRouter();
  const { locale } = useLocale();
  const accountSection = translations?.accountSection || {};
  
  // Account state
  const [accountId, setAccountId] = useState(null);
  const [account, setAccount] = useState({
    name: '',
    slug: '',
    logo: null,
    website: '',
    industry: '',
    timezone: 'UTC',
    defaultLanguage: 'EN',
    billingEmail: '',
    generalEmail: '',
  });
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [saveMessage, setSaveMessage] = useState({ type: '', text: '' });
  
  // Delete account state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  
  // The confirmation text required (language-specific)
  const requiredConfirmText = locale === 'he' ? 'מחיקת חשבון' : 'DELETE ACCOUNT';
  const canDelete = deleteConfirmText === requiredConfirmText;

  // Fetch current account on mount
  useEffect(() => {
    fetchCurrentAccount();
  }, []);

  const fetchCurrentAccount = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/account/current');
      if (response.ok) {
        const data = await response.json();
        if (data.account) {
          setAccountId(data.account.id);
          setAccount({
            name: data.account.name || '',
            slug: data.account.slug || '',
            logo: data.account.logo || null,
            website: data.account.website || '',
            industry: data.account.industry || '',
            timezone: data.account.timezone || 'UTC',
            defaultLanguage: data.account.defaultLanguage || 'EN',
            billingEmail: data.account.billingEmail || '',
            generalEmail: data.account.generalEmail || '',
          });
        }
      }
    } catch (error) {
      console.error('Error fetching account:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateField = (field, value) => {
    setAccount(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!accountId) return;
    
    try {
      setIsSaving(true);
      setSaveMessage({ type: '', text: '' });

      const response = await fetch(`/api/account/${accountId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: account.name,
          website: account.website,
          industry: account.industry,
          timezone: account.timezone,
          defaultLanguage: account.defaultLanguage,
          billingEmail: account.billingEmail,
          generalEmail: account.generalEmail,
        }),
      });

      if (response.ok) {
        setSaveMessage({ type: 'success', text: t('account.saveSuccess') });
      } else {
        const error = await response.json();
        setSaveMessage({ type: 'error', text: error.error || t('account.saveError') });
      }
    } catch (error) {
      setSaveMessage({ type: 'error', text: t('account.saveError') });
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveMessage({ type: '', text: '' }), 5000);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !accountId) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setSaveMessage({ type: 'error', text: t('account.invalidImageType') });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setSaveMessage({ type: 'error', text: t('account.imageTooLarge') });
      return;
    }

    try {
      setIsUploadingLogo(true);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('accountId', accountId);

      const response = await fetch('/api/account/upload-logo', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        setAccount(prev => ({ ...prev, logo: data.logoUrl }));
        setSaveMessage({ type: 'success', text: t('account.logoUpdated') });
      } else {
        const error = await response.json();
        setSaveMessage({ type: 'error', text: error.error || t('account.logoUploadError') });
      }
    } catch (error) {
      setSaveMessage({ type: 'error', text: t('account.logoUploadError') });
    } finally {
      setIsUploadingLogo(false);
      setTimeout(() => setSaveMessage({ type: '', text: '' }), 5000);
    }
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

  if (isLoading) {
    return <SettingsFormSkeleton />;
  }

  return (
    <>
      {/* Save Message */}
      {saveMessage.text && (
        <div className={`${styles.saveMessage} ${styles[saveMessage.type]}`}>
          {saveMessage.type === 'success' ? <Check size={16} /> : <AlertTriangle size={16} />}
          <span>{saveMessage.text}</span>
        </div>
      )}

      {/* Organization Logo */}
      <div className={styles.subsection}>
        <h3 className={styles.subsectionTitle}>
          <Building2 className={styles.subsectionIcon} />
          {t('account.logo.title')}
        </h3>
        <div className={styles.logoSection}>
          <div className={styles.logoPreview}>
            {account.logo ? (
              <img
                src={account.logo}
                alt={account.name || 'Organization logo'}
                className={styles.logoImage}
              />
            ) : (
              <div className={styles.logoPlaceholder}>
                <Building2 size={32} />
              </div>
            )}
          </div>
          <div className={styles.logoActions}>
            <label className={styles.editButton}>
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                disabled={isUploadingLogo || !canEdit}
                style={{ display: 'none' }}
              />
              {isUploadingLogo ? (
                <>
                  <Loader2 size={14} className={styles.spinningIcon} />
                  {t('common.loading')}
                </>
              ) : (
                t('account.logo.change')
              )}
            </label>
            <p className={styles.logoHint}>{t('account.logo.hint')}</p>
          </div>
        </div>
      </div>

      {/* General Information */}
      <div className={styles.subsection}>
        <h3 className={styles.subsectionTitle}>
          <Settings className={styles.subsectionIcon} />
          {t('account.general.title')}
        </h3>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>{t('account.fields.name')}</label>
            <input 
              type="text" 
              className={styles.formInput}
              value={account.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder={t('account.fields.namePlaceholder')}
              disabled={!canEdit}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>{t('account.fields.slug')}</label>
            <input 
              type="text" 
              className={`${styles.formInput} ${styles.disabled}`}
              value={account.slug}
              disabled
            />
            <span className={styles.inputHint}>{t('account.fields.slugHint')}</span>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>{t('account.fields.website')}</label>
            <input 
              type="url" 
              className={styles.formInput}
              value={account.website}
              onChange={(e) => updateField('website', e.target.value)}
              placeholder="https://example.com"
              disabled={!canEdit}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>{t('account.fields.industry')}</label>
            <select 
              className={styles.formSelect}
              value={account.industry}
              onChange={(e) => updateField('industry', e.target.value)}
              disabled={!canEdit}
            >
              <option value="">{t('account.fields.selectIndustry')}</option>
              {INDUSTRIES.map(ind => (
                <option key={ind.value} value={ind.value}>
                  {t(`account.industries.${ind.labelKey}`)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Contact Emails */}
      <div className={styles.subsection}>
        <h3 className={styles.subsectionTitle}>
          <Send className={styles.subsectionIcon} />
          {t('account.emails.title')}
        </h3>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>{t('account.fields.generalEmail')}</label>
            <input 
              type="email" 
              className={styles.formInput}
              value={account.generalEmail}
              onChange={(e) => updateField('generalEmail', e.target.value)}
              placeholder="contact@company.com"
              disabled={!canEdit}
            />
            <span className={styles.inputHint}>{t('account.fields.generalEmailHint')}</span>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>{t('account.fields.billingEmail')}</label>
            <input 
              type="email" 
              className={styles.formInput}
              value={account.billingEmail}
              onChange={(e) => updateField('billingEmail', e.target.value)}
              placeholder="billing@company.com"
              disabled={!canEdit}
            />
            <span className={styles.inputHint}>{t('account.fields.billingEmailHint')}</span>
          </div>
        </div>
      </div>

      {/* Regional Settings */}
      <div className={styles.subsection}>
        <h3 className={styles.subsectionTitle}>
          <Globe className={styles.subsectionIcon} />
          {t('account.regional.title')}
        </h3>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>{t('account.fields.timezone')}</label>
            <select 
              className={styles.formSelect}
              value={account.timezone}
              onChange={(e) => updateField('timezone', e.target.value)}
              disabled={!canEdit}
            >
              {TIMEZONES.map(tz => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>{t('account.fields.defaultLanguage')}</label>
            <select 
              className={styles.formSelect}
              value={account.defaultLanguage}
              onChange={(e) => updateField('defaultLanguage', e.target.value)}
              disabled={!canEdit}
            >
              {ACCOUNT_LANGUAGES.map(lang => (
                <option key={lang.value} value={lang.value}>{lang.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className={styles.subsection}>
        <h3 className={styles.subsectionTitle}>
          <AlertTriangle className={styles.subsectionIcon} />
          {accountSection.dangerZone || t('account.dangerZone')}
        </h3>
        <div className={styles.warningBox}>
          <div className={styles.warningContent}>
            <AlertTriangle className={styles.warningIcon} />
            <div className={styles.warningInfo}>
              <span className={styles.warningLabel}>{accountSection.deleteAccount || t('account.deleteAccount')}</span>
              <span className={styles.warningDescription}>{accountSection.deleteAccountDesc || t('account.deleteAccountDesc')}</span>
            </div>
          </div>
          <button 
            className={styles.editButton}
            style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}
            onClick={() => setShowDeleteModal(true)}
          >
            {accountSection.deleteAccount || t('account.deleteAccount')}
          </button>
        </div>
      </div>

      <div className={styles.saveButtonWrapper}>
        <button 
          className={styles.saveButton} 
          onClick={handleSave}
          disabled={isSaving || !canEdit}
        >
          {isSaving ? (
            <>
              <Loader2 size={16} className={styles.spinningIcon} />
              {t('common.saving')}
            </>
          ) : (
            t('common.saveChanges')
          )}
        </button>
      </div>
      
      {/* Delete Account Modal */}
      {showDeleteModal && createPortal(
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
        </div>,
        document.body
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
    return <TableSkeleton rows={3} columns={3} hasActions />;
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
      {modalOpen && createPortal(
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
        </div>,
        document.body
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && createPortal(
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
        </div>,
        document.body
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
    return <FormSkeleton fields={4} columns={1} />;
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
