import { AdminPageSkeleton } from '@/app/dashboard/components';

export default function Loading() {
  return <AdminPageSkeleton statsCount={5} columns={8} />;
}
