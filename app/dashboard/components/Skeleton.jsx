'use client';

import styles from './Skeleton.module.css';

/**
 * Base Skeleton component - a simple animated placeholder
 * @param {string} width - Width of the skeleton (CSS value)
 * @param {string} height - Height of the skeleton (CSS value)
 * @param {string} borderRadius - Border radius (default: 'md')
 * @param {string} className - Additional CSS classes
 */
export function Skeleton({ 
  width = '100%', 
  height = '1rem', 
  borderRadius = 'md',
  className = '' 
}) {
  const radiusMap = {
    none: '0',
    sm: 'var(--radius-sm)',
    md: 'var(--radius-md)',
    lg: 'var(--radius-lg)',
    xl: 'var(--radius-xl)',
    full: '9999px',
  };

  return (
    <div 
      className={`${styles.skeleton} ${className}`}
      style={{ 
        width, 
        height, 
        borderRadius: radiusMap[borderRadius] || borderRadius 
      }}
    />
  );
}

/**
 * Skeleton for StatsCard component
 */
export function StatsCardSkeleton({ color = 'purple' }) {
  return (
    <div className={`${styles.statsCard} ${styles[color]}`}>
      <div className={styles.statsCardContent}>
        <div className={styles.statsCardHeader}>
          <Skeleton width="3rem" height="3rem" borderRadius="lg" />
          <Skeleton width="3rem" height="1.5rem" borderRadius="full" />
        </div>
        <Skeleton width="60%" height="2rem" className={styles.statsValue} />
        <Skeleton width="80%" height="1rem" />
      </div>
    </div>
  );
}

/**
 * Skeleton for DashboardCard component
 */
export function DashboardCardSkeleton({ 
  hasTitle = true, 
  hasSubtitle = false,
  children,
  height = 'auto',
  className = ''
}) {
  return (
    <div className={`${styles.dashboardCard} ${className}`} style={{ height }}>
      <div className={styles.dashboardCardContent}>
        {hasTitle && <Skeleton width="40%" height="1.5rem" className={styles.cardTitle} />}
        {hasSubtitle && <Skeleton width="60%" height="1rem" className={styles.cardSubtitle} />}
        {children}
      </div>
    </div>
  );
}

/**
 * Skeleton for a single table row
 */
export function TableRowSkeleton({ columns = 4, hasCheckbox = false, hasActions = true }) {
  // Create consistent widths per column position for a more polished look
  const getColumnWidth = (index) => {
    const widths = ['75%', '55%', '45%', '65%', '40%', '50%', '60%'];
    return widths[index % widths.length];
  };

  return (
    <tr className={styles.tableRow}>
      {hasCheckbox && (
        <td className={styles.checkboxCell}>
          <Skeleton width="1.125rem" height="1.125rem" borderRadius="sm" />
        </td>
      )}
      {Array.from({ length: columns - (hasActions ? 1 : 0) }).map((_, i) => (
        <td key={i} className={styles.tableCell}>
          {i === 0 ? (
            <div className={styles.titleCell}>
              <Skeleton width="80%" height="0.9375rem" />
              <Skeleton width="55%" height="0.6875rem" />
            </div>
          ) : (
            <Skeleton width={getColumnWidth(i)} height="0.875rem" />
          )}
        </td>
      ))}
      {hasActions && (
        <td className={styles.actionsCell}>
          <div className={styles.actionButtons}>
            <Skeleton width="1.75rem" height="1.75rem" borderRadius="md" />
            <Skeleton width="1.75rem" height="1.75rem" borderRadius="md" />
          </div>
        </td>
      )}
    </tr>
  );
}

/**
 * Skeleton for a table with header and rows
 */
