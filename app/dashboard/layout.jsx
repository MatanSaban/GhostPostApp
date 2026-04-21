'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  User,
  Calendar,
  RotateCcw,
  Search,
  Settings,
  LogOut,
  X,
  Shield,
  Bot,
  Zap,
  Database,
  ChevronRight,
  Wrench,
  Lightbulb,
  Monitor,
  Bell,
  Link2,
  LifeBuoy,
} from 'lucide-react';
import { GhostChatPopup } from '@/app/components/ui/ghost-chat-popup';
import { SiteSelector } from '@/app/components/ui/site-selector';
import { DashboardHeader } from '@/app/dashboard/components/DashboardHeader';
import ContentPipelineWorker from '@/app/dashboard/components/ContentPipelineWorker';
import { OnboardingProvider } from '@/app/dashboard/onboarding/OnboardingProvider';
import { OnboardingController } from '@/app/dashboard/onboarding/OnboardingController';
import { FeatureGuideRunner } from '@/app/dashboard/onboarding/FeatureGuideRunner';
import { useLocale } from '@/app/context/locale-context';
import { useUser } from '@/app/context/user-context';
import { useSite } from '@/app/context/site-context';
import { usePermissions } from '@/app/hooks/usePermissions';
import styles from './dashboard.module.css';

// Menu items with translation keys (entities added above settings)
const menuItemsConfig = [
  { icon: LayoutDashboard, labelKey: 'nav.dashboard', path: '/dashboard' },
  { icon: Bot, labelKey: 'nav.agent', path: '/dashboard/agent' },
  // { icon: Zap, labelKey: 'nav.automations', path: '/dashboard/automations' },
  // { icon: Link2, labelKey: 'nav.linkBuilding', path: '/dashboard/link-building' },
  // { icon: Monitor, labelKey: 'nav.seoFrontend', path: '/dashboard/seo-frontend' },
  // { icon: Server, labelKey: 'nav.seoBackend', path: '/dashboard/seo-backend' },
  // { icon: Activity, labelKey: 'nav.siteAudit', path: '/dashboard/site-audit' },
];

// Strategy sub-items
const strategyItemsConfig = [
  { labelKey: 'nav.strategy.siteProfile', path: '/dashboard/strategy/site-profile' },
  { labelKey: 'nav.strategy.keywords', path: '/dashboard/strategy/keywords' },
  { labelKey: 'nav.strategy.competitorAnalysis', path: '/dashboard/strategy/competitors' },
  { labelKey: 'nav.strategy.contentPlanner', path: '/dashboard/strategy/content-planner' },
  { labelKey: 'nav.strategy.aiWizard', path: '/dashboard/strategy/ai-content-wizard' },
];

// Tools sub-items (Technical SEO)
const toolsItemsConfig = [
  { labelKey: 'nav.tools.redirections', path: '/dashboard/technical-seo/redirections' },
  { labelKey: 'nav.tools.webpConverter', path: '/dashboard/technical-seo/webp-converter' },
  { labelKey: 'nav.tools.siteAudit', path: '/dashboard/technical-seo/site-audit' },
];


