'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
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
import styles from './DashboardHeader.module.css';

// Sample user data
const defaultUser = {
  name: 'Demo Admin',
  email: 'demo@ghostpost.io',
  initials: 'DA',
  credits: 150,
  plan: 'Pro',
};

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
    link: '/dashboard/keyword-strategy',
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
  'content-planner': 'nav.contentPlanner',
  'ai-content-wizard': 'nav.aiContentWizard',
  'automations': 'nav.automations',
  'link-building': 'nav.linkBuilding',
  'redirections': 'nav.redirections',
  'seo-frontend': 'nav.seoFrontend',
  'seo-backend': 'nav.seoBackend',
  'site-audit': 'nav.siteAudit',
  'keyword-strategy': 'nav.keywordStrategy',
  'settings': 'nav.settings',
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

export function DashboardHeader({ user = defaultUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLocale();
  const { clearUser } = useUser();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState(defaultNotifications);
  const notificationsRef = useRef(null);
  const userMenuRef = useRef(null);

  const unreadCount = notifications.filter(n => !n.read).length;

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
    segments.forEach((segment) => {
      currentPath += `/${segment}`;
      const translationKey = segmentTranslationKeys[segment];
      const label = translationKey ? t(translationKey) : segment
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
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
            <div className={styles.userAvatar}>{user.initials}</div>
          </button>

          {/* User Menu Dropdown */}
          {isUserMenuOpen && (
            <div className={styles.userMenuDropdown}>
              {/* User Info Header */}
              <div className={styles.userMenuHeader}>
                <div className={styles.userMenuAvatar}>{user.initials}</div>
                <div className={styles.userMenuInfo}>
                  <span className={styles.userMenuName}>{user.name}</span>
                  <span className={styles.userMenuEmail}>{user.email}</span>
                </div>
              </div>

              {/* Credits Display */}
              <div className={styles.creditsSection}>
                <div className={styles.creditsInfo}>
                  <Coins size={16} className={styles.creditsIcon} />
                  <span className={styles.creditsLabel}>{t('user.credits')}</span>
                  <span className={styles.creditsValue}>{user.credits}</span>
                </div>
                <div className={styles.planBadge}>
                  <Crown size={12} />
                  <span>{t(`user.plans.${user.plan.toLowerCase()}`)}</span>
                </div>
              </div>

              {/* Menu Items */}
              <div className={styles.userMenuItems}>
                <Link 
                  href="/dashboard/account" 
                  className={styles.userMenuItem}
                  onClick={() => setIsUserMenuOpen(false)}
                >
                  <UserCircle size={18} />
                  <span>{t('user.manageAccount')}</span>
                </Link>
                <Link 
                  href="/dashboard/subscriptions" 
                  className={styles.userMenuItem}
                  onClick={() => setIsUserMenuOpen(false)}
                >
                  <CreditCard size={18} />
                  <span>{t('settings.billing')}</span>
                </Link>
                <Link 
                  href="/dashboard/credits" 
                  className={styles.userMenuItem}
                  onClick={() => setIsUserMenuOpen(false)}
                >
                  <Coins size={18} />
                  <span>{t('user.credits')}</span>
                </Link>
              </div>

              {/* Action Buttons */}
              <div className={styles.userMenuActions}>
                <Link 
                  href="/dashboard/credits/add" 
                  className={styles.addCreditsButton}
                  onClick={() => setIsUserMenuOpen(false)}
                >
                  <Plus size={16} />
                  <span>{t('common.add')} {t('user.credits')}</span>
                </Link>
                <Link 
                  href="/dashboard/upgrade" 
                  className={styles.upgradePlanButton}
                  onClick={() => setIsUserMenuOpen(false)}
                >
                  <Crown size={16} />
                  <span>{t('user.upgrade')} {t('user.plan')}</span>
                </Link>
              </div>

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
