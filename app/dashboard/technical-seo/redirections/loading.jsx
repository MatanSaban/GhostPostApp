import {
  PageHeaderSkeleton,
  StatsGridSkeleton,
  DashboardCardSkeleton,
  FormSkeleton,
  TableSkeleton,
} from '../../components';

export default function RedirectionsLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <PageHeaderSkeleton />

      <StatsGridSkeleton count={4} />

      {/* Create Redirect Form */}
      <DashboardCardSkeleton hasTitle>
        <FormSkeleton fields={3} columns={3} />
      </DashboardCardSkeleton>

      {/* Redirects Table */}
      <TableSkeleton rows={5} columns={5} />
    </div>
  );
}
