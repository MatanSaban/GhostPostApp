'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
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
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [actionInProgress, setActionInProgress] = useState(null); // id of notification being acted on
  const observerRef = useRef(null);
  const loadMoreRef = useRef(null);

  // Fetch notifications (initial or filter change)
  const fetchNotifications = useCallback(async (filter, cursor = null) => {
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });

      if (filter === 'unread') {
        params.set('unreadOnly', 'true');
      } else if (filter === 'read') {
        params.set('readOnly', 'true');
      }

      if (cursor) params.set('cursor', cursor);

      const res = await fetch(`/api/notifications?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      return await res.json();
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
      return null;
    }
  }, []);

  // Initial load & filter change
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    fetchNotifications(activeFilter).then((data) => {
      if (cancelled || !data) return;
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
      setTotalCount(data.totalCount || 0);
      setHasMore(data.hasMore || false);
      setNextCursor(data.nextCursor || null);
      setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, [activeFilter, fetchNotifications]);

  // Load more (infinite scroll)
  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore || !nextCursor) return;
    setIsLoadingMore(true);

    const data = await fetchNotifications(activeFilter, nextCursor);
    if (data) {
      setNotifications((prev) => [...prev, ...(data.notifications || [])]);
      setUnreadCount(data.unreadCount || 0);
      setHasMore(data.hasMore || false);
      setNextCursor(data.nextCursor || null);
    }
    setIsLoadingMore(false);
  }, [isLoadingMore, hasMore, nextCursor, activeFilter, fetchNotifications]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          loadMore();
        }
      },
      { threshold: 0.5 }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => observerRef.current?.disconnect();
  }, [hasMore, isLoadingMore, loadMore]);

  // Mark single notification as read
  const markAsRead = async (id) => {
    setActionInProgress(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.unreadCount);
      }
    } catch { /* revert would go here */ }
    setActionInProgress(null);
  };

  // Toggle read/unread for a notification
  const toggleReadStatus = async (id) => {
    const notification = notifications.find((n) => n.id === id);
    if (!notification) return;
    const newRead = !notification.read;
    setActionInProgress(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: newRead } : n))
    );
    setUnreadCount((c) => newRead ? Math.max(0, c - 1) : c + 1);
    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, read: newRead }),
      });
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.unreadCount);
      }
    } catch { /* silent */ }
    setActionInProgress(null);
  };

  // Click on notification row — navigate to link and mark as read
  const handleNotificationClick = (notification) => {
    if (!notification.read) {
      markAsRead(notification.id);
    }
    if (notification.link) {
      router.push(notification.link);
    }
  };

  // Mark all as read
  const markAllAsRead = async () => {
    setActionInProgress('all-read');
    // Optimistic
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);

    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
    } catch { /* silent */ }
    setActionInProgress(null);
  };

  // Delete single notification
  const deleteNotification = async (id) => {
    setActionInProgress(id);
    const wasUnread = notifications.find((n) => n.id === id && !n.read);
    // Optimistic
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setTotalCount((c) => Math.max(0, c - 1));
    if (wasUnread) setUnreadCount((c) => Math.max(0, c - 1));

    try {
      await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
    } catch { /* silent */ }
    setActionInProgress(null);
  };

  // Clear all notifications
  const clearAll = async () => {
    setActionInProgress('clear-all');
    setNotifications([]);
    setUnreadCount(0);
    setTotalCount(0);
    setHasMore(false);
    setNextCursor(null);

    try {
      await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
    } catch { /* silent */ }
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
                onClick={markAllAsRead}
                disabled={actionInProgress === 'all-read'}
              >
                <CheckCheck size={16} />
                <span>{t('notifications.markAllRead')}</span>
              </button>
            )}
            <button
              className={`${styles.headerAction} ${styles.danger}`}
              onClick={clearAll}
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
                      const messageText = notification.message?.startsWith('notifications.')
                        ? t(notification.message, notification.data || {})
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
                              onClick={(e) => { e.stopPropagation(); toggleReadStatus(notification.id); }}
                              title={notification.read ? t('notifications.markUnread') : t('notifications.markRead')}
                              disabled={actionInProgress === notification.id}
                            >
                              {notification.read ? <Mail size={15} /> : <MailOpen size={15} />}
                            </button>
                            <button
                              className={`${styles.actionBtn} ${styles.deleteBtn}`}
                              onClick={(e) => { e.stopPropagation(); deleteNotification(notification.id); }}
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
              {isLoadingMore && (
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
