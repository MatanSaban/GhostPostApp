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

  return (
    <BackgroundTasksContext.Provider value={{ 
      tasks, 
      addTask, 
      updateTask, 
      removeTask, 
      cancelTask,
      getTask 
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