export function TableSkeleton({ 
  rows = 5, 
  columns = 4, 
  hasCheckbox = false, 
  hasActions = true,
  hasHeader = true,
  className = ''
}) {
  return (
    <div className={`${styles.tableCard} ${className}`}>
      {hasHeader && (
        <div className={styles.tableHeader}>
          <Skeleton width="30%" height="1.25rem" />
          <div className={styles.tableHeaderActions}>
            <Skeleton width="12rem" height="2.25rem" borderRadius="md" />
            <Skeleton width="8rem" height="2.25rem" borderRadius="md" />
          </div>
        </div>
      )}
      <table className={styles.table}>
        <thead>
          <tr>
            {hasCheckbox && (
              <th className={styles.checkboxCell}>
                <Skeleton width="1.25rem" height="1.25rem" borderRadius="sm" />
              </th>
            )}
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i} className={styles.tableHeaderCell}>
                <Skeleton width={`${40 + Math.random() * 40}%`} height="0.875rem" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <TableRowSkeleton 
              key={i} 
              columns={columns} 
              hasCheckbox={hasCheckbox} 
              hasActions={hasActions}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Skeleton for ActivityItem component
 */
export function ActivityItemSkeleton() {
  return (
    <div className={styles.activityItem}>
      <div className={styles.activityContent}>
        <Skeleton width="0.5rem" height="0.5rem" borderRadius="full" />
        <Skeleton width="70%" height="1rem" />
      </div>
      <Skeleton width="4rem" height="0.875rem" />
    </div>
  );
}

/**
 * Skeleton for a list of activity items
 */
export function ActivityListSkeleton({ count = 4 }) {
  return (
    <div className={styles.activityList}>
      {Array.from({ length: count }).map((_, i) => (
        <ActivityItemSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * Skeleton for PageHeader component
 */
export function PageHeaderSkeleton({ hasSubtitle = true, hasActions = false }) {
  return (
    <div className={styles.pageHeader}>
      <div className={styles.pageHeaderContent}>
        <Skeleton width="40%" height="2rem" />
        {hasSubtitle && <Skeleton width="60%" height="1rem" className={styles.subtitle} />}
      </div>
      {hasActions && (
        <div className={styles.pageHeaderActions}>
          <Skeleton width="8rem" height="2.5rem" borderRadius="md" />
        </div>
      )}
    </div>
  );
}

/**
 * Skeleton for a grid of stats cards
 */
export function StatsGridSkeleton({ count = 4, color = 'purple' }) {
  return (
    <div className={styles.statsGrid}>
      {Array.from({ length: count }).map((_, i) => (
        <StatsCardSkeleton key={i} color={color} />
      ))}
    </div>
  );
}

/**
 * Skeleton for chart placeholder
 */
export function ChartSkeleton({ height = '300px' }) {
  return (
    <div className={styles.chartSkeleton} style={{ height }}>
      <div className={styles.chartBars}>
        {Array.from({ length: 12 }).map((_, i) => (
          <div 
            key={i} 
            className={styles.chartBar}
            style={{ height: `${20 + Math.random() * 60}%` }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton for ProgressBar component
 */
export function ProgressBarSkeleton() {
  return (
    <div className={styles.progressBarWrapper}>
      <div className={styles.progressBarHeader}>
        <Skeleton width="40%" height="0.875rem" />
        <Skeleton width="3rem" height="0.875rem" />
      </div>
      <Skeleton width="100%" height="0.5rem" borderRadius="full" />
    </div>
  );
}

/**
 * Skeleton for a list of progress bars
 */
export function ProgressListSkeleton({ count = 3 }) {
  return (
    <div className={styles.progressList}>
      {Array.from({ length: count }).map((_, i) => (
        <ProgressBarSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * Skeleton for form fields
 */
export function FormFieldSkeleton({ hasLabel = true }) {
  return (
    <div className={styles.formField}>
      {hasLabel && <Skeleton width="30%" height="0.875rem" className={styles.formLabel} />}
      <Skeleton width="100%" height="2.5rem" borderRadius="md" />
    </div>
  );
}

/**
 * Skeleton for a form with multiple fields
 */
export function FormSkeleton({ fields = 4, columns = 1 }) {
  return (
    <div className={`${styles.formGrid} ${styles[`cols${columns}`]}`}>
      {Array.from({ length: fields }).map((_, i) => (
        <FormFieldSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * Skeleton for settings form section (used within settings tabs)
 */
export function SettingsFormSkeleton({ fields = 6 }) {
  return (
    <div className={styles.settingsFormSkeleton}>
      <FormSkeleton fields={fields} columns={2} />
      <div className={styles.settingsFormActions}>
        <Skeleton width="100px" height="40px" borderRadius="md" />
      </div>
    </div>
  );
}

/**
 * Skeleton for QuickActions component
 */
export function QuickActionsSkeleton({ count = 3 }) {
  return (
    <div className={styles.quickActions}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={styles.quickActionItem}>
          <Skeleton width="2.5rem" height="2.5rem" borderRadius="lg" />
          <Skeleton width="60%" height="0.875rem" />
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton for entity/content card in a grid
 */
export function ContentCardSkeleton() {
  return (
    <div className={styles.contentCard}>
      <Skeleton width="100%" height="10rem" borderRadius="lg" className={styles.contentCardImage} />
      <div className={styles.contentCardBody}>
        <Skeleton width="80%" height="1.125rem" />
        <Skeleton width="100%" height="0.875rem" />
        <Skeleton width="60%" height="0.875rem" />
      </div>
      <div className={styles.contentCardFooter}>
        <Skeleton width="4rem" height="1.5rem" borderRadius="full" />
        <Skeleton width="5rem" height="0.875rem" />
      </div>
    </div>
  );
}

/**
 * Skeleton for a grid of content cards
 */
export function ContentGridSkeleton({ count = 6, columns = 3 }) {
  return (
    <div className={`${styles.contentGrid} ${styles[`gridCols${columns}`]}`}>
      {Array.from({ length: count }).map((_, i) => (
        <ContentCardSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * Skeleton for sidebar/navigation item
 */
export function NavItemSkeleton() {
  return (
    <div className={styles.navItem}>
      <Skeleton width="1.25rem" height="1.25rem" borderRadius="sm" />
      <Skeleton width="70%" height="0.875rem" />
    </div>
  );
}

/**
 * Skeleton for detail page with sidebar
 */
export function DetailPageSkeleton() {
  return (
    <div className={styles.detailPage}>
      <div className={styles.detailMain}>
        <PageHeaderSkeleton hasActions />
        <DashboardCardSkeleton hasTitle>
          <FormSkeleton fields={6} columns={2} />
        </DashboardCardSkeleton>
      </div>
      <div className={styles.detailSidebar}>
        <DashboardCardSkeleton hasTitle>
          <div className={styles.sidebarContent}>
            <Skeleton width="100%" height="10rem" borderRadius="lg" />
            <Skeleton width="80%" height="1rem" />
            <Skeleton width="60%" height="0.875rem" />
          </div>
        </DashboardCardSkeleton>
      </div>
    </div>
  );
}

/**
 * Skeleton for the main dashboard page
 */
export function DashboardPageSkeleton() {
  return (
    <div className={styles.dashboardPage}>
      <PageHeaderSkeleton />
      <StatsGridSkeleton count={4} />
      <div className={styles.mainGrid}>
        <div className={styles.leftColumn}>
          <DashboardCardSkeleton hasTitle>
            <ChartSkeleton />
          </DashboardCardSkeleton>
          <DashboardCardSkeleton hasTitle>
            <ProgressListSkeleton count={4} />
          </DashboardCardSkeleton>
        </div>
        <div className={styles.rightColumn}>
          <DashboardCardSkeleton hasTitle>
            <ActivityListSkeleton count={4} />
          </DashboardCardSkeleton>
          <DashboardCardSkeleton hasTitle>
            <QuickActionsSkeleton count={3} />
          </DashboardCardSkeleton>
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton for entities list page
 */
export function EntitiesPageSkeleton() {
  return (
    <div className={styles.entitiesPage}>
      <PageHeaderSkeleton />
      <StatsGridSkeleton count={5} />
      <TableSkeleton rows={8} columns={4} hasCheckbox />
    </div>
  );
}

/**
 * Skeleton for entity detail/edit page
 */
export function EntityDetailSkeleton() {
  return (
    <div className={styles.entityDetail}>
      {/* Header skeleton */}
      <div className={styles.entityDetailHeader}>
        <div className={styles.entityDetailHeaderLeft}>
          <Skeleton width="2.5rem" height="2.5rem" borderRadius="md" />
          <div className={styles.entityDetailHeaderInfo}>
            <Skeleton width="250px" height="1.5rem" borderRadius="sm" />
            <Skeleton width="150px" height="1rem" borderRadius="sm" />
          </div>
        </div>
        <div className={styles.entityDetailHeaderActions}>
          <Skeleton width="120px" height="2.5rem" borderRadius="md" />
          <Skeleton width="100px" height="2.5rem" borderRadius="md" />
        </div>
      </div>
      
      {/* Tabs skeleton */}
      <div className={styles.entityDetailTabs}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} width="100px" height="2.5rem" borderRadius="md" />
        ))}
      </div>
      
      {/* Content skeleton */}
      <div className={styles.entityDetailContent}>
        <DashboardCardSkeleton hasTitle>
          <FormSkeleton fields={3} />
        </DashboardCardSkeleton>
        <DashboardCardSkeleton hasTitle>
          <Skeleton width="100%" height="15rem" borderRadius="md" />
        </DashboardCardSkeleton>
      </div>
    </div>
  );
}

/**
 * Skeleton for settings page
 */
export function SettingsPageSkeleton() {
  return (
    <div className={styles.settingsPage}>
      <PageHeaderSkeleton />
      <div className={styles.settingsGrid}>
        <div className={styles.settingsSidebar}>
          {Array.from({ length: 6 }).map((_, i) => (
            <NavItemSkeleton key={i} />
          ))}
        </div>
        <div className={styles.settingsContent}>
          <DashboardCardSkeleton hasTitle hasSubtitle>
            <FormSkeleton fields={6} columns={2} />
          </DashboardCardSkeleton>
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton for admin pages (users, accounts, plans, etc.)
 */
export function AdminPageSkeleton({ statsCount = 3, columns = 5 }) {
  return (
    <div className={styles.adminPage}>
      <PageHeaderSkeleton hasSubtitle />
      <StatsGridSkeleton count={statsCount} />
      <div className={styles.adminToolbar}>
        <Skeleton width="200px" height="40px" borderRadius="md" />
        <div className={styles.adminToolbarRight}>
          <Skeleton width="100px" height="36px" borderRadius="md" />
          <Skeleton width="36px" height="36px" borderRadius="md" />
          <Skeleton width="120px" height="36px" borderRadius="md" />
        </div>
      </div>
      <TableSkeleton rows={8} columns={columns} hasActions />
    </div>
  );
}

/**
 * Skeleton for admin table loading (when just refreshing data)
 */
export function AdminTableSkeleton({ rows = 8, columns = 5 }) {
  return (
    <div className={styles.adminTableLoading}>
      <TableSkeleton rows={rows} columns={columns} hasActions />
    </div>
  );
}

/**
 * Skeleton for My Websites page
 * Shows toolbar skeleton + table rows skeleton (default) or card grid skeleton
 */
export function MyWebsitesPageSkeleton() {
  return (
    <div className={styles.myWebsitesPage}>
      <PageHeaderSkeleton hasSubtitle />
      {/* Toolbar skeleton */}
      <div className={styles.myWebsitesToolbar}>
        <Skeleton width="280px" height="2.25rem" borderRadius="md" />
        <Skeleton width="5rem" height="2.25rem" borderRadius="md" />
      </div>
      {/* Table skeleton */}
      <div className={styles.myWebsitesTable}>
        <div className={styles.myWebsitesTableHead}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} width={`${40 + Math.random() * 40}%`} height="0.75rem" />
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={styles.myWebsitesTableRow}>
            <div className={styles.myWebsitesTableCell}>
              <Skeleton width="1rem" height="1rem" borderRadius="full" />
              <Skeleton width="60%" height="0.875rem" />
            </div>
            <Skeleton width="55%" height="0.875rem" />
            <Skeleton width="45%" height="0.875rem" />
            <Skeleton width="5rem" height="1.5rem" borderRadius="full" />
            <Skeleton width="50%" height="0.875rem" />
            <div className={styles.myWebsitesTableActions}>
              <Skeleton width="1.75rem" height="1.75rem" borderRadius="md" />
              <Skeleton width="1.75rem" height="1.75rem" borderRadius="md" />
              <Skeleton width="1.75rem" height="1.75rem" borderRadius="md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton for My Websites card grid view
 */
export function MyWebsitesCardsSkeleton({ count = 6 }) {
  return (
    <div className={styles.myWebsitesCards}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={styles.myWebsitesCard}>
          <div className={styles.myWebsitesCardHeader}>
            <div className={styles.myWebsitesCardTitle}>
              <Skeleton width="1.25rem" height="1.25rem" borderRadius="full" />
              <Skeleton width="60%" height="1rem" />
            </div>
            <Skeleton width="5rem" height="1.5rem" borderRadius="full" />
          </div>
          <div className={styles.myWebsitesCardBody}>
            <Skeleton width="80%" height="0.8125rem" />
            <div className={styles.myWebsitesCardMeta}>
              <Skeleton width="4rem" height="0.75rem" />
              <Skeleton width="5rem" height="0.75rem" />
            </div>
          </div>
          <div className={styles.myWebsitesCardFooter}>
            <Skeleton width="5rem" height="2rem" borderRadius="md" />
            <div className={styles.myWebsitesTableActions}>
              <Skeleton width="1.75rem" height="1.75rem" borderRadius="md" />
              <Skeleton width="1.75rem" height="1.75rem" borderRadius="md" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default Skeleton;
