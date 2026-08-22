import { buildAdminAttentionItems } from './admin-dashboard.service';

describe('buildAdminAttentionItems', () => {
  const counts = (overrides: Partial<Parameters<typeof buildAdminAttentionItems>[0]> = {}) => ({
    criticalErrors: 0,
    highErrors: 0,
    pendingReports: 0,
    underReviewReports: 0,
    failedPushJobs: 0,
    ...overrides,
  });

  it('returns no items for a healthy state', () => {
    expect(buildAdminAttentionItems(counts())).toEqual([]);
  });

  it('returns unresolved high errors with their filtered destination', () => {
    expect(buildAdminAttentionItems(counts({ highErrors: 2 }))).toMatchObject([
      { id: 'high-errors', count: 2, destination: '/admin/errors?severity=high' },
    ]);
  });

  it('prioritizes critical errors before high errors', () => {
    expect(buildAdminAttentionItems(counts({ criticalErrors: 1, highErrors: 2 })).map((item) => item.id)).toEqual(['critical-errors', 'high-errors']);
  });

  it('includes only actionable report status items', () => {
    expect(buildAdminAttentionItems(counts({ pendingReports: 3, underReviewReports: 2 }))).toMatchObject([
      { id: 'pending-reports', count: 3, destination: '/admin/reports?status=pending' },
      { id: 'under-review-reports', count: 2, destination: '/admin/reports?status=under_review' },
    ]);
  });

  it('includes failed jobs and preserves the full operational priority order', () => {
    expect(buildAdminAttentionItems(counts({ criticalErrors: 1, highErrors: 2, pendingReports: 3, underReviewReports: 4, failedPushJobs: 5 })).map((item) => item.id)).toEqual(['critical-errors', 'high-errors', 'pending-reports', 'under-review-reports', 'failed-push-jobs']);
  });
});
