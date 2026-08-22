/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable } from '@nestjs/common';
import { eq, gte, sql } from 'drizzle-orm';
import { DatabaseService } from '../../db/database.service';
import {
  errorGroups,
  errorOccurrences,
  feedbackItems,
  pushNotificationJobs,
  userReports,
  users,
} from '../../db/schema';

export type AdminAttentionItem = {
  id: 'critical-errors' | 'high-errors' | 'pending-reports' | 'under-review-reports' | 'failed-push-jobs' | 'submitted-feedback';
  type: 'error' | 'report' | 'push_job' | 'feedback';
  severity: 'critical' | 'high' | 'medium' | 'info';
  title: string;
  description: string;
  count: number;
  destination?: string;
};

type AttentionCounts = {
  criticalErrors: number;
  highErrors: number;
  pendingReports: number;
  underReviewReports: number;
  failedPushJobs: number;
  submittedFeedback: number;
};

const plural = (count: number, singular: string, pluralValue = `${singular}s`) =>
  count === 1 ? singular : pluralValue;

/** The sole priority definition for Admin dashboard operational attention. */
export function buildAdminAttentionItems(counts: AttentionCounts): AdminAttentionItem[] {
  const items: AdminAttentionItem[] = [];
  if (counts.criticalErrors > 0) items.push({ id: 'critical-errors', type: 'error', severity: 'critical', count: counts.criticalErrors, title: `${counts.criticalErrors} critical ${plural(counts.criticalErrors, 'error')} ${counts.criticalErrors === 1 ? 'requires' : 'require'} immediate review`, description: 'A critical server failure is currently unresolved.', destination: '/admin/errors?severity=critical' });
  if (counts.highErrors > 0) items.push({ id: 'high-errors', type: 'error', severity: 'high', count: counts.highErrors, title: `${counts.highErrors} high-severity ${plural(counts.highErrors, 'error')} require review`, description: 'Open issues need investigation.', destination: '/admin/errors?severity=high' });
  if (counts.pendingReports > 0) items.push({ id: 'pending-reports', type: 'report', severity: 'medium', count: counts.pendingReports, title: `${counts.pendingReports} ${plural(counts.pendingReports, 'report')} awaiting review`, description: 'Community reports are waiting for moderation.', destination: '/admin/reports?status=pending' });
  if (counts.underReviewReports > 0) items.push({ id: 'under-review-reports', type: 'report', severity: 'medium', count: counts.underReviewReports, title: `${counts.underReviewReports} ${plural(counts.underReviewReports, 'report')} currently under review`, description: 'Community reports are being moderated.', destination: '/admin/reports?status=under_review' });
  if (counts.failedPushJobs > 0) items.push({ id: 'failed-push-jobs', type: 'push_job', severity: 'high', count: counts.failedPushJobs, title: `${counts.failedPushJobs} notification ${plural(counts.failedPushJobs, 'delivery', 'deliveries')} failed`, description: 'Some push notifications could not be delivered.' });
  if (counts.submittedFeedback > 0) items.push({ id: 'submitted-feedback', type: 'feedback', severity: 'info', count: counts.submittedFeedback, title: `${counts.submittedFeedback} feedback ${plural(counts.submittedFeedback, 'item')} awaiting review`, description: 'New user ideas are ready for product review.', destination: '/admin/feedback?status=submitted' });
  return items;
}
@Injectable()
export class AdminDashboardService {
  constructor(private readonly database: DatabaseService) {}
  async summary() {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [userCounts, pushCounts, errorCounts, reportCounts, feedbackCounts] = await Promise.all([
      this.database.db
        .select({
          totalUsers: sql<number>`count(*)`,
          newUsersRecently: sql<number>`count(*) filter (where ${users.createdAt} >= ${since})`,
          activeAccounts: sql<number>`count(*) filter (where ${users.accountStatus} = 'active')`,
          suspendedAccounts: sql<number>`count(*) filter (where ${users.accountStatus} = 'suspended')`,
          admins: sql<number>`count(*) filter (where ${users.role} = 'admin')`,
        })
        .from(users),
      this.database.db
        .select({
          pendingPushJobs: sql<number>`count(*) filter (where ${pushNotificationJobs.status} = 'pending')`,
          failedPushJobs: sql<number>`count(*) filter (where ${pushNotificationJobs.status} = 'failed')`,
        })
        .from(pushNotificationJobs),
      this.database.db
        .select({
          newErrorGroups: sql<number>`count(*) filter (where ${errorGroups.status} = 'new')`,
          criticalHighIssues: sql<number>`count(*) filter (where ${errorGroups.severity} in ('critical', 'high') and ${errorGroups.status} not in ('resolved', 'ignored'))`,
          criticalErrors: sql<number>`count(*) filter (where ${errorGroups.severity} = 'critical' and ${errorGroups.status} not in ('resolved', 'ignored'))`,
          highErrors: sql<number>`count(*) filter (where ${errorGroups.severity} = 'high' and ${errorGroups.status} not in ('resolved', 'ignored'))`,
          errorOccurrences24h: sql<number>`(select count(*) from ${errorOccurrences} where ${errorOccurrences.occurredAt} >= ${dayAgo})`,
          errorAffectedUsers24h: sql<number>`(select count(distinct ${errorOccurrences.userId}) from ${errorOccurrences} where ${errorOccurrences.occurredAt} >= ${dayAgo} and ${errorOccurrences.userId} is not null)`,
        })
        .from(errorGroups),
      this.database.db
        .select({
          pendingReports: sql<number>`count(*) filter (where ${userReports.status} = 'pending')`,
          underReviewReports: sql<number>`count(*) filter (where ${userReports.status} = 'under_review')`,
        })
        .from(userReports),
      this.database.db.select({ submittedFeedback: sql<number>`count(*) filter (where ${feedbackItems.status} = 'submitted')` }).from(feedbackItems),
    ]);
    const normalizedPushCounts = Object.fromEntries(Object.entries(pushCounts[0] ?? {}).map(([key, value]) => [key, Number(value)]));
    const normalizedErrorCounts = Object.fromEntries(Object.entries(errorCounts[0] ?? {}).map(([key, value]) => [key, Number(value)]));
    const normalizedReportCounts = Object.fromEntries(Object.entries(reportCounts[0] ?? {}).map(([key, value]) => [key, Number(value)]));
    const normalizedFeedbackCounts = Object.fromEntries(Object.entries(feedbackCounts[0] ?? {}).map(([key, value]) => [key, Number(value)]));
    return {
      ...Object.fromEntries(
        Object.entries(userCounts[0] ?? {}).map(([key, value]) => [
          key,
          Number(value),
        ]),
      ),
      ...normalizedPushCounts,
      ...normalizedErrorCounts,
      ...normalizedReportCounts,
      ...normalizedFeedbackCounts,
      attentionItems: buildAdminAttentionItems({
        criticalErrors: normalizedErrorCounts.criticalErrors,
        highErrors: normalizedErrorCounts.highErrors,
        pendingReports: normalizedReportCounts.pendingReports,
        underReviewReports: normalizedReportCounts.underReviewReports,
        failedPushJobs: normalizedPushCounts.failedPushJobs,
        submittedFeedback: normalizedFeedbackCounts.submittedFeedback,
      }),
    };
  }
}
