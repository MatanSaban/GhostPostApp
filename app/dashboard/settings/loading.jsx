import {
  PageHeaderSkeleton,
  Skeleton,
  DashboardCardSkeleton,
  SettingsFormSkeleton,
} from '../components';

export default function SettingsLoading() {
  return (
    <>
      <PageHeaderSkeleton />

      {/* Main category tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <Skeleton width="8rem" height="2.5rem" borderRadius="md" />
        <Skeleton width="8rem" height="2.5rem" borderRadius="md" />
      </div>

      {/* Sub-tab navigation */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} width="6rem" height="2rem" borderRadius="full" />
        ))}
      </div>

      {/* Settings form */}
      <DashboardCardSkeleton hasTitle>
        <SettingsFormSkeleton fields={6} />
      </DashboardCardSkeleton>
    </>
  );
}
