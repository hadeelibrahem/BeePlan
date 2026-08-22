import { Injectable } from '@nestjs/common';
import { and, desc, eq, gt, inArray, notInArray, sql } from 'drizzle-orm';
import { DatabaseService } from '../../db/database.service';
import {
  challenges,
  errorGroups,
  feedbackClusters,
  feedbackItems,
  pushNotificationJobs,
  userChallengeProgress,
  userReports,
} from '../../db/schema';

export type AdminActionSeverity = 'critical' | 'high' | 'medium' | 'low';
export type AdminActionItem = {
  id: string;
  type: 'error' | 'report' | 'feedback' | 'feedback_theme' | 'challenge' | 'push_job';
  severity: AdminActionSeverity;
  title: string;
  description: string;
  count?: number;
  targetUrl?: string;
  actionLabel?: string;
  detectedAt: string;
};

/** Database drivers may return timestamp columns as Date, ISO strings, or timestamp-like strings. */
export function toIsoTimestamp(value: Date | string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const severityRank: Record<AdminActionSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};
const plural = (count: number, singular: string, pluralValue = `${singular}s`) =>
  count === 1 ? singular : pluralValue;

/** Sort is deliberately centralized so every Action Center consumer gets one stable order. */
export function sortActionItems(items: AdminActionItem[]) {
  return [...items].sort(
    (a, b) =>
      severityRank[a.severity] - severityRank[b.severity] ||
      (Date.parse(b.detectedAt) || 0) - (Date.parse(a.detectedAt) || 0) ||
      a.id.localeCompare(b.id),
  );
}

@Injectable()
export class AdminActionCenterService {
  constructor(private readonly database: DatabaseService) {}

