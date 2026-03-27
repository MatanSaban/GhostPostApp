'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  CheckCheck,
  Trash2,
  X,
  Activity,
  AlertCircle,
  FileText,
  Sparkles,
  TrendingUp,
  Filter,
  Loader2,
  BellOff,
  Eye,
  Mail,
  MailOpen,
} from 'lucide-react';
import { useLocale } from '@/app/context/locale-context';
import { useNotifications } from '@/app/context/notifications-context';
import styles from './page.module.css';

// Notification type → icon mapping (same as DashboardHeader)
const NOTIFICATION_ICONS = {
  audit_complete: Activity,
  audit_failed: AlertCircle,
  content: FileText,
  ai: Sparkles,
  alert: AlertCircle,
  success: TrendingUp,
};

// Available filter types
const FILTER_TYPES = [
  { key: 'all', labelKey: 'notificationCenter.filters.all' },
  { key: 'unread', labelKey: 'notificationCenter.filters.unread' },
  { key: 'read', labelKey: 'notificationCenter.filters.read' },
];

// Relative time helper
function timeAgo(dateStr, t) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return t('notifications.time.justNow');
  if (diffMin < 60) return t('notifications.time.minutesAgo', { count: diffMin });
  if (diffHr < 24) return t('notifications.time.hoursAgo', { count: diffHr });
  if (diffDay < 7) return t('notifications.time.daysAgo', { count: diffDay });
  return new Date(dateStr).toLocaleDateString();
}

