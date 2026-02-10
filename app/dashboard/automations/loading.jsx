import {
  PageHeaderSkeleton,
  StatsGridSkeleton,
  DashboardCardSkeleton,
  ContentGridSkeleton,
  ActivityListSkeleton,
} from '../components';

export default function AutomationsLoading() {
  return (
    <>
      <PageHeaderSkeleton hasActions />

      <StatsGridSkeleton count={4} />

      {/* Automations Cards */}
      <ContentGridSkeleton count={4} columns={2} />

      {/* Activity Log */}
      <DashboardCardSkeleton hasTitle>
        <ActivityListSkeleton count={4} />
      </DashboardCardSkeleton>
    </>
  );
}
