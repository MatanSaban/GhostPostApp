import {
  PageHeaderSkeleton,
  Skeleton,
  DashboardCardSkeleton,
  ChartSkeleton,
  ContentGridSkeleton,
  ActivityListSkeleton,
} from '../components';

export default function SiteAuditLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <PageHeaderSkeleton hasActions />

      {/* Performance Score Card */}
      <DashboardCardSkeleton>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '2rem 0' }}>
          <Skeleton width="12rem" height="12rem" borderRadius="full" />
          <Skeleton width="16rem" height="1.5rem" borderRadius="md" />
          <Skeleton width="20rem" height="1rem" borderRadius="md" />
        </div>
      </DashboardCardSkeleton>

      {/* Core Web Vitals Grid */}
      <DashboardCardSkeleton hasTitle>
        <ContentGridSkeleton count={6} columns={3} />
      </DashboardCardSkeleton>

      {/* Performance Trend */}
      <DashboardCardSkeleton hasTitle hasSubtitle>
        <ChartSkeleton height="200px" />
      </DashboardCardSkeleton>

      {/* Recommendations */}
      <DashboardCardSkeleton hasTitle>
        <ActivityListSkeleton count={3} />
      </DashboardCardSkeleton>
    </div>
  );
}