// Full date formatter
function formatDate(dateStr, locale) {
  return new Date(dateStr).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const PAGE_SIZE = 20;

export default function NotificationsPage() {
  const { t, locale } = useLocale();
  const router = useRouter();
  
  // Get shared context - use directly for full sync
  const {
    notifications: contextNotifications,
    unreadCount: contextUnreadCount,
    totalCount: contextTotalCount,
    isLoading: contextIsLoading,
    hasMore: contextHasMore,
    loadMore: contextLoadMore,
    markAsRead,
    markAllAsRead,
    toggleRead,
    deleteNotification,
    deleteAllNotifications,
    refresh,
  } = useNotifications();

  const [activeFilter, setActiveFilter] = useState('all');
  const [actionInProgress, setActionInProgress] = useState(null);
  const observerRef = useRef(null);
  const loadMoreRef = useRef(null);

  // Filter notifications client-side based on active filter
  const notifications = useMemo(() => {
    if (activeFilter === 'unread') {
      return contextNotifications.filter(n => !n.read);
    }
    if (activeFilter === 'read') {
      return contextNotifications.filter(n => n.read);
    }
    return contextNotifications;
  }, [contextNotifications, activeFilter]);

  // Derived counts
  const unreadCount = contextUnreadCount;
  const totalCount = contextTotalCount;
  const isLoading = contextIsLoading;
  const hasMore = contextHasMore;

  // Intersection Observer for infinite scroll
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          contextLoadMore();
        }
      },
      { threshold: 0.5 }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => observerRef.current?.disconnect();
  }, [hasMore, isLoading, contextLoadMore]);

  // Click on notification row - navigate to link and mark as read
  const handleNotificationClick = async (notification) => {
    if (!notification.read) {
      setActionInProgress(notification.id);
      await markAsRead(notification.id);
      setActionInProgress(null);
    }
    if (notification.link) {
      router.push(notification.link);
    }
  };

  // Handle mark all as read
  const handleMarkAllAsRead = async () => {
    setActionInProgress('all-read');
    await markAllAsRead();
    setActionInProgress(null);
  };

  // Handle toggle read status
  const handleToggleRead = async (id) => {
    setActionInProgress(id);
    await toggleRead(id);
    setActionInProgress(null);
  };

  // Handle delete notification
  const handleDeleteNotification = async (id) => {
    setActionInProgress(id);
    await deleteNotification(id);
    setActionInProgress(null);
  };

  // Handle clear all
  const handleClearAll = async () => {
    setActionInProgress('clear-all');
    await deleteAllNotifications();
    setActionInProgress(null);
  };

  // Group notifications by date
  const groupedNotifications = (() => {
    const groups = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    notifications.forEach((n) => {
      const date = new Date(n.createdAt);
      date.setHours(0, 0, 0, 0);
      let groupKey;

      if (date.getTime() >= today.getTime()) {
        groupKey = 'today';
      } else if (date.getTime() >= yesterday.getTime()) {
        groupKey = 'yesterday';
      } else if (date.getTime() >= weekAgo.getTime()) {
        groupKey = 'thisWeek';
      } else {
        groupKey = 'older';
      }

      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(n);
    });

    return groups;
  })();

  const groupLabels = {
    today: t('notificationCenter.groups.today'),
    yesterday: t('notificationCenter.groups.yesterday'),
    thisWeek: t('notificationCenter.groups.thisWeek'),
    older: t('notificationCenter.groups.older'),
  };

  const groupOrder = ['today', 'yesterday', 'thisWeek', 'older'];

  return (
    <div className={styles.page}>
      {/* Page Header */}
      <div className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>
            <Bell size={24} />
          </div>
          <div>
            <h1 className={styles.pageTitle}>{t('notificationCenter.title')}</h1>
            <p className={styles.pageSubtitle}>
              {unreadCount > 0
                ? t('notificationCenter.subtitleUnread', { count: unreadCount })
                : t('notificationCenter.subtitleNone')}
            </p>
          </div>
        </div>

        {notifications.length > 0 && (
          <div className={styles.headerActions}>
            {unreadCount > 0 && (
              <button
                className={styles.headerAction}
                onClick={handleMarkAllAsRead}
                disabled={actionInProgress === 'all-read'}
              >
                <CheckCheck size={16} />
                <span>{t('notifications.markAllRead')}</span>
              </button>
            )}
            <button
              className={`${styles.headerAction} ${styles.danger}`}
              onClick={handleClearAll}
              disabled={actionInProgress === 'clear-all'}
            >
              <Trash2 size={16} />
              <span>{t('notificationCenter.clearAll')}</span>
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <Filter size={16} className={styles.filterIcon} />
        {FILTER_TYPES.map((filter) => (
          <button
            key={filter.key}
            className={`${styles.filterChip} ${activeFilter === filter.key ? styles.filterActive : ''}`}
            onClick={() => setActiveFilter(filter.key)}
          >
            {t(filter.labelKey)}
          </button>
        ))}
      </div>

      {/* Stats Bar */}
      {!isLoading && (
        <div className={styles.statsBar}>
          <span className={styles.statItem}>
            {t('notificationCenter.stats.total', { count: totalCount })}
          </span>
          <span className={styles.statDivider}>·</span>
          <span className={`${styles.statItem} ${unreadCount > 0 ? styles.statUnread : ''}`}>
            {t('notificationCenter.stats.unread', { count: unreadCount })}
          </span>
        </div>
      )}

      {/* Content */}
      <div className={styles.content}>
        {isLoading ? (
          <div className={styles.loadingState}>
            <Loader2 size={32} className={styles.spinner} />
            <p>{t('notificationCenter.loading')}</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className={styles.emptyState}>
            <BellOff size={48} className={styles.emptyIcon} />
            <h3 className={styles.emptyTitle}>
              {activeFilter === 'unread'
                ? t('notificationCenter.empty.allRead')
                : t('notificationCenter.empty.title')}
            </h3>
            <p className={styles.emptyMessage}>
              {activeFilter === 'unread'
                ? t('notificationCenter.empty.allReadMessage')
                : t('notificationCenter.empty.message')}
            </p>
          </div>
        ) : (
          <>
            {groupOrder.map((groupKey) => {
              const items = groupedNotifications[groupKey];
              if (!items?.length) return null;

              return (
                <div key={groupKey} className={styles.group}>
                  <div className={styles.groupHeader}>
                    <span className={styles.groupLabel}>{groupLabels[groupKey]}</span>
                    <span className={styles.groupCount}>
                      {items.length}
                    </span>
                  </div>

                  <div className={styles.notificationsList}>
                    {items.map((notification) => {
                      const Icon = NOTIFICATION_ICONS[notification.type] || Bell;
                      const titleText = notification.title?.startsWith('notifications.')
                        ? t(notification.title, notification.data || {})
                        : notification.title;
                      // Pre-translate fields for entity webhook notifications
                      const notifData = notification.data || {};
                      let interpolationData = notifData;
                      if (notification.type === 'entity_webhook_update') {
                        const slug = notifData.entityTypeSlug || 'post';
                        const entityType = t(`notifications.entityWebhook.entityTypes.${slug}`) || t('notifications.entityWebhook.entityTypes.default');
                        const action = notifData.action ? (t(`notifications.entityWebhook.actions.${notifData.action}`) || notifData.action) : '';
                        interpolationData = { ...notifData, entityType, action };
                      }
                      if (notification.type === 'audit_complete' && notifData.deviceType) {
                        const deviceLabel = t(`notifications.auditComplete.deviceTypes.${notifData.deviceType}`) || notifData.deviceType;
                        interpolationData = { ...interpolationData, deviceLabel };
                      }
                      const messageText = notification.message?.startsWith('notifications.')
                        ? t(notification.message, interpolationData)
                        : notification.message;

                      return (
                        <div
                          key={notification.id}
                          className={`${styles.notificationItem} ${!notification.read ? styles.unread : ''} ${notification.link ? styles.clickable : ''}`}
                          onClick={() => handleNotificationClick(notification)}
                          role={notification.link ? 'link' : undefined}
                        >
                          <div className={`${styles.notificationIcon} ${styles[notification.type] || ''}`}>
                            <Icon size={18} />
                          </div>

                          <div className={styles.notificationBody}>
                            <div className={styles.notificationHeader}>
                              <span className={styles.notificationTitle}>{titleText}</span>
                              <span className={styles.notificationTime}>
                                {timeAgo(notification.createdAt, t)}
                              </span>
                            </div>
                            <p className={styles.notificationMessage}>{messageText}</p>
                            <span className={styles.notificationDate}>
                              {formatDate(notification.createdAt, locale)}
                            </span>
                          </div>

                          <div className={styles.notificationActions}>
                            <button
                              className={styles.actionBtn}
                              onClick={(e) => { e.stopPropagation(); handleToggleRead(notification.id); }}
                              title={notification.read ? t('notifications.markUnread') : t('notifications.markRead')}
                              disabled={actionInProgress === notification.id}
                            >
                              {notification.read ? <Mail size={15} /> : <MailOpen size={15} />}
                            </button>
                            <button
                              className={`${styles.actionBtn} ${styles.deleteBtn}`}
                              onClick={(e) => { e.stopPropagation(); handleDeleteNotification(notification.id); }}
                              title={t('notificationCenter.delete')}
                              disabled={actionInProgress === notification.id}
                            >
                              <X size={15} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Infinite scroll trigger */}
            <div ref={loadMoreRef} className={styles.loadMoreTrigger}>
              {isLoading && hasMore && (
                <div className={styles.loadingMore}>
                  <Loader2 size={20} className={styles.spinner} />
                  <span>{t('notificationCenter.loadingMore')}</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
