import styles from './shared.module.css';

export function ActivityItem({ dotColor = 'success', text, time }) {
  return (
    <div className={styles.activityItem}>
      <div className={styles.activityContent}>
        <div className={`${styles.activityDot} ${styles[dotColor]}`} />
        <span className={styles.activityText}>{text}</span>
      </div>
      <span className={styles.activityTime}>{time}</span>
    </div>
  );
}

export default ActivityItem;
