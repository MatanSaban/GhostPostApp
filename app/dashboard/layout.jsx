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
  Building2,
  Users,
  CreditCard,
  FileStack,
  Languages,
  Bot,
  Zap,
  Database,
  ChevronRight,
  Lock,
  Wrench,
  Lightbulb,
  Globe,
} from 'lucide-react';
import { GhostChatPopup } from '@/app/components/ui/ghost-chat-popup';
import { SiteSelector } from '@/app/components/ui/site-selector';
import { DashboardHeader } from '@/app/dashboard/components/DashboardHeader';
import { useLocale } from '@/app/context/locale-context';
import { useUser } from '@/app/context/user-context';
import { useSite } from '@/app/context/site-context';
import { usePermissions } from '@/app/hooks/usePermissions';
import styles from './dashboard.module.css';

// Menu items with translation keys (entities added above settings)
const menuItemsConfig = [
  { icon: LayoutDashboard, labelKey: 'nav.dashboard', path: '/dashboard' },
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
  { labelKey: 'nav.strategy.contentPlanner', path: '/dashboard/strategy/content-planner' },
  { labelKey: 'nav.strategy.aiWizard', path: '/dashboard/strategy/ai-content-wizard' },
  { labelKey: 'nav.strategy.competitorAnalysis', path: '/dashboard/strategy/competitor-analysis' },
];

// Tools sub-items (Technical SEO)
const toolsItemsConfig = [
  { labelKey: 'nav.tools.redirections', path: '/dashboard/technical-seo/redirections' },
  { labelKey: 'nav.tools.webpConverter', path: '/dashboard/technical-seo/webp-converter' },
  { labelKey: 'nav.tools.siteAudit', path: '/dashboard/technical-seo/site-audit' },
];

// Admin menu items - only visible to super admins
const adminMenuItemsConfig = [
  { icon: Building2, labelKey: 'nav.admin.accounts', path: '/dashboard/admin/accounts' },
  { icon: Users, labelKey: 'nav.admin.users', path: '/dashboard/admin/users' },
  { icon: CreditCard, labelKey: 'nav.admin.subscriptions', path: '/dashboard/admin/subscriptions' },
  { icon: FileStack, labelKey: 'nav.admin.plans', path: '/dashboard/admin/plans' },
  { icon: Bot, labelKey: 'nav.admin.interviewFlow', path: '/dashboard/admin/interview-flow' },
  { icon: Zap, labelKey: 'nav.admin.botActions', path: '/dashboard/admin/bot-actions' },
  { icon: Languages, labelKey: 'nav.admin.translations', path: '/dashboard/admin/translations' },
  { icon: Globe, labelKey: 'nav.admin.website', path: '/dashboard/admin/website' },
];

