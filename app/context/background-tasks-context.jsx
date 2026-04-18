'use client';

import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

/**
 * Background Tasks Context
 * Manages long-running tasks that should persist across navigation.
 * Shows a non-blocking notification that allows users to continue using the platform.
 */

const BackgroundTasksContext = createContext({
  tasks: [],
  addTask: () => {},
  updateTask: () => {},
  removeTask: () => {},
  getTask: () => null,
});

export function BackgroundTasksProvider({ children }) {
  const [tasks, setTasks] = useState([]);
  const taskControllersRef = useRef({}); // Store AbortControllers for cancellation
  const pollTimersRef = useRef({}); // Store polling intervals for tasks

  /**
   * Add a new background task
   * @param {Object} task - Task object
   * @param {string} task.id - Unique task ID
   * @param {string} task.type - Task type (e.g., 'entity-population', 'deep-crawl')
   * @param {string} task.title - Display title
   * @param {string} task.message - Current status message
   * @param {number} task.progress - Progress percentage (0-100)
   * @param {'pending'|'running'|'completed'|'error'|'cancelled'} task.status
   * @param {Object} task.metadata - Additional task data
   */
  const addTask = useCallback((task) => {
    const controller = new AbortController();
    taskControllersRef.current[task.id] = controller;

    setTasks(prev => {
      // Check if task already exists
      const existing = prev.find(t => t.id === task.id);
      if (existing) {
        return prev.map(t => t.id === task.id ? { ...t, ...task, signal: controller.signal } : t);
      }
      return [...prev, { 
        ...task, 
        status: task.status || 'pending',
        progress: task.progress || 0,
        createdAt: Date.now(),
        signal: controller.signal,
      }];
    });

    return controller;
  }, []);

  /**
   * Update an existing task
   * @param {string} taskId - Task ID
   * @param {Object} updates - Fields to update
   */
  const updateTask = useCallback((taskId, updates) => {
    setTasks(prev => prev.map(t => 
      t.id === taskId ? { ...t, ...updates, updatedAt: Date.now() } : t
    ));
  }, []);

  /**
   * Remove a task from the list
   * @param {string} taskId - Task ID
   */
  const removeTask = useCallback((taskId) => {
    // Stop polling if active
    if (pollTimersRef.current[taskId]) {
      clearInterval(pollTimersRef.current[taskId]);
      delete pollTimersRef.current[taskId];
    }
    // Abort if still running
    if (taskControllersRef.current[taskId]) {
      taskControllersRef.current[taskId].abort();
      delete taskControllersRef.current[taskId];
    }
    setTasks(prev => prev.filter(t => t.id !== taskId));
  }, []);

  /**
   * Cancel a running task
   * @param {string} taskId - Task ID
   */
  const cancelTask = useCallback((taskId) => {
    // Stop polling if active
    if (pollTimersRef.current[taskId]) {
      clearInterval(pollTimersRef.current[taskId]);
      delete pollTimersRef.current[taskId];
    }
    if (taskControllersRef.current[taskId]) {
      taskControllersRef.current[taskId].abort();
    }
    updateTask(taskId, { status: 'cancelled', message: 'Task cancelled by user' });
  }, [updateTask]);

  /**
   * Get a specific task
   * @param {string} taskId - Task ID
   * @returns {Object|null} Task object or null
   */
  const getTask = useCallback((taskId) => {
    return tasks.find(t => t.id === taskId) || null;
  }, [tasks]);

  /**
   * Find a running/pending task by type and optional metadata match
   * @param {string} type - Task type (e.g., 'site-audit')
   * @param {Object} metadata - Metadata fields to match
   * @returns {Object|null} Task object or null
   */
  const findActiveTask = useCallback((type, metadata = {}) => {
    return tasks.find(t => {
      if (t.type !== type) return false;
      if (t.status !== 'running' && t.status !== 'pending') return false;
      return Object.entries(metadata).every(([k, v]) => t.metadata?.[k] === v);
    }) || null;
  }, [tasks]);

  // Auto-remove completed tasks after 10 seconds
  useEffect(() => {
    const completedTasks = tasks.filter(t => t.status === 'completed' || t.status === 'cancelled');
    
    if (completedTasks.length > 0) {
      const timeout = setTimeout(() => {
        setTasks(prev => prev.filter(t => 
          t.status !== 'completed' && t.status !== 'cancelled'
        ));
      }, 10000);

      return () => clearTimeout(timeout);
    }
  }, [tasks]);

  /**
   * Start polling an API endpoint to update a task's progress.
   * Persists across page navigation since this runs in the layout-level provider.
   * Idempotent — won't duplicate if already polling for this task.
   * @param {string} taskId - Task ID to update
   * @param {Object} config
   * @param {string} config.url - API endpoint to poll
   * @param {number} [config.interval=3000] - Poll interval in ms
   * @param {string} [config.completedLabelKey] - i18n key for the completed message
   */
  const startTaskPolling = useCallback((taskId, config) => {
    if (pollTimersRef.current[taskId]) return; // already polling

    const timer = setInterval(async () => {
      try {
        const res = await fetch(config.url);
        if (!res.ok) return;
        const data = await res.json();
        const latest = data.latest;
        if (!latest) return;

        if (latest.status !== 'PENDING' && latest.status !== 'RUNNING') {
          // Task finished — update status and stop polling
          updateTask(taskId, {
            status: latest.status === 'COMPLETED' ? 'completed' : 'error',
            progress: 100,
            labelKey: latest.status === 'COMPLETED' ? (config.completedLabelKey || null) : null,
            labelParams: null,
            message: latest.status === 'COMPLETED' ? '' : (latest.progress?.failureReason || 'Task failed'),
          });
          clearInterval(pollTimersRef.current[taskId]);
          delete pollTimersRef.current[taskId];
        } else if (latest.progress) {
          updateTask(taskId, {
            progress: latest.progress.percentage || 0,
            labelKey: latest.progress.labelKey || null,
            labelParams: latest.progress.labelParams || {},
          });
        }
      } catch { /* ignore poll errors */ }
    }, config.interval || 3000);

    pollTimersRef.current[taskId] = timer;
  }, [updateTask]);

  /**
   * Stop polling for a specific task
   * @param {string} taskId - Task ID
   */
  const stopTaskPolling = useCallback((taskId) => {
    if (pollTimersRef.current[taskId]) {
      clearInterval(pollTimersRef.current[taskId]);
      delete pollTimersRef.current[taskId];
    }
  }, []);

  // Cleanup all poll timers on unmount
  useEffect(() => {
    return () => {
      Object.values(pollTimersRef.current).forEach(clearInterval);
      pollTimersRef.current = {};
    };
  }, []);

  return (
    <BackgroundTasksContext.Provider value={{ 
      tasks, 
      addTask, 
      updateTask, 
      removeTask, 
      cancelTask,
      getTask,
      findActiveTask,
      startTaskPolling,
      stopTaskPolling,
    }}>
      {children}
    </BackgroundTasksContext.Provider>
  );
}

export function useBackgroundTasks() {
  const context = useContext(BackgroundTasksContext);
  if (!context) {
    throw new Error('useBackgroundTasks must be used within a BackgroundTasksProvider');
  }
  return context;
}
