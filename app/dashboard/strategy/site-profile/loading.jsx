import {
  Skeleton,
  DashboardCardSkeleton,
  FormSkeleton,
} from '../../components';

export default function SiteProfileLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Progress steps */}
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', padding: '1.5rem 0' }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
            <Skeleton width="3rem" height="3rem" borderRadius="full" />
            <Skeleton width="5rem" height="0.75rem" borderRadius="md" />
          </div>
        ))}
      </div>

      {/* Interview section cards */}
      <DashboardCardSkeleton hasTitle hasSubtitle>
        <FormSkeleton fields={3} columns={1} />
      </DashboardCardSkeleton>

      <DashboardCardSkeleton hasTitle hasSubtitle>
        <FormSkeleton fields={3} columns={1} />
      </DashboardCardSkeleton>
    </div>
  );
}
