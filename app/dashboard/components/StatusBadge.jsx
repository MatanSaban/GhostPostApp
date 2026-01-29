import styles from './shared.module.css';

export function StatusBadge({ status, children }) {
  const statusClass = {
    active: styles.active,
    pending: styles.pending,
    paused: styles.paused,
    error: styles.error,
    complete: styles.complete,
    'in-progress': styles.inProgress,
  }[status] || styles.pending;

  const showPulse = status === 'active' || status === 'in-progress';

  return (
    <span className={`${styles.statusBadge} ${statusClass}`}>
      <span className={`${styles.statusDot} ${showPulse ? styles.pulse : ''}`} />
      {children}
    </span>
  );
}

export default StatusBadge;