export default function DashboardLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t, isRtl, locale } = useLocale();
  const { user, isSuperAdmin, isLoading: isUserLoading, clearUser } = useUser();
  const { selectedSite } = useSite();
  const { filterMenuItems, canViewPath, canAccessAnySettingsTab, isLoading: isPermissionsLoading } = usePermissions();
  const [isChatOpen, setIsChatOpen] = useState(false);
  // Single state for open menu - only one can be open at a time (accordion behavior)
  const [openMenu, setOpenMenu] = useState(null); // 'strategy' | 'entities' | 'tools' | null
  const [transitionKey, setTransitionKey] = useState(0);
  const [isPageVisible, setIsPageVisible] = useState(true);
  const [entityTypes, setEntityTypes] = useState([]);
  const chatPopupRef = useRef(null);

  // Filter menu items based on permissions - MUST be before any early returns
  const filteredMenuItems = useMemo(() => {
    if (isPermissionsLoading) {
      return []; // Don't show menu items until permissions are loaded
    }
    return filterMenuItems(menuItemsConfig);
  }, [filterMenuItems, isPermissionsLoading]);

  // Filter strategy items based on permissions
  const filteredStrategyItems = useMemo(() => {
    if (isPermissionsLoading) {
      return [];
    }
    return filterMenuItems(strategyItemsConfig);
  }, [filterMenuItems, isPermissionsLoading]);

  // Filter tools items based on permissions
  const filteredToolsItems = useMemo(() => {
    if (isPermissionsLoading) {
      return [];
    }
    return filterMenuItems(toolsItemsConfig);
  }, [filterMenuItems, isPermissionsLoading]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isUserLoading && !user) {
      console.log('No user found in dashboard layout, redirecting to login');
      router.push('/auth/login');
    }
  }, [user, isUserLoading, router]);

  // Archive redirect: if the user has archived-owned accounts still in the
  // restore window AND no currently active account, force them to the restore
  // page. Allow them to stay on /dashboard/restore-account either way.
  useEffect(() => {
    if (isUserLoading || !user) return;
    if (pathname === '/dashboard/restore-account') return;
    const hasArchived = (user.archivedOwnedAccounts || []).length > 0;
    const hasCurrentAccount = !!user.accountId;
    if (hasArchived && !hasCurrentAccount) {
      router.push('/dashboard/restore-account');
    }
  }, [user, isUserLoading, pathname, router]);

  // Check if current path is accessible, redirect if not - MUST be before any early returns
  useEffect(() => {
    if (!isPermissionsLoading && !isUserLoading && pathname !== '/dashboard') {
      // Don't check admin pages (they have their own superAdmin check)
      if (!pathname.startsWith('/dashboard/admin') && !canViewPath(pathname)) {
        router.push('/dashboard');
      }
    }
  }, [pathname, canViewPath, isPermissionsLoading, isUserLoading, router]);

  // Page transition effect on route change
  useEffect(() => {
    setTransitionKey(prev => prev + 1);
    setIsPageVisible(false);
    const timer = setTimeout(() => {
      setIsPageVisible(true);
    }, 50);
    return () => clearTimeout(timer);
  }, [pathname]);

  // Allow any descendant component to open the chat popup with a prefilled
  // message via `window.dispatchEvent(new CustomEvent('gp:open-chat', { detail: { prefill } }))`.
  // MUST be before any early returns so React sees the same hook count every render.
  useEffect(() => {
    const onOpenChat = (e) => {
      const prefill = e?.detail?.prefill;
      setIsChatOpen(true);
      if (prefill) {
        // Wait two animation frames so the popup mounts before we set the input value.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            chatPopupRef.current?.prefill?.(prefill);
          });
        });
      }
    };
    window.addEventListener('gp:open-chat', onOpenChat);
    return () => window.removeEventListener('gp:open-chat', onOpenChat);
  }, []);

  // Fetch enabled entity types for the selected site - MUST be before any early returns
  useEffect(() => {
    async function fetchEntityTypes() {
      if (!selectedSite?.id) {
        setEntityTypes([]);
        return;
      }

      try {
        const response = await fetch(`/api/entities/types?siteId=${selectedSite.id}`);
        if (response.ok) {
          const data = await response.json();
          setEntityTypes(data.types || []);
        }
      } catch (error) {
        console.error('Failed to fetch entity types:', error);
        setEntityTypes([]);
      }
    }

    fetchEntityTypes();

    // Re-fetch when an entity type label is updated (from [type] page inline edit)
    const handleLabelUpdate = () => fetchEntityTypes();
    window.addEventListener('entityTypeLabelUpdated', handleLabelUpdate);
    return () => window.removeEventListener('entityTypeLabelUpdated', handleLabelUpdate);
  }, [selectedSite?.id]);

  // Show loading state while checking authentication
  // Only block if we have NO user at all (not even from localStorage)
  if (isUserLoading && !user) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: 'var(--background)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '3px solid var(--border)',
            borderTopColor: 'var(--primary)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto'
          }}></div>
        </div>
      </div>
    );
  }

  // Don't render dashboard if no user
  if (!user) {
    return null;
  }

  // Logout handler
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      clearUser();
      router.push('/auth/login');
    } catch (error) {
      console.error('Logout error:', error);
      // Still try to redirect on error
      clearUser();
      router.push('/auth/login');
    }
  };

  const handleFloatingButtonClick = () => {
    if (isChatOpen) {
      // Close with animation
      chatPopupRef.current?.close();
    } else {
      setIsChatOpen(true);
    }
  };

  // Only toggle submenu when clicking the chevron, navigate when clicking elsewhere
  const handleEntitiesClick = (e) => {
    // Navigate to entities page
    window.location.href = '/dashboard/entities';
  };

  const handleChevronClick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setOpenMenu(openMenu === 'entities' ? null : 'entities');
  };

  const handleStrategyChevronClick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setOpenMenu(openMenu === 'strategy' ? null : 'strategy');
  };

  const handleToolsChevronClick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setOpenMenu(openMenu === 'tools' ? null : 'tools');
  };

  return (
    <OnboardingProvider>
    <div className={styles.dashboardContainer}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        {/* Logo */}
        <div className={styles.sidebarLogo}>
          <img
            src="/ghostpost_logo.png"
            alt={t('brand.name')}
            className={styles.logoIcon}
          />
          <span className={styles.logoText}>{t('brand.name')}</span>
        </div>

        {/* Site Selector */}
        <SiteSelector />

        {/* Navigation */}
        <nav className={styles.navigation}>
          {filteredMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.path;
            const navSlug = item.path.split('/').pop();

            return (
              <Link
                key={item.path}
                href={item.path}
                className={`${styles.navItem} ${isActive ? styles.active : ''}`}
                data-onboarding={`nav-${navSlug}`}
              >
                <Icon className={styles.navIcon} />
                <span className={styles.navLabel}>{t(item.labelKey)}</span>
              </Link>
            );
          })}

          {/* Strategy Section - Expandable sub-items (only show if user has access to at least one item) */}
          {filteredStrategyItems.length > 0 && (
            <div
              className={styles.navGroup}
              data-nav-group="strategy"
              data-nav-group-open={openMenu === 'strategy' ? 'true' : 'false'}
            >
              <Link
                href="/dashboard/strategy"
                className={`${styles.navItem} ${styles.navGroupToggle} ${pathname.startsWith('/dashboard/strategy') ? styles.active : ''}`}
                data-onboarding="nav-strategy"
              >
                <Lightbulb className={styles.navIcon} />
                <span className={styles.navLabel}>{t('nav.strategy.title')}</span>
                <button
                  className={styles.navChevronButton}
                  onClick={handleStrategyChevronClick}
                  data-nav-group-chevron="strategy"
                  aria-label={openMenu === 'strategy' ? t('common.collapse') : t('common.expand')}
                >
                  <ChevronRight className={`${styles.navChevron} ${openMenu === 'strategy' ? styles.navChevronOpen : ''}`} />
                </button>
              </Link>
              <div className={`${styles.navGroupItems} ${openMenu === 'strategy' ? styles.navGroupItemsOpen : ''}`}>
                <div className={styles.navGroupItemsInner}>
                  {filteredStrategyItems.map((item) => {
                    const isActive = pathname === item.path || pathname.startsWith(item.path + '/');
                    const subSlug = item.path.split('/').pop();

                    return (
                      <Link
                        key={item.path}
                        href={item.path}
                        className={`${styles.navItem} ${styles.navSubItem} ${isActive ? styles.active : ''}`}
                        data-onboarding={`nav-${subSlug}`}
                      >
                        <span className={styles.navLabel}>{t(item.labelKey)}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Entities Section - Dynamic with expandable sub-items */}
          {canViewPath('/dashboard/entities') && (
            <div
              className={styles.navGroup}
              data-nav-group="entities"
              data-nav-group-open={openMenu === 'entities' ? 'true' : 'false'}
            >
              <Link
                href="/dashboard/entities"
                className={`${styles.navItem} ${styles.navGroupToggle} ${pathname.startsWith('/dashboard/entities') ? styles.active : ''}`}
                data-onboarding="nav-entities"
              >
                <Database className={styles.navIcon} />
                <span className={styles.navLabel}>{t('nav.entities.title')}</span>
                {entityTypes.length > 0 && (
                  <button
                    className={styles.navChevronButton}
                    onClick={handleChevronClick}
                    data-nav-group-chevron="entities"
                    aria-label={openMenu === 'entities' ? t('common.collapse') : t('common.expand')}
                  >
                    <ChevronRight className={`${styles.navChevron} ${openMenu === 'entities' ? styles.navChevronOpen : ''}`} />
                  </button>
                )}
              </Link>
              {entityTypes.length > 0 && (
                <div className={`${styles.navGroupItems} ${openMenu === 'entities' ? styles.navGroupItemsOpen : ''}`}>
                  <div className={styles.navGroupItemsInner}>
                    {entityTypes.map((entityType) => {
                      const isActive = pathname === `/dashboard/entities/${entityType.slug}` ||
                        pathname.startsWith(`/dashboard/entities/${entityType.slug}/`);

                      return (
                        <Link
                          key={entityType.id}
                          href={`/dashboard/entities/${entityType.slug}`}
                          className={`${styles.navItem} ${styles.navSubItem} ${isActive ? styles.active : ''}`}
                        >
                          <span className={styles.navLabel}>{entityType.labels?.[locale] || entityType.name}</span>
                        </Link>
                      );
                    })}
                    {/* Media link - only show for connected WordPress sites */}
                    {selectedSite?.platform === 'wordpress' && selectedSite?.connectionStatus === 'CONNECTED' && (
                      <Link
                        href="/dashboard/entities/media"
                        className={`${styles.navItem} ${styles.navSubItem} ${pathname === '/dashboard/entities/media' ? styles.active : ''}`}
                      >
                        <span className={styles.navLabel}>{t('nav.entities.media')}</span>
                      </Link>
                    )}
                    {/* Sitemaps link */}
                    <Link
                      href="/dashboard/entities/sitemaps"
                      className={`${styles.navItem} ${styles.navSubItem} ${pathname.startsWith('/dashboard/entities/sitemaps') ? styles.active : ''}`}
                    >
                      <span className={styles.navLabel}>{t('nav.entities.sitemaps')}</span>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tools Section (Technical SEO) - Expandable sub-items (only show if user has access to at least one item) */}
          {filteredToolsItems.length > 0 && (
            <div
              className={styles.navGroup}
              data-nav-group="tools"
              data-nav-group-open={openMenu === 'tools' ? 'true' : 'false'}
            >
              <Link
                href="/dashboard/technical-seo"
                className={`${styles.navItem} ${styles.navGroupToggle} ${pathname.startsWith('/dashboard/technical-seo') ? styles.active : ''}`}
                data-onboarding="nav-technical-seo"
              >
                <Wrench className={styles.navIcon} />
                <span className={styles.navLabel}>{t('nav.tools.title')}</span>
                <button
                  className={styles.navChevronButton}
                  onClick={handleToolsChevronClick}
                  data-nav-group-chevron="tools"
                  aria-label={openMenu === 'tools' ? t('common.collapse') : t('common.expand')}
                >
                  <ChevronRight className={`${styles.navChevron} ${openMenu === 'tools' ? styles.navChevronOpen : ''}`} />
                </button>
              </Link>
              <div className={`${styles.navGroupItems} ${openMenu === 'tools' ? styles.navGroupItemsOpen : ''}`}>
                <div className={styles.navGroupItemsInner}>
                  {filteredToolsItems.map((item) => {
                    const isActive = pathname === item.path || pathname.startsWith(item.path + '/');
                    const subSlug = item.path.split('/').pop();

                    return (
                      <Link
                        key={item.path}
                        href={item.path}
                        className={`${styles.navItem} ${styles.navSubItem} ${isActive ? styles.active : ''}`}
                        data-onboarding={`nav-${subSlug}`}
                      >
                        <span className={styles.navLabel}>{t(item.labelKey)}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* My Websites - Visible to users with SITES_VIEW permission */}
          {!isPermissionsLoading && canViewPath('/dashboard/my-websites') && (
            <Link
              href="/dashboard/my-websites"
              className={`${styles.navItem} ${pathname === '/dashboard/my-websites' ? styles.active : ''}`}
              data-onboarding="nav-my-websites"
            >
              <Monitor className={styles.navIcon} />
              <span className={styles.navLabel}>{t('nav.myWebsites')}</span>
            </Link>
          )}

          {/* Backlinks Marketplace */}
          {!isPermissionsLoading && canViewPath('/dashboard/backlinks') && (
            <Link
              href="/dashboard/backlinks"
              className={`${styles.navItem} ${pathname === '/dashboard/backlinks' || pathname.startsWith('/dashboard/backlinks/') ? styles.active : ''}`}
            >
              <Link2 className={styles.navIcon} />
              <span className={styles.navLabel}>{t('nav.backlinks')}</span>
            </Link>
          )}

          {/* Notification Center */}
          {!isPermissionsLoading && (
            <Link
              href="/dashboard/notifications"
              className={`${styles.navItem} ${pathname === '/dashboard/notifications' ? styles.active : ''}`}
              data-onboarding="nav-notifications"
            >
              <Bell className={styles.navIcon} />
              <span className={styles.navLabel}>{t('notificationCenter.navTitle')}</span>
            </Link>
          )}

          {/* Support tickets - open to every member; API enforces permissions */}
          {!isPermissionsLoading && (
            <Link
              href="/dashboard/support"
              className={`${styles.navItem} ${pathname.startsWith('/dashboard/support') ? styles.active : ''}`}
              data-onboarding="nav-support"
            >
              <LifeBuoy className={styles.navIcon} />
              <span className={styles.navLabel}>{t('nav.support')}</span>
            </Link>
          )}

          {/* Settings - Below My Websites */}
          {!isPermissionsLoading && canAccessAnySettingsTab() && (
            <Link
              href="/dashboard/settings"
              className={`${styles.navItem} ${pathname === '/dashboard/settings' ? styles.active : ''}`}
              data-onboarding="nav-settings"
            >
              <Settings className={styles.navIcon} />
              <span className={styles.navLabel}>{t('nav.settings')}</span>
            </Link>
          )}

          {/* Admin Panel - toggle button in DashboardHeader navigates to /admin */}
          {!isUserLoading && isSuperAdmin && (
            <Link
              href="/admin"
              className={`${styles.navItem} ${styles.adminNavItem}`}
            >
              <Shield className={styles.navIcon} />
              <span className={styles.navLabel}>{t('nav.admin.title')}</span>
            </Link>
          )}
        </nav>

        {/* Logout */}
        <div className={styles.logoutSection}>
          <button onClick={handleLogout} className={styles.logoutButton}>
            <LogOut className={styles.navIcon} />
            <span>{t('auth.logout')}</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={styles.mainContent}>
        {/* Header */}
        <DashboardHeader />

        {/* Content */}
        <div className={styles.contentArea}>
          <div key={transitionKey} className={`${styles.pageContainer} ${isPageVisible ? styles.pageIn : ''}`}>
            {children}
          </div>
        </div>
      </main>

      {/* Floating Chat Button */}
      <button
        className={`${styles.floatingChatButton} ${isChatOpen ? styles.floatingChatButtonOpen : ''}`}
        onClick={handleFloatingButtonClick}
      >
        <div className={styles.chatButtonGlow}></div>
        {isChatOpen ? (
          <X size={24} className={styles.chatButtonClose} />
        ) : (
          <img
            src="/ghostpost_logo.png"
            alt={t('chat.openChat')}
            className={styles.chatButtonLogo}
          />
        )}
        {!isChatOpen && <span className={styles.chatButtonBadge}></span>}
      </button>

      {/* Chat Popup */}
      <GhostChatPopup ref={chatPopupRef} isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />

      {/* Background content pipeline worker (handles cron jobs in dev mode) */}
      <ContentPipelineWorker />

      {/* Onboarding UI (greeting modal, guided tour, blocking banner) */}
      <OnboardingController />

      {/* On-demand feature-guide runner (launched from GuidesCenter) */}
      <FeatureGuideRunner />
    </div>
    </OnboardingProvider>
  );
}
