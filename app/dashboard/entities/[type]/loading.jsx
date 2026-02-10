import { PageHeaderSkeleton, StatsGridSkeleton, TableSkeleton } from '@/app/dashboard/components';

export default function Loading() {
  return (
    <>
      <PageHeaderSkeleton />
      <StatsGridSkeleton count={5} />
      <TableSkeleton rows={8} columns={4} hasCheckbox />
    </>
  );
}
