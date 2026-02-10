import {
  PageHeaderSkeleton,
  StatsGridSkeleton,
  DashboardCardSkeleton,
  ContentGridSkeleton,
  TableSkeleton,
} from '../../components';

export default function KeywordsLoading() {
  return (
    <>
      <PageHeaderSkeleton hasActions />

      <StatsGridSkeleton count={4} />

      {/* Opportunities Grid */}
      <DashboardCardSkeleton hasTitle hasSubtitle>
        <ContentGridSkeleton count={6} columns={3} />
      </DashboardCardSkeleton>

      {/* Rankings Table */}
      <TableSkeleton rows={5} columns={5} hasActions={false} />
    </>
  );
}
