import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import type { TaskAssistantPreferences } from './task-assistant.types';
import type { TimelineDraft } from './context-timeline.engine';

export const NOTIFICATION_POLICY = {
  smart: 3,
  minimal: 2,
  important_only: 3,
} as const;
export type ContextNotificationDraft = {
  notificationType: string;
  title: string;
  body: string;
  scheduledAt: Date;
  priority: string;
  fingerprint: string;
};

@Injectable()
export class ContextualNotificationEngine {
  generate(
    userId: string,
    taskId: string,
    scheduleVersion: string,
    stages: TimelineDraft[],
    preferences: TaskAssistantPreferences,
  ): ContextNotificationDraft[] {
    if (
      !preferences.contextualNotificationsEnabled ||
      !preferences.proactiveAssistanceEnabled
    )
      return [];
    const eligible = stages
      .filter(
        (stage): stage is TimelineDraft & { scheduledAt: Date } =>
          stage.status === 'pending' && Boolean(stage.scheduledAt),
      )
      .filter(
        (stage) =>
          preferences.notificationMode !== 'important_only' ||
          ['critical', 'high'].includes(stage.priority),
      )
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
      .slice(0, NOTIFICATION_POLICY[preferences.notificationMode]);
    return eligible.map((stage) => ({
      notificationType: stage.stageType,
      title: 'Task Assistant',
      body: stage.title,
      scheduledAt: stage.scheduledAt,
      priority: stage.priority,
      fingerprint: createHash('sha256')
        .update(
          `${userId}|${taskId}|${scheduleVersion}|${stage.stageType}|${stage.scheduledAt.toISOString()}`,
        )
        .digest('hex'),
    }));
  }
}
