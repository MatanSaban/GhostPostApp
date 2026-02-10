'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bell,
  LogOut,
  X,
  CheckCheck,
  FileText,
  AlertCircle,
  Sparkles,
  TrendingUp,
  CreditCard,
  Coins,
  Plus,
  Crown,
  UserCircle,
} from 'lucide-react';
import { ThemeToggle } from '@/app/components/ui/theme-toggle';
import { LanguageSwitcher } from '@/app/components/ui/language-switcher';
import { useLocale } from '@/app/context/locale-context';
import { useUser } from '@/app/context/user-context';
import { useSite } from '@/app/context/site-context';
import { usePermissions } from '@/app/hooks/usePermissions';
import styles from './DashboardHeader.module.css';

/**
 * Get user initials from name or email
 */
function getUserInitials(firstName, lastName, email) {
  if (firstName && lastName) {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  }
  if (firstName) {
    return firstName.substring(0, 2).toUpperCase();
  }
  if (email) {
    return email.substring(0, 2).toUpperCase();
  }
  return '??';
}

/**
 * Get display name from user data
 */
function getUserDisplayName(firstName, lastName, email) {
  if (firstName && lastName) {
    return `${firstName} ${lastName}`;
  }
  if (firstName) {
    return firstName;
  }
  return email || 'User';
}

// Sample notifications data
const defaultNotifications = [
  {
    id: 1,
    type: 'content',
    icon: FileText,
    titleKey: 'notifications.items.newBlogPost.title',
    messageKey: 'notifications.items.newBlogPost.message',
    timeKey: 'notifications.time.fiveMinAgo',
    read: false,
    link: '/dashboard/content-planner',
  },
  {
    id: 2,
    type: 'ai',
    icon: Sparkles,
    titleKey: 'notifications.items.aiInsight.title',
    messageKey: 'notifications.items.aiInsight.message',
    timeKey: 'notifications.time.oneHourAgo',
    read: false,
    link: '/dashboard/strategy/keywords',
  },
  {
    id: 3,
    type: 'alert',
    icon: AlertCircle,
    titleKey: 'notifications.items.interviewIncomplete.title',
    messageKey: 'notifications.items.interviewIncomplete.message',
    timeKey: 'notifications.time.twoHoursAgo',
    read: false,
    link: '/dashboard/site-interview',
  },
  {
    id: 4,
    type: 'success',
    icon: TrendingUp,
    titleKey: 'notifications.items.trafficMilestone.title',
    messageKey: 'notifications.items.trafficMilestone.message',
    timeKey: 'notifications.time.oneDayAgo',
    read: true,
    link: '/dashboard',
  },
];

// Mapping of path segments to translation keys
const segmentTranslationKeys = {
  'site-interview': 'nav.siteInterview',
  'site-profile': 'nav.strategy.siteProfile',
  'content-planner': 'nav.strategy.contentPlanner',
  'ai-content-wizard': 'nav.strategy.aiWizard',
  'automations': 'nav.automations',
  'link-building': 'nav.linkBuilding',
  'redirections': 'nav.tools.redirections',
  'seo-frontend': 'nav.seoFrontend',
  'seo-backend': 'nav.seoBackend',
  'site-audit': 'nav.tools.siteAudit',
  'keywords': 'nav.strategy.keywords',
  'keyword-strategy': 'nav.strategy.keywords',
  'settings': 'nav.settings',
  'strategy': 'nav.strategy.title',
  'technical-seo': 'nav.tools.title',
  'competitors': 'nav.strategy.competitorAnalysis',
  'webp-converter': 'nav.tools.webpConverter',
  // User pages
  'profile': 'user.myProfile',
  // Entities pages
  'entities': 'nav.entities.title',
  'media': 'nav.entities.media',
  'pages': 'nav.entities.pages',
  'posts': 'nav.entities.posts',
  'projects': 'nav.entities.projects',
  'services': 'nav.entities.services',
  'products': 'nav.entities.products',
  // Admin pages
  'admin': 'nav.admin.title',
  'users': 'nav.admin.users',
  'accounts': 'nav.admin.accounts',
  'subscriptions': 'nav.admin.subscriptions',
  'plans': 'nav.admin.plans',
  'interview-questions': 'nav.admin.interviewQuestions',
  'interview-flow': 'nav.admin.interviewFlow',
  'bot-actions': 'nav.admin.botActions',
  'translations': 'nav.admin.translations',
};