export default function DashboardLayout({ children, title = 'Dashboard', breadcrumb = 'Dashboard' }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t, isRtl } = useLocale();
  const { isSuperAdmin, isLoading: isUserLoading, clearUser } = useUser();
  const { selectedSite } = useSite();
  const { filterMenuItems, canViewPath, isLoading: isPermissionsLoading } = usePermissions();
  const [isChatOpen, setIsChatOpen] = useState(false);
  // Single state for open menu - only one can be open at a time (accordion behavior)
  const [openMenu, setOpenMenu] = useState(null); // 'strategy' | 'entities' | 'tools' | 'admin' | null
  const [entityTypes, setEntityTypes] = useState([]);
  const chatPopupRef = useRef(null);

  // Filter menu items based on permissions
  const filteredMenuItems = useMemo(() => {
    if (isPermissionsLoading) {
      return menuItemsConfig; // Show all while loading to prevent flicker
    }
    return filterMenuItems(menuItemsConfig);
  }, [filterMenuItems, isPermissionsLoading]);

  // Check if current path is accessible, redirect if not
  useEffect(() => {
    if (!isPermissionsLoading && !isUserLoading && pathname !== '/dashboard') {
      // Don't check admin pages (they have their own superAdmin check)
      if (!pathname.startsWith('/dashboard/admin') && !canViewPath(pathname)) {
        router.push('/dashboard');
      }
    }
  }, [pathname, canViewPath, isPermissionsLoading, isUserLoading, router]);

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

  // Fetch enabled entity types for the selected site
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
  }, [selectedSite?.id]);

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

  const handleAdminChevronClick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setOpenMenu(openMenu === 'admin' ? null : 'admin');
  };

  return (
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
            
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`${styles.navItem} ${isActive ? styles.active : ''}`}
              >
                <Icon className={styles.navIcon} />
                <span className={styles.navLabel}>{t(item.labelKey)}</span>
              </Link>
            );
          })}

          {/* Strategy Section - Expandable sub-items */}
          <div className={styles.navGroup}>
            <Link 
              href="/dashboard/strategy"
              className={`${styles.navItem} ${styles.navGroupToggle} ${pathname.startsWith('/dashboard/strategy') ? styles.active : ''}`}
            >
              <Lightbulb className={styles.navIcon} />
              <span className={styles.navLabel}>{t('nav.strategy.title')}</span>
              <button 
                className={styles.navChevronButton}
                onClick={handleStrategyChevronClick}
                aria-label={openMenu === 'strategy' ? t('common.collapse') : t('common.expand')}
              >
                <ChevronRight className={`${styles.navChevron} ${openMenu === 'strategy' ? styles.navChevronOpen : ''}`} />
              </button>
            </Link>
            <div className={`${styles.navGroupItems} ${openMenu === 'strategy' ? styles.navGroupItemsOpen : ''}`}>
              <div className={styles.navGroupItemsInner}>
                {strategyItemsConfig.map((item) => {
                  const isActive = pathname === item.path || pathname.startsWith(item.path + '/');
                  
                  return (
                    <Link
                      key={item.path}
                      href={item.path}
                      className={`${styles.navItem} ${styles.navSubItem} ${isActive ? styles.active : ''}`}
                    >
                      <span className={styles.navLabel}>{t(item.labelKey)}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Entities Section - Dynamic with expandable sub-items */}
          {canViewPath('/dashboard/entities') && (
          <div className={styles.navGroup}>
            <Link 
              href="/dashboard/entities"
              className={`${styles.navItem} ${styles.navGroupToggle} ${pathname.startsWith('/dashboard/entities') ? styles.active : ''}`}
            >
              <Database className={styles.navIcon} />
              <span className={styles.navLabel}>{t('nav.entities.title')}</span>
              {entityTypes.length > 0 && (
                <button 
                  className={styles.navChevronButton}
                  onClick={handleChevronClick}
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
                        <span className={styles.navLabel}>{entityType.name}</span>
                      </Link>
                    );
                  })}
                  {/* Media link */}
                  <Link
                    href="/dashboard/entities/media"
                    className={`${styles.navItem} ${styles.navSubItem} ${pathname === '/dashboard/entities/media' ? styles.active : ''}`}
                  >
                    <span className={styles.navLabel}>{t('nav.entities.media')}</span>
                  </Link>
                </div>
              </div>
            )}
          </div>
          )}

          {/* Tools Section (Technical SEO) - Expandable sub-items */}
          <div className={styles.navGroup}>
            <Link 
              href="/dashboard/technical-seo"
              className={`${styles.navItem} ${styles.navGroupToggle} ${pathname.startsWith('/dashboard/technical-seo') ? styles.active : ''}`}
            >
              <Wrench className={styles.navIcon} />
              <span className={styles.navLabel}>{t('nav.tools.title')}</span>
              <button 
                className={styles.navChevronButton}
                onClick={handleToolsChevronClick}
                aria-label={openMenu === 'tools' ? t('common.collapse') : t('common.expand')}
              >
                <ChevronRight className={`${styles.navChevron} ${openMenu === 'tools' ? styles.navChevronOpen : ''}`} />
              </button>
            </Link>
            <div className={`${styles.navGroupItems} ${openMenu === 'tools' ? styles.navGroupItemsOpen : ''}`}>
              <div className={styles.navGroupItemsInner}>
                {toolsItemsConfig.map((item) => {
                  const isActive = pathname === item.path || pathname.startsWith(item.path + '/');
                  
                  return (
                    <Link
                      key={item.path}
                      href={item.path}
                      className={`${styles.navItem} ${styles.navSubItem} ${isActive ? styles.active : ''}`}
                    >
                      <span className={styles.navLabel}>{t(item.labelKey)}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Settings - Below Tools */}
          <Link
            href="/dashboard/settings"
            className={`${styles.navItem} ${pathname === '/dashboard/settings' ? styles.active : ''}`}
          >
            <Settings className={styles.navIcon} />
            <span className={styles.navLabel}>{t('nav.settings')}</span>
          </Link>

          {/* Admin Section - Only visible to super admins */}
          {!isUserLoading && isSuperAdmin && (
            <div className={styles.navGroup}>
              <button 
                className={`${styles.navItem} ${styles.navGroupToggle} ${styles.adminNavItem} ${pathname.startsWith('/dashboard/admin') ? styles.active : ''}`}
                onClick={handleAdminChevronClick}
              >
                <Shield className={styles.navIcon} />
                <span className={styles.navLabel}>{t('nav.admin.title')}</span>
                <ChevronRight className={`${styles.navChevron} ${openMenu === 'admin' ? styles.navChevronOpen : ''}`} />
              </button>
              <div className={`${styles.navGroupItems} ${openMenu === 'admin' ? styles.navGroupItemsOpen : ''}`}>
                <div className={styles.navGroupItemsInner}>
                  {adminMenuItemsConfig.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.path || pathname.startsWith(item.path + '/');
                    
                    return (
                      <Link
                        key={item.path}
                        href={item.path}
                        className={`${styles.navItem} ${styles.navSubItem} ${styles.adminNavItem} ${isActive ? styles.active : ''}`}
                      >
                        <Icon className={styles.navIcon} />
                        <span className={styles.navLabel}>{t(item.labelKey)}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
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
          {children}
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
    </div>
  );
}
