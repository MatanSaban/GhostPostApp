'use client';

import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useUser } from '@/app/context/user-context';

/**
 * Notifications Context
 * Centralized notification state management for synchronization
 * between DashboardHeader dropdown and NotificationsPage.
 */

const NotificationsContext = createContext({
  notifications: [],
  unreadCount: 0,
  totalCount: 0,
  isLoading: false,
  hasMore: false,
  nextCursor: null,
  mutationVersion: 0, // Increments on each mutation to trigger re-fetches
  // Actions
  fetchNotifications: () => {},
  loadMore: () => {},
  markAsRead: () => {},
  markAllAsRead: () => {},
  toggleRead: () => {},
  deleteNotification: () => {},
  deleteAllNotifications: () => {},
  refresh: () => {},
});

// Polling interval for notifications (30s)
const NOTIFICATION_POLL_INTERVAL = 30_000;
const PAGE_SIZE = 20;

export function NotificationsProvider({ children }) {
  const { user, isLoading: isUserLoading } = useUser();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [mutationVersion, setMutationVersion] = useState(0);
  const pollIntervalRef = useRef(null);
  const isMountedRef = useRef(true);

  /**
   * Fetch notifications from API
   */
  const fetchNotifications = useCallback(async (filter = 'all', cursor = null, isPolling = false) => {
    try {
      if (!isPolling) {
        setIsLoading(true);
      }

      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });

      if (filter === 'unread') {
        params.set('unreadOnly', 'true');
      } else if (filter === 'read') {
        params.set('readOnly', 'true');
      }

      if (cursor) {
        params.set('cursor', cursor);
      }

      const res = await fetch(`/api/notifications?${params}`);
      
      // If unauthorized (not logged in), just return silently
      if (res.status === 401) {
        if (!isPolling && isMountedRef.current) {
          setIsLoading(false);
        }
        return null;
      }
      
      if (!res.ok) throw new Error('Failed to fetch');
      
      const data = await res.json();

      if (!isMountedRef.current) return;

      if (cursor) {
        // Load more - append to existing
        setNotifications(prev => [...prev, ...(data.notifications || [])]);
      } else {
        // Initial/refresh - replace all
        setNotifications(data.notifications || []);
      }

      setUnreadCount(data.unreadCount || 0);
      setTotalCount(data.totalCount || 0);
      setHasMore(data.hasMore || false);
      setNextCursor(data.nextCursor || null);
      setActiveFilter(filter);

      return data;
    } catch (err) {
      console.error('[NotificationsContext] Fetch error:', err);
      return null;
    } finally {
      if (!isPolling && isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  /**
   * Load more notifications (pagination)
   */
  const loadMore = useCallback(async () => {
    if (!hasMore || !nextCursor || isLoading) return;
    return fetchNotifications(activeFilter, nextCursor);
  }, [hasMore, nextCursor, isLoading, activeFilter, fetchNotifications]);

  /**
   * Mark single notification as read
   */
  const markAsRead = useCallback(async (notificationId) => {
    // Optimistic update
    setNotifications(prev =>
      prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
    setMutationVersion(v => v + 1);

    // Persist
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: notificationId, read: true }),
      });
    } catch (err) {
      console.error('[NotificationsContext] Mark as read error:', err);
    }
  }, []);

  /**
   * Mark all notifications as read
   */
  const markAllAsRead = useCallback(async () => {
    // Optimistic update
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
    setMutationVersion(v => v + 1);

    // Persist
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true, read: true }),
      });
    } catch (err) {
      console.error('[NotificationsContext] Mark all as read error:', err);
    }
  }, []);

  /**
   * Toggle read/unread status
   */
  const toggleRead = useCallback(async (notificationId) => {
    const notification = notifications.find(n => n.id === notificationId);
    if (!notification) return;

    const newRead = !notification.read;

    // Optimistic update
    setNotifications(prev =>
      prev.map(n => n.id === notificationId ? { ...n, read: newRead } : n)
    );
    setUnreadCount(prev => newRead ? Math.max(0, prev - 1) : prev + 1);
    setMutationVersion(v => v + 1);

    // Persist
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: notificationId, read: newRead }),
      });
    } catch (err) {
      console.error('[NotificationsContext] Toggle read error:', err);
    }
  }, [notifications]);

  /**
   * Delete single notification
   */
  const deleteNotification = useCallback(async (notificationId) => {
    const notification = notifications.find(n => n.id === notificationId);

    // Optimistic update
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
    setTotalCount(prev => Math.max(0, prev - 1));
    if (notification && !notification.read) {
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
    setMutationVersion(v => v + 1);

    // Persist
    try {
      await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: notificationId }),
      });
    } catch (err) {
      console.error('[NotificationsContext] Delete error:', err);
    }
  }, [notifications]);

  /**
   * Delete all notifications
   */
  const deleteAllNotifications = useCallback(async () => {
    // Optimistic update
    setNotifications([]);
    setUnreadCount(0);
    setTotalCount(0);
    setHasMore(false);
    setNextCursor(null);
    setMutationVersion(v => v + 1);

    // Persist
    try {
      await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
    } catch (err) {
      console.error('[NotificationsContext] Delete all error:', err);
    }
  }, []);

  /**
   * Refresh notifications (reset to first page)
   */
  const refresh = useCallback((filter = 'all') => {
    return fetchNotifications(filter, null, false);
  }, [fetchNotifications]);

  // Initial fetch + polling — only when user is logged in
  useEffect(() => {
    isMountedRef.current = true;

    // Don't poll if user isn't loaded yet or not logged in
    if (isUserLoading || !user) {
      return () => { isMountedRef.current = false; };
    }
    
    // Initial fetch
    fetchNotifications('all', null, false);

    // Setup polling
    pollIntervalRef.current = setInterval(() => {
      fetchNotifications(activeFilter, null, true);
    }, NOTIFICATION_POLL_INTERVAL);

    return () => {
      isMountedRef.current = false;
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [user, isUserLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = {
    notifications,
    unreadCount,
    totalCount,
    isLoading,
    hasMore,
    nextCursor,
    activeFilter,
    mutationVersion,
    // Actions
    fetchNotifications,
    loadMore,
    markAsRead,
    markAllAsRead,
    toggleRead,
    deleteNotification,
    deleteAllNotifications,
    refresh,
  };

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationsProvider');
  }
  return context;
}