export function DashboardHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { t, locale } = useLocale();
  const { user: contextUser, clearUser } = useUser();
  const { selectedSite } = useSite();
  const { isOwner, canAccessTab } = usePermissions();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState(defaultNotifications);
  const [entityTypes, setEntityTypes] = useState([]);
  const [entityTitle, setEntityTitle] = useState(null);
  const [entityId, setEntityId] = useState(null);
  const notificationsRef = useRef(null);
  const userMenuRef = useRef(null);

  // Derive user display data from context user
  const user = useMemo(() => {
    if (!contextUser) {
      return {
        name: 'Loading...',
        email: '',
        initials: '...',
        image: null,
        plan: 'free',
        planName: null,
        aiCredits: 0,
        aiCreditsLimit: 0,
      };
    }
    
    // Get plan from subscription if available
    const subscription = contextUser.subscription;
    const plan = subscription?.plan;
    const planSlug = plan?.slug || 'free';
    
    // Get translated plan name based on current locale
    // For standard plan slugs (free, starter, pro, enterprise), use i18n dictionary
    // For custom plans, check translations array: { language: 'EN', name: 'Pro Plan' }
    const planTranslation = plan?.translations?.find(
      tr => tr.language?.toUpperCase() === locale?.toUpperCase()
    );
    // Only use DB translation if it exists for current locale, otherwise let i18n handle it
    const planName = planTranslation?.name || null;
    
    // Get AI credits limit from plan limitations
    const limitations = plan?.limitations || [];
    const aiCreditsLimitation = limitations.find?.(l => l.key === 'aiCredits');
    const aiCreditsLimit = aiCreditsLimitation?.value || 0;
    
    return {
      name: getUserDisplayName(contextUser.firstName, contextUser.lastName, contextUser.email),
      email: contextUser.email || '',
      initials: getUserInitials(contextUser.firstName, contextUser.lastName, contextUser.email),
      image: contextUser.image || null,
      plan: planSlug,
      planName: planName,
      aiCreditsUsed: contextUser.aiCreditsUsed || 0,
      aiCreditsLimit: aiCreditsLimit,
    };
  }, [contextUser, locale]);

  const unreadCount = notifications.filter(n => !n.read).length;

  // Check if user can access account/subscription features
  // Owner OR has access to account + subscription settings tab
  const canAccessBilling = useMemo(() => {
    if (isOwner) return true;
    return canAccessTab('account') && canAccessTab('subscription');
  }, [isOwner, canAccessTab]);

  // Fetch entity types for breadcrumb labels
  useEffect(() => {
    if (selectedSite?.id && pathname.includes('/entities/')) {
      fetch(`/api/entities/types?siteId=${selectedSite.id}`)
        .then(res => res.ok ? res.json() : { types: [] })
        .then(data => setEntityTypes(data.types || []))
        .catch(() => setEntityTypes([]));
    }
  }, [selectedSite?.id, pathname]);

  // Fetch entity title for breadcrumb when on entity edit page
  useEffect(() => {
    // Match pattern: /dashboard/entities/{type}/{id}
    const match = pathname.match(/\/dashboard\/entities\/[^/]+\/([a-f0-9]{24})$/i);
    if (match) {
      const id = match[1];
      if (id !== entityId) {
        setEntityId(id);
        fetch(`/api/entities/${id}`)
          .then(res => res.ok ? res.json() : null)
          .then(data => {
            if (data?.entity?.title) {
              // Decode URL-encoded text (like Hebrew)
              try {
                setEntityTitle(decodeURIComponent(data.entity.title));
              } catch {
                setEntityTitle(data.entity.title);
              }
            } else {
              setEntityTitle(null);
            }
          })
          .catch(() => setEntityTitle(null));
      }
    } else {
      setEntityTitle(null);
      setEntityId(null);
    }
  }, [pathname, entityId]);

  // Logout handler
  const handleLogout = async () => {
    setIsUserMenuOpen(false);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      clearUser();
      router.push('/auth/login');
    } catch (error) {
      console.error('Logout error:', error);
      clearUser();
      router.push('/auth/login');
    }
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setIsNotificationsOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNotificationClick = (notification) => {
    setNotifications(prev => 
      prev.map(n => n.id === notification.id ? { ...n, read: true } : n)
    );
    setIsNotificationsOpen(false);
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const clearNotification = (e, id) => {
    e.stopPropagation();
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  // Get breadcrumb items from current path
  const getBreadcrumbs = () => {
    const pathWithoutDashboard = pathname.replace('/dashboard', '');
    const segments = pathWithoutDashboard.split('/').filter(Boolean);
    
    const breadcrumbs = [{ label: t('nav.dashboard'), path: '/dashboard' }];
    
    let currentPath = '/dashboard';
    let isInEntities = false;
    let entityTypeIndex = -1;
    
    segments.forEach((segment, index) => {
      currentPath += `/${segment}`;
      
      // Track if we're inside /entities path
      if (segment === 'entities') {
        isInEntities = true;
        entityTypeIndex = index + 1; // Next segment is the entity type
      }
      
      // Check for static translation key first
      const translationKey = segmentTranslationKeys[segment];
      let label;
      
      if (translationKey) {
        label = t(translationKey);
      } else if (isInEntities && index > 0) {
        // We're inside entities path - check if this is an entity type slug
        const entityType = entityTypes.find(et => et.slug === segment);
        if (entityType) {
          label = entityType.name;
        } else if (index > entityTypeIndex) {
          // This is likely an entity ID - show entity title if available
          label = entityTitle || t('common.edit');
        } else {
          // Fallback: title-case the segment
          label = segment.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
        }
      } else {
        // Fallback: title-case the segment
        label = segment.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
      }
      
      breadcrumbs.push({ label, path: currentPath });
    });
    
    return breadcrumbs;
  };

  const breadcrumbs = getBreadcrumbs();

  return (
    <header className={styles.header}>
      <div className={styles.breadcrumbs}>
        {breadcrumbs.map((crumb, index) => (
          <span key={crumb.path} className={styles.breadcrumbWrapper}>
            {index > 0 && <span className={styles.breadcrumbSeparator}>/</span>}
            {index === breadcrumbs.length - 1 ? (
              <span className={styles.breadcrumbCurrent}>{crumb.label}</span>
            ) : (
              <Link href={crumb.path} className={styles.breadcrumbItem}>{crumb.label}</Link>
            )}
          </span>
        ))}
      </div>

      <div className={styles.headerActions}>
        <LanguageSwitcher variant="compact" />
        <ThemeToggle />
        
        {/* Notifications */}
        <div className={styles.notificationsWrapper} ref={notificationsRef}>
          <button 
            className={styles.notificationButton}
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className={styles.notificationBadge}>{unreadCount}</span>
            )}
          </button>

          {/* Notifications Dropdown */}
          {isNotificationsOpen && (
            <div className={styles.notificationsDropdown}>
              <div className={styles.notificationsHeader}>
                <h3 className={styles.notificationsTitle}>{t('notifications.title')}</h3>
                {unreadCount > 0 && (
                  <button 
                    className={styles.markAllReadButton}
                    onClick={markAllAsRead}
                  >
                    <CheckCheck size={14} />
                    {t('notifications.markAllRead')}
                  </button>
                )}
              </div>

              <div className={styles.notificationsList}>
                {notifications.length === 0 ? (
                  <div className={styles.noNotifications}>
                    <Bell size={32} />
                    <p>{t('notifications.noNotifications')}</p>
                  </div>
                ) : (
                  notifications.map((notification) => {
                    const Icon = notification.icon;
                    return (
                      <Link
                        key={notification.id}
                        href={notification.link}
                        className={`${styles.notificationItem} ${!notification.read ? styles.unread : ''}`}
                        onClick={() => handleNotificationClick(notification)}
                      >
                        <div className={`${styles.notificationIcon} ${styles[notification.type]}`}>
                          <Icon size={16} />
                        </div>
                        <div className={styles.notificationContent}>
                          <div className={styles.notificationTitle}>{t(notification.titleKey)}</div>
                          <p className={styles.notificationMessage}>{t(notification.messageKey)}</p>
                          <span className={styles.notificationTime}>{t(notification.timeKey)}</span>
                        </div>
                        <button 
                          className={styles.notificationClose}
                          onClick={(e) => clearNotification(e, notification.id)}
                        >
                          <X size={14} />
                        </button>
                      </Link>
                    );
                  })
                )}
              </div>

              {notifications.length > 0 && (
                <div className={styles.notificationsFooter}>
                  <Link 
                    href="/dashboard/notifications"
                    className={styles.viewAllButton}
                    onClick={() => setIsNotificationsOpen(false)}
                  >
                    {t('notifications.viewAllNotifications')}
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>

        {/* User Menu */}
        <div className={styles.userMenuWrapper} ref={userMenuRef}>
          <button 
            className={styles.userButton}
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
          >
            <div className={styles.userAvatar}>
              {user.image ? (
                <Image
                  src={user.image}
                  alt={user.name}
                  width={32}
                  height={32}
                  className={styles.userAvatarImage}
                />
              ) : (
                user.initials
              )}
            </div>
          </button>

          {/* User Menu Dropdown */}
          {isUserMenuOpen && (
            <div className={styles.userMenuDropdown}>
              {/* User Info Header */}
              <div className={styles.userMenuHeader}>
                <div className={styles.userMenuAvatar}>
                  {user.image ? (
                    <Image
                      src={user.image}
                      alt={user.name}
                      width={40}
                      height={40}
                      className={styles.userAvatarImage}
                    />
                  ) : (
                    user.initials
                  )}
                </div>
                <div className={styles.userMenuInfo}>
                  <span className={styles.userMenuName}>{user.name}</span>
                  <span className={styles.userMenuEmail}>{user.email}</span>
                </div>
              </div>

              {/* Plan Display - Visible to everyone */}
              <div className={styles.creditsSection}>
                <div className={styles.creditsHeader}>
                  <span className={styles.currentPlanLabel}>{t('user.currentPlan') || 'Current Plan'}</span>
                  <div className={styles.planBadge}>
                    <Crown size={12} />
                    <span>{user.planName || t(`user.plans.${user.plan}`)}</span>
                  </div>
                </div>
                {user.aiCreditsLimit > 0 && (
                  <div className={styles.creditsProgressBar}>
                    <div 
                      className={styles.creditsProgressFill} 
                      style={{ width: `${Math.min((user.aiCreditsUsed / user.aiCreditsLimit) * 100, 100)}%` }}
                    />
                    <div className={styles.creditsProgressText}>
                      <span className={styles.creditsLabel}>{t('user.aiCredits') || 'AI Credits'}</span>
                      <span className={styles.creditsValue}>
                        {user.aiCreditsUsed.toLocaleString()} / {user.aiCreditsLimit.toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* My Profile - Visible to everyone */}
              <div className={styles.userMenuItems}>
                <Link 
                  href="/dashboard/settings?tab=profile" 
                  className={styles.userMenuItem}
                  onClick={() => setIsUserMenuOpen(false)}
                >
                  <UserCircle size={18} />
                  <span>{t('user.myProfile')}</span>
                </Link>
              </div>

              {/* Billing Menu Items - Only show if user has permissions */}
              {canAccessBilling && (
                <div className={styles.userMenuItems}>
                  <Link 
                    href="/dashboard/settings?tab=account" 
                    className={styles.userMenuItem}
                    onClick={() => setIsUserMenuOpen(false)}
                  >
                    <UserCircle size={18} />
                    <span>{t('user.companyAccount')}</span>
                  </Link>
                  <Link 
                    href="/dashboard/settings?tab=subscription" 
                    className={styles.userMenuItem}
                    onClick={() => setIsUserMenuOpen(false)}
                  >
                    <CreditCard size={18} />
                    <span>{t('user.subscription')}</span>
                  </Link>
                  <Link 
                    href="/dashboard/settings?tab=credits" 
                    className={styles.userMenuItem}
                    onClick={() => setIsUserMenuOpen(false)}
                  >
                    <Coins size={18} />
                    <span>{t('user.credits')}</span>
                  </Link>
                </div>
              )}

              {/* Action Buttons - Only show if user can access billing */}
              {canAccessBilling && (
                <div className={styles.userMenuActions}>
                  <Link 
                    href="/dashboard/credits/add" 
                    className={styles.addCreditsButton}
                    onClick={() => setIsUserMenuOpen(false)}
                  >
                    <Plus size={16} />
                    <span>{t('user.addCredits')}</span>
                  </Link>
                  <Link 
                    href="/dashboard/upgrade" 
                    className={styles.upgradePlanButton}
                    onClick={() => setIsUserMenuOpen(false)}
                  >
                    <Crown size={16} />
                    <span>{t('user.upgradePlan')}</span>
                  </Link>
                </div>
              )}

              {/* Logout */}
              <div className={styles.userMenuFooter}>
                <button 
                  className={styles.userMenuLogout}
                  onClick={handleLogout}
                >
                  <LogOut size={18} />
                  <span>{t('auth.logout')}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
