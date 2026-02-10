import {
  PageHeaderSkeleton,
  Skeleton,
  DashboardCardSkeleton,
  FormSkeleton,
} from '../../components';

export default function AIContentWizardLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <PageHeaderSkeleton />

      {/* Wizard steps indicator */}
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', padding: '1rem 0' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Skeleton width="2.5rem" height="2.5rem" borderRadius="full" />
            <Skeleton width="4rem" height="0.75rem" borderRadius="md" />
          </div>
        ))}
      </div>

      {/* Wizard content area */}
      <DashboardCardSkeleton hasTitle hasSubtitle>
        <FormSkeleton fields={4} columns={1} />
      </DashboardCardSkeleton>

      {/* Navigation buttons */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
        <Skeleton width="6rem" height="2.5rem" borderRadius="md" />
        <Skeleton width="6rem" height="2.5rem" borderRadius="md" />
      </div>
    </div>
  );
}
