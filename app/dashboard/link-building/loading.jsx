import {
  PageHeaderSkeleton,
  StatsGridSkeleton,
  DashboardCardSkeleton,
  ActivityListSkeleton,
  TableSkeleton,
} from '../components';

export default function LinkBuildingLoading() {
  return (
    <>
      <PageHeaderSkeleton hasActions />

      <StatsGridSkeleton count={4} />

      {/* Main Grid: Opportunities + Backlinks */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        <DashboardCardSkeleton hasTitle hasSubtitle>
          <ActivityListSkeleton count={4} />
        </DashboardCardSkeleton>

        <TableSkeleton rows={4} columns={4} hasActions={false} />
      </div>
    </>
  );
}
