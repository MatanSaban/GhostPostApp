import styles from './shared.module.css';

export function DashboardCard({ title, subtitle, headerRight, children, className = '' }) {
  return (
    <div className={`${styles.dashboardCard} ${className}`}>
      <div className={styles.dashboardCardGlow} />
      <div className={styles.dashboardCardContent}>
        {(title || headerRight) && (
          <div className={styles.dashboardCardHeader}>
            {title && <h3 className={styles.dashboardCardTitle}>{title}</h3>}
            {headerRight && <div className={styles.dashboardCardHeaderRight}>{headerRight}</div>}
          </div>
        )}
        {subtitle && <p className={styles.dashboardCardSubtitle}>{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

export default DashboardCard;
