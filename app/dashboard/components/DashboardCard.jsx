import styles from './shared.module.css';

export function DashboardCard({ title, subtitle, children, className = '' }) {
  return (
    <div className={`${styles.dashboardCard} ${className}`}>
      <div className={styles.dashboardCardGlow} />
      <div className={styles.dashboardCardContent}>
        {title && <h3 className={styles.dashboardCardTitle}>{title}</h3>}
        {subtitle && <p className={styles.dashboardCardSubtitle}>{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

export default DashboardCard;