  async list(now = new Date()): Promise<{ items: AdminActionItem[] }> {
    const endingSoon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const meaningfulProgressAt = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const [errors, reports, feedback, themes, pushes, activeChallenges] = await Promise.all([
      this.database.db
        .select({
          severity: errorGroups.severity,
          count: sql<number>`count(*)`,
          detectedAt: sql<Date>`max(${errorGroups.lastSeenAt})`,
        })
        .from(errorGroups)
        .where(and(inArray(errorGroups.severity, ['critical', 'high']), notInArray(errorGroups.status, ['resolved', 'ignored'])))
        .groupBy(errorGroups.severity),
      this.database.db
        .select({ count: sql<number>`count(*)`, detectedAt: sql<Date>`max(${userReports.createdAt})` })
        .from(userReports)
        .where(inArray(userReports.status, ['pending', 'under_review'])),
      this.database.db
        .select({ count: sql<number>`count(*)`, detectedAt: sql<Date>`max(${feedbackItems.createdAt})` })
        .from(feedbackItems)
        .where(eq(feedbackItems.status, 'submitted')),
      this.database.db
        .select({ count: sql<number>`count(*)`, detectedAt: sql<Date>`max(${feedbackClusters.lastAnalyzedAt})` })
        .from(feedbackClusters)
        .where(eq(feedbackClusters.status, 'active')),
      this.database.db
        .select({ count: sql<number>`count(*)`, detectedAt: sql<Date>`max(${pushNotificationJobs.updatedAt})` })
        .from(pushNotificationJobs)
        .where(eq(pushNotificationJobs.status, 'failed')),
      this.database.db
        .select({
          id: challenges.id,
          title: challenges.title,
          startAt: challenges.startAt,
          endAt: challenges.endAt,
          participants: sql<number>`count(*) filter (where ${userChallengeProgress.progressValue} > 0)`,
          completed: sql<number>`count(*) filter (where ${userChallengeProgress.completedAt} is not null)`,
        })
        .from(challenges)
        .leftJoin(userChallengeProgress, eq(userChallengeProgress.challengeId, challenges.id))
        .where(and(eq(challenges.status, 'active'), gt(challenges.endAt, now)))
        .groupBy(challenges.id)
        .orderBy(desc(challenges.endAt)),
    ]);

    const items: AdminActionItem[] = [];
    for (const row of errors) {
      const count = Number(row.count);
      const detectedAt = toIsoTimestamp(row.detectedAt);
      if (!count || !detectedAt) continue;
      const severity = row.severity as 'critical' | 'high';
      items.push({
        id: `${severity}-errors`, type: 'error', severity, count,
        title: `${count} ${severity === 'high' ? 'high-severity ' : ''}${plural(count, 'error')} require review`,
        description: severity === 'critical' ? 'Critical server failures are currently unresolved.' : 'Open issues need investigation.',
        targetUrl: `/admin/errors?severity=${severity}`,
        actionLabel: 'View errors', detectedAt,
      });
    }
    const report = reports[0];
    const reportDetectedAt = toIsoTimestamp(report?.detectedAt);
    if (Number(report?.count) && reportDetectedAt) items.push({ id: 'pending-reports', type: 'report', severity: 'medium', count: Number(report.count), title: `${report.count} user ${plural(Number(report.count), 'report')} ${Number(report.count) === 1 ? 'is' : 'are'} waiting for review`, description: 'User reports require a moderation decision.', targetUrl: '/admin/reports', actionLabel: 'Review reports', detectedAt: reportDetectedAt });
    const submitted = feedback[0];
    const feedbackDetectedAt = toIsoTimestamp(submitted?.detectedAt);
    if (Number(submitted?.count) && feedbackDetectedAt) items.push({ id: 'submitted-feedback', type: 'feedback', severity: 'low', count: Number(submitted.count), title: `${submitted.count} ${plural(Number(submitted.count), 'idea')} ${Number(submitted.count) === 1 ? 'is' : 'are'} waiting for review`, description: 'New feedback is ready for product review.', targetUrl: '/admin/feedback?status=submitted', actionLabel: 'Review feedback', detectedAt: feedbackDetectedAt });
    const theme = themes[0];
    const themeDetectedAt = toIsoTimestamp(theme?.detectedAt);
    if (Number(theme?.count) && themeDetectedAt) items.push({ id: 'active-feedback-themes', type: 'feedback_theme', severity: 'low', count: Number(theme.count), title: `${theme.count} AI feedback ${plural(Number(theme.count), 'theme')} ${Number(theme.count) === 1 ? 'is' : 'are'} available`, description: 'Repeated user requests were detected.', targetUrl: '/admin/feedback/clusters', actionLabel: 'View AI Themes', detectedAt: themeDetectedAt });
    const push = pushes[0];
    const pushDetectedAt = toIsoTimestamp(push?.detectedAt);
    if (Number(push?.count) && pushDetectedAt) items.push({ id: 'failed-push-jobs', type: 'push_job', severity: 'high', count: Number(push.count), title: `${push.count} push notification ${plural(Number(push.count), 'delivery', 'deliveries')} failed`, description: 'Some notifications could not be delivered.', detectedAt: pushDetectedAt });

    for (const challenge of activeChallenges) {
      const startAt = toIsoTimestamp(challenge.startAt);
      const endAt = toIsoTimestamp(challenge.endAt);
      if (!startAt || !endAt) continue;
      const startDate = new Date(startAt);
      const endDate = new Date(endAt);
      const participants = Number(challenge.participants);
      const completed = Number(challenge.completed);
      const isEndingSoon = endDate > now && endDate <= endingSoon;
      // Low completion needs a meaningful cohort and two full days of participation.
      const lowCompletion = startDate <= meaningfulProgressAt && participants >= 10 && completed / participants <= 0.2;
      if (!isEndingSoon && !lowCompletion) continue;
      items.push(isEndingSoon ? {
        id: `challenge-ending-${challenge.id}`, type: 'challenge', severity: 'high', title: `Challenge ending soon: ${challenge.title}`, description: `${Math.max(1, Math.ceil((endDate.getTime() - now.getTime()) / 3_600_000))} hours remaining.`, targetUrl: '/admin/challenges', actionLabel: 'View challenge', detectedAt: endAt,
      } : {
        id: `challenge-low-completion-${challenge.id}`, type: 'challenge', severity: 'medium', title: `Low challenge completion: ${challenge.title}`, description: `Only ${Math.round((completed / participants) * 100)}% of ${participants} participants have completed it.`, targetUrl: '/admin/challenges', actionLabel: 'Review challenge', detectedAt: startAt,
      });
    }
    return { items: sortActionItems(items) };
  }
}
