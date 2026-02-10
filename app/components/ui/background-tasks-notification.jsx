'use client';

import { X, Loader2, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import { useBackgroundTasks } from '@/app/context/background-tasks-context';
import { useLocale } from '@/app/context/locale-context';
import styles from './background-tasks-notification.module.css';

/**
 * Persistent notification component for background tasks
 * Shows at the bottom of the screen, allowing users to continue working
 */
export function BackgroundTasksNotification() {
  const { tasks, removeTask, cancelTask } = useBackgroundTasks();
  const { t } = useLocale();

  // Only show running, error, or recently completed tasks
  const visibleTasks = tasks.filter(task => 
    task.status === 'running' || 
    task.status === 'pending' ||
    task.status === 'error' ||
    task.status === 'completed' ||
    task.status === 'cancelled'
  );

  if (visibleTasks.length === 0) {
    return null;
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'running':
      case 'pending':
        return <Loader2 className={styles.spinningIcon} size={18} />;
      case 'completed':
        return <CheckCircle2 className={styles.successIcon} size={18} />;
      case 'error':
        return <AlertCircle className={styles.errorIcon} size={18} />;
      case 'cancelled':
        return <XCircle className={styles.cancelledIcon} size={18} />;
      default:
        return null;
    }
  };

  const getStatusClass = (status) => {
    switch (status) {
      case 'running':
      case 'pending':
        return styles.taskRunning;
      case 'completed':
        return styles.taskCompleted;
      case 'error':
        return styles.taskError;
      case 'cancelled':
        return styles.taskCancelled;
      default:
        return '';
    }
  };

  return (
    <div className={styles.container}>
      {visibleTasks.map(task => (
        <div key={task.id} className={`${styles.task} ${getStatusClass(task.status)}`}>
          <div className={styles.taskHeader}>
            <div className={styles.taskIcon}>
              {getStatusIcon(task.status)}
            </div>
            <div className={styles.taskContent}>
              <span className={styles.taskTitle}>{task.title}</span>
              <span className={styles.taskMessage}>{task.message}</span>
            </div>
            <div className={styles.taskActions}>
              {(task.status === 'running' || task.status === 'pending') && (
                <button 
                  className={styles.cancelButton}
                  onClick={() => cancelTask(task.id)}
                  title={t('common.cancel')}
                >
                  {t('common.cancel')}
                </button>
              )}
              {(task.status === 'completed' || task.status === 'error' || task.status === 'cancelled') && (
                <button 
                  className={styles.dismissButton}
                  onClick={() => removeTask(task.id)}
                  title={t('common.dismiss')}
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>
          {(task.status === 'running' || task.status === 'pending') && task.progress > 0 && (
            <div className={styles.progressContainer}>
              <div 
                className={styles.progressBar} 
                style={{ width: `${task.progress}%` }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
