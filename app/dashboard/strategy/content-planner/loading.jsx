import {
  PageHeaderSkeleton,
  StatsGridSkeleton,
  DashboardCardSkeleton,
  Skeleton,
} from '../../components';

export default function ContentPlannerLoading() {
  return (
    <>
      <PageHeaderSkeleton hasActions />

      <StatsGridSkeleton count={4} />

      {/* Calendar/List View Placeholder */}
      <DashboardCardSkeleton hasTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* View toggle pills */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Skeleton width="5rem" height="2rem" borderRadius="full" />
            <Skeleton width="5rem" height="2rem" borderRadius="full" />
          </div>
          {/* Calendar grid placeholder */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.5rem' }}>
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={`h${i}`} width="100%" height="1.5rem" borderRadius="md" />
            ))}
            {Array.from({ length: 35 }).map((_, i) => (
              <Skeleton key={i} width="100%" height="4rem" borderRadius="md" />
            ))}
          </div>
        </div>
      </DashboardCardSkeleton>
    </>
  );
}
